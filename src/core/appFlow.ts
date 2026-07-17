export type ApplicationMode =
  'world-setup' | 'pregame' | 'handoff' | 'playing' | 'game-over';

export interface HandoffSummary {
  previousTurn: number | null;
  messages: string[];
}
