import type { MatchEventReaction } from '../multiplayer/matchEventReactions';

export const REACTION_PRESENTATION: Record<
  MatchEventReaction,
  { emoji: string; label: string }
> = {
  fire: { emoji: '🔥', label: 'Fire' },
  laugh: { emoji: '😂', label: 'Laugh' },
  heart: { emoji: '❤️', label: 'Heart' },
  angry: { emoji: '😡', label: 'Angry' },
};

export function desiredReactionAfterSelection(
  ownReaction: MatchEventReaction | null,
  selectedReaction: MatchEventReaction,
): MatchEventReaction | null {
  return ownReaction === selectedReaction ? null : selectedReaction;
}
