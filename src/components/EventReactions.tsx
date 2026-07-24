import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  MATCH_EVENT_REACTIONS,
  type EventReactionSummary,
  type MatchEventReaction,
} from '../multiplayer/matchEventReactions';
import {
  desiredReactionAfterSelection,
  REACTION_PRESENTATION,
} from './eventReactionPresentation';

function countLabel(reaction: MatchEventReaction, count: number) {
  const label = REACTION_PRESENTATION[reaction].label.toLowerCase();
  return `${count} ${label} ${count === 1 ? 'reaction' : 'reactions'}`;
}

export function EventReactions({
  eventId,
  summary,
  canReact,
  pending,
  error,
  onSetReaction,
}: {
  eventId: string;
  summary?: EventReactionSummary;
  canReact: boolean;
  pending: boolean;
  error?: string;
  onSetReaction: (reaction: MatchEventReaction | null) => void;
}) {
  const ownReaction = summary?.ownReaction ?? null;
  const accountReturnPath =
    typeof window === 'undefined'
      ? '/'
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ left: 0, top: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const keyboardOpenRef = useRef(false);

  useEffect(() => {
    if (!pickerOpen) return;

    const closeOutside = (event: PointerEvent) => {
      if (
        !containerRef.current?.contains(event.target as Node) &&
        !pickerRef.current?.contains(event.target as Node)
      ) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    if (keyboardOpenRef.current) firstOptionRef.current?.focus();
    keyboardOpenRef.current = false;
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [pickerOpen]);

  const choose = (
    clickEvent: MouseEvent<HTMLButtonElement>,
    reaction: MatchEventReaction,
  ) => {
    clickEvent.stopPropagation();
    onSetReaction(desiredReactionAfterSelection(ownReaction, reaction));
  };

  const selectFromPicker = (
    clickEvent: MouseEvent<HTMLButtonElement>,
    reaction: MatchEventReaction,
  ) => {
    clickEvent.stopPropagation();
    onSetReaction(reaction);
    setPickerOpen(false);
  };

  const closePicker = (keyEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyEvent.key !== 'Escape') return;
    keyEvent.stopPropagation();
    setPickerOpen(false);
    addButtonRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={`event-reactions${pending ? ' pending' : ''}`}
      data-event-id={eventId}
      aria-busy={pending}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={closePicker}
    >
      <div className="event-reaction-line">
        {MATCH_EVENT_REACTIONS.filter(
          (reaction) =>
            (summary?.counts[reaction] ?? 0) > 0 || ownReaction === reaction,
        ).map((reaction) => {
          const presentation = REACTION_PRESENTATION[reaction];
          const count = summary?.counts[reaction] ?? 0;
          const selected = ownReaction === reaction;
          const action = selected
            ? `remove your ${presentation.label.toLowerCase()} reaction`
            : ownReaction
              ? `switch to ${presentation.label.toLowerCase()} reaction`
              : `add ${presentation.label.toLowerCase()} reaction`;
          const label =
            count > 0 ? `${countLabel(reaction, count)}; ${action}` : action;
          if (!canReact) {
            return (
              <span
                key={reaction}
                className="event-reaction-button event-reaction-readonly"
                aria-label={countLabel(reaction, count)}
              >
                <span className="event-reaction-emoji" aria-hidden="true">
                  {presentation.emoji}
                </span>
                <span className="event-reaction-count" aria-hidden="true">
                  {count}
                </span>
              </span>
            );
          }
          return (
            <button
              key={reaction}
              type="button"
              className={`event-reaction-button${selected ? ' active' : ''}`}
              aria-label={label}
              aria-pressed={selected}
              disabled={pending}
              onClick={(event) => choose(event, reaction)}
            >
              <span className="event-reaction-emoji" aria-hidden="true">
                {presentation.emoji}
              </span>
              {count > 0 && (
                <span className="event-reaction-count" aria-hidden="true">
                  {count}
                </span>
              )}
            </button>
          );
        })}
        {canReact ? (
          <button
            ref={addButtonRef}
            type="button"
            className="event-add-reaction-button"
            aria-label={ownReaction ? 'Change reaction' : 'Add reaction'}
            aria-expanded={pickerOpen}
            aria-haspopup="true"
            disabled={pending}
            onClick={(event) => {
              event.stopPropagation();
              keyboardOpenRef.current = event.detail === 0;
              const panel = event.currentTarget.closest('.activity-panel');
              if (panel) {
                const button = event.currentTarget.getBoundingClientRect();
                const bounds = panel.getBoundingClientRect();
                const pickerWidth = 120;
                const pickerHeight = 128;
                const below = button.bottom + 4;
                const top =
                  below + pickerHeight <= bounds.bottom - 4
                    ? below
                    : button.top - pickerHeight - 4;
                setPickerPosition({
                  left: Math.max(
                    bounds.left + 4,
                    Math.min(
                      button.right - pickerWidth,
                      bounds.right - pickerWidth - 4,
                    ),
                  ),
                  top: Math.max(
                    bounds.top + 4,
                    Math.min(top, bounds.bottom - pickerHeight - 4),
                  ),
                });
              }
              setPickerOpen((open) => !open);
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <circle cx="8.5" cy="9.5" r="5.5" />
              <path d="M6.4 10.7c.8 1 1.4 1.3 2.2 1.3s1.5-.3 2.2-1.3M6.7 8h.1m3.5 0h.1M15 3.5v5m-2.5-2.5h5" />
            </svg>
          </button>
        ) : (
          <a
            className="event-account-required"
            aria-label="Create an account to react"
            href={`/?account=create&returnPath=${encodeURIComponent(accountReturnPath)}`}
            onClick={(event) => event.stopPropagation()}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <rect x="5" y="9" width="10" height="8" rx="2" />
              <path d="M7.5 9V6.8a2.5 2.5 0 0 1 5 0V9" />
            </svg>
          </a>
        )}
        {canReact &&
          pickerOpen &&
          createPortal(
            <div
              ref={pickerRef}
              className="event-reaction-picker"
              aria-label="Choose a reaction"
              style={pickerPosition}
            >
              {MATCH_EVENT_REACTIONS.map((reaction, index) => {
                const presentation = REACTION_PRESENTATION[reaction];
                const selected = ownReaction === reaction;
                const action = selected
                  ? 'Keep'
                  : ownReaction
                    ? 'Switch to'
                    : 'Add';
                return (
                  <button
                    key={reaction}
                    ref={index === 0 ? firstOptionRef : undefined}
                    type="button"
                    aria-label={`${action} ${presentation.label.toLowerCase()} reaction`}
                    aria-pressed={selected}
                    disabled={pending}
                    onClick={(event) => selectFromPicker(event, reaction)}
                  >
                    <span aria-hidden="true">{presentation.emoji}</span>
                    <span>{presentation.label}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )}
        {pending && (
          <span className="event-reaction-pending" aria-hidden="true" />
        )}
        {pending && <span className="sr-only">Saving reaction</span>}
      </div>
      {error && (
        <span className="event-reaction-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
