import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
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
  pending,
  error,
  onSetReaction,
}: {
  eventId: string;
  summary?: EventReactionSummary;
  pending: boolean;
  error?: string;
  onSetReaction: (reaction: MatchEventReaction | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const ownReaction = summary?.ownReaction ?? null;

  const closePicker = (restoreFocus = false) => {
    setPickerOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  useEffect(() => {
    if (!pickerOpen) return;
    firstOptionRef.current?.focus();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        closePicker();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () =>
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [pickerOpen]);

  const choose = (
    clickEvent: MouseEvent<HTMLButtonElement>,
    reaction: MatchEventReaction,
  ) => {
    clickEvent.stopPropagation();
    closePicker(true);
    onSetReaction(desiredReactionAfterSelection(ownReaction, reaction));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !pickerOpen) return;
    event.preventDefault();
    event.stopPropagation();
    closePicker(true);
  };

  const visibleReactions = MATCH_EVENT_REACTIONS.filter(
    (reaction) => (summary?.counts[reaction] ?? 0) > 0,
  );

  return (
    <div
      ref={containerRef}
      className="event-reactions"
      data-event-id={eventId}
      aria-busy={pending}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <div className="event-reaction-actions">
        {visibleReactions.map((reaction) => {
          const presentation = REACTION_PRESENTATION[reaction];
          const count = summary!.counts[reaction];
          const selected = ownReaction === reaction;
          return (
            <button
              key={reaction}
              type="button"
              className={`event-reaction-chip${selected ? ' selected' : ''}`}
              aria-label={
                selected
                  ? `Remove your ${presentation.label.toLowerCase()} reaction. ${countLabel(reaction, count)}`
                  : `${countLabel(reaction, count)}. Add ${presentation.label.toLowerCase()} reaction`
              }
              aria-pressed={selected}
              disabled={pending}
              onClick={(event) => choose(event, reaction)}
            >
              <span aria-hidden="true">{presentation.emoji}</span>
              <span>{count}</span>
              {selected && <span className="sr-only">Your reaction</span>}
            </button>
          );
        })}
        <button
          ref={triggerRef}
          type="button"
          className="event-reaction-trigger"
          aria-label="React to this Activity entry"
          aria-expanded={pickerOpen}
          aria-haspopup="menu"
          disabled={pending}
          onClick={(event) => {
            event.stopPropagation();
            setPickerOpen((open) => !open);
          }}
        >
          {pending ? 'Saving…' : 'React'}
        </button>
      </div>
      {pickerOpen && (
        <div
          className="event-reaction-picker"
          role="menu"
          aria-label="Choose a reaction"
        >
          {MATCH_EVENT_REACTIONS.map((reaction, index) => {
            const presentation = REACTION_PRESENTATION[reaction];
            const selected = ownReaction === reaction;
            return (
              <button
                ref={index === 0 ? firstOptionRef : undefined}
                key={reaction}
                type="button"
                role="menuitem"
                className={selected ? 'selected' : undefined}
                disabled={pending}
                aria-label={`${presentation.emoji} ${presentation.label}${selected ? ', selected; choose to remove' : ''}`}
                onClick={(event) => choose(event, reaction)}
              >
                <span aria-hidden="true">{presentation.emoji}</span>
                <span>{presentation.label}</span>
                {selected && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
      {error && (
        <span className="event-reaction-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
