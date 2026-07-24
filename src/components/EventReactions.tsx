import type { MouseEvent } from 'react';
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
  const ownReaction = summary?.ownReaction ?? null;

  const choose = (
    clickEvent: MouseEvent<HTMLButtonElement>,
    reaction: MatchEventReaction,
  ) => {
    clickEvent.stopPropagation();
    onSetReaction(desiredReactionAfterSelection(ownReaction, reaction));
  };

  return (
    <div
      className={`event-reactions${pending ? ' pending' : ''}`}
      data-event-id={eventId}
      aria-busy={pending}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="event-reaction-rail">
        {MATCH_EVENT_REACTIONS.map((reaction) => {
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
