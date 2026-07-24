import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import {
  fetchMatchBootstrap,
  fetchMatchMutableState,
  fetchMatchVersion,
  isPermanentMatchReadError,
  multiplayerError,
  type MatchMutableState,
  type MultiplayerMatch,
} from './multiplayerApi';

export const MATCH_FALLBACK_INTERVAL_MS = 30_000;

type RecoveryReason =
  | 'accepted-command'
  | 'fallback'
  | 'realtime'
  | 'reconnect'
  | 'revision-conflict'
  | 'visibility';

interface MatchSynchronizationOptions {
  client: SupabaseClient<Database>;
  matchId: string;
  install: (match: MultiplayerMatch) => void;
  onError: (error: Error) => void;
  onCompleted?: (match: MultiplayerMatch) => void;
}

/**
 * Coordinates only the reads for one mounted match route. Realtime remains the
 * primary signal; the timer is a disconnected-only metadata safety net.
 */
export class MatchSynchronization {
  private active = true;
  private permanentlyStopped = false;
  private connected = false;
  private receivedRealtimeStatus = false;
  private visible = true;
  private generation = 0;
  private installed: MultiplayerMatch | null = null;
  private bootstrapRequest: Promise<void> | null = null;
  private versionRequest: Promise<void> | null = null;
  private versionFollowUp = false;
  private mutableRequest: Promise<void> | null = null;
  private mutableFollowUp = false;
  private mutableTargetRevision = -1;
  private mutableStatusChanged = false;
  private expectedFingerprint: string | null = null;
  private pendingRealtimeSignal: { revision: number; status: string } | null =
    null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: MatchSynchronizationOptions) {}

  get current(): MultiplayerMatch | null {
    return this.installed;
  }

  bootstrap(): Promise<void> {
    if (!this.active || this.permanentlyStopped) return Promise.resolve();
    if (this.bootstrapRequest) return this.bootstrapRequest;
    const generation = this.generation;
    const request = (async () => {
      try {
        const match = await fetchMatchBootstrap(
          this.options.client,
          this.options.matchId,
        );
        if (!this.isCurrent(generation)) return;
        this.install(match);
        this.startFallbackTimer();
      } catch (error) {
        this.handleReadError(error);
      }
    })().finally(() => {
      if (this.bootstrapRequest === request) this.bootstrapRequest = null;
    });
    this.bootstrapRequest = request;
    return request;
  }

  realtimeChanged(signal: { revision: number; status: string }): void {
    if (!this.canRecover()) return;
    const current = this.installed;
    if (!current) {
      if (
        !this.pendingRealtimeSignal ||
        signal.revision >= this.pendingRealtimeSignal.revision
      ) {
        this.pendingRealtimeSignal = signal;
      }
      return;
    }
    if (
      signal.revision > current.revision ||
      signal.status !== current.status
    ) {
      void this.fetchMutable(
        signal.revision,
        signal.status !== current.status,
        'realtime',
      );
    }
  }

  realtimeStatus(status: string): void {
    if (!this.active || this.permanentlyStopped) return;
    const wasConnected = this.connected;
    this.connected = status === 'SUBSCRIBED';
    if (
      this.connected &&
      !wasConnected &&
      this.receivedRealtimeStatus &&
      this.installed
    ) {
      void this.probe('reconnect');
    }
    this.receivedRealtimeStatus = true;
  }

  visibilityChanged(visible: boolean): void {
    this.visible = visible;
    if (visible && this.canRecover()) void this.probe('visibility');
  }

  online(): void {
    if (this.canRecover()) void this.probe('reconnect');
  }

  recoverRevisionConflict(): Promise<void> {
    return this.probe('revision-conflict');
  }

  installAcceptedRevision(
    revision: number,
    fingerprint: string,
  ): Promise<void> {
    const current = this.installed;
    if ((current?.revision ?? -1) > revision) return Promise.resolve();
    if (
      current?.revision === revision &&
      current.state_fingerprint === fingerprint
    ) {
      return Promise.resolve();
    }
    return this.fetchMutable(revision, false, 'accepted-command', fingerprint);
  }

  stop(): void {
    this.active = false;
    this.generation += 1;
    this.clearFallbackTimer();
    this.versionFollowUp = false;
    this.mutableFollowUp = false;
    this.mutableTargetRevision = -1;
    this.mutableStatusChanged = false;
    this.expectedFingerprint = null;
  }

  private probe(reason: RecoveryReason): Promise<void> {
    if (!this.canRecover()) return Promise.resolve();
    if (this.versionRequest) {
      this.versionFollowUp = true;
      return this.versionRequest;
    }
    const generation = this.generation;
    const request = (async () => {
      try {
        const remote = await fetchMatchVersion(
          this.options.client,
          this.options.matchId,
        );
        if (!this.isCurrent(generation)) return;
        const current = this.installed;
        if (
          current &&
          (remote.revision > current.revision ||
            remote.status !== current.status)
        ) {
          await this.fetchMutable(
            remote.revision,
            remote.status !== current.status,
            reason,
          );
        }
      } catch (error) {
        this.handleReadError(error);
      }
    })().finally(() => {
      if (this.versionRequest !== request) return;
      this.versionRequest = null;
      if (this.versionFollowUp && this.canRecover()) {
        this.versionFollowUp = false;
        void this.probe(reason);
      }
    });
    this.versionRequest = request;
    return request;
  }

  private fetchMutable(
    minimumRevision: number,
    statusChanged: boolean,
    _reason: RecoveryReason,
    fingerprint: string | null = null,
  ): Promise<void> {
    if (!this.canRecover()) return Promise.resolve();
    this.mutableTargetRevision = Math.max(
      this.mutableTargetRevision,
      minimumRevision,
    );
    this.mutableStatusChanged ||= statusChanged;
    if (fingerprint) this.expectedFingerprint = fingerprint;
    if (this.mutableRequest) {
      this.mutableFollowUp = true;
      return this.mutableRequest;
    }

    const generation = this.generation;
    const requestedRevision = this.mutableTargetRevision;
    const requestedStatusChange = this.mutableStatusChanged;
    const requestedFingerprint = this.expectedFingerprint;
    this.mutableStatusChanged = false;
    this.expectedFingerprint = null;
    const request = (async () => {
      try {
        const mutable = await fetchMatchMutableState(
          this.options.client,
          this.options.matchId,
        );
        if (!this.isCurrent(generation)) return;
        const current = this.installed;
        if (!current) return;
        if (
          requestedFingerprint &&
          mutable.revision === requestedRevision &&
          mutable.state_fingerprint !== requestedFingerprint
        ) {
          throw new Error('invalid_authoritative_state');
        }
        if (
          mutable.revision > current.revision ||
          (mutable.revision === current.revision &&
            (requestedStatusChange ||
              mutable.status !== current.status ||
              (requestedFingerprint !== null &&
                mutable.state_fingerprint !== current.state_fingerprint)))
        ) {
          this.install(this.mergeMutable(current, mutable));
        }
      } catch (error) {
        this.handleReadError(error);
      }
    })().finally(() => {
      if (this.mutableRequest !== request) return;
      this.mutableRequest = null;
      const installedRevision = this.installed?.revision ?? -1;
      if (
        this.mutableFollowUp &&
        this.canRecover() &&
        (this.mutableTargetRevision > installedRevision ||
          this.mutableStatusChanged)
      ) {
        this.mutableFollowUp = false;
        void this.fetchMutable(
          this.mutableTargetRevision,
          this.mutableStatusChanged,
          _reason,
          this.expectedFingerprint,
        );
      }
    });
    this.mutableRequest = request;
    return request;
  }

  private mergeMutable(
    current: MultiplayerMatch,
    mutable: MatchMutableState,
  ): MultiplayerMatch {
    return { ...current, ...mutable };
  }

  private install(match: MultiplayerMatch): void {
    const currentRevision = this.installed?.revision ?? -1;
    if (match.revision < currentRevision) return;
    this.installed = match;
    this.mutableTargetRevision = Math.max(
      this.mutableTargetRevision,
      match.revision,
    );
    this.options.install(match);
    const pendingSignal = this.pendingRealtimeSignal;
    this.pendingRealtimeSignal = null;
    if (
      pendingSignal &&
      (pendingSignal.revision > match.revision ||
        pendingSignal.status !== match.status)
    ) {
      this.realtimeChanged(pendingSignal);
    }
    if (match.status === 'completed') {
      this.clearFallbackTimer();
      this.options.onCompleted?.(match);
    }
  }

  private canRecover(): boolean {
    return (
      this.active &&
      !this.permanentlyStopped &&
      this.visible &&
      this.installed?.status !== 'completed'
    );
  }

  private isCurrent(generation: number): boolean {
    return this.active && generation === this.generation;
  }

  private handleReadError(error: unknown): void {
    if (!this.active) return;
    if (isPermanentMatchReadError(error)) {
      this.permanentlyStopped = true;
      this.connected = false;
      this.clearFallbackTimer();
    }
    this.options.onError(multiplayerError(error));
  }

  private startFallbackTimer(): void {
    if (this.fallbackTimer || !this.canRecover()) return;
    this.fallbackTimer = globalThis.setInterval(() => {
      if (!this.connected && this.canRecover()) void this.probe('fallback');
    }, MATCH_FALLBACK_INTERVAL_MS);
  }

  private clearFallbackTimer(): void {
    if (!this.fallbackTimer) return;
    globalThis.clearInterval(this.fallbackTimer);
    this.fallbackTimer = null;
  }
}
