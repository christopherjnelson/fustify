import { MultiplayerGameScene } from '../multiplayer/MultiplayerApp';
import { PostMatchActions } from '../multiplayer/PostMatchActions';
import type {
  MultiplayerRoomSettings,
  Room,
} from '../multiplayer/multiplayerApi';
import type { ActivityReactionController } from '../multiplayer/matchEventReactions';
import { useGameStore } from '../state/useGameStore';
import { applyScenario } from './visualScenarios';

const parameters = new URLSearchParams(window.location.search);
const postMatchFixture = parameters.get('scenario') === 'multiplayer-game-over';
const activityReactionFixture =
  parameters.get('scenario') === 'multiplayer-activity-reactions';
const guestReactionFixture = parameters.get('reaction-account') === 'guest';

applyScenario(
  postMatchFixture
    ? 'multiplayer-game-over'
    : activityReactionFixture
      ? 'multiplayer-activity-reactions'
      : 'multiplayer-reinforcement-active',
);

const activityEvents = useGameStore.getState().match?.events ?? [];
const activityReactionSelections: Array<{
  eventId: string;
  reaction: 'fire' | 'laugh' | 'heart' | 'angry' | null;
}> = [];
(
  window as typeof window & {
    __FUSTIFY_ACTIVITY_REACTION_SELECTIONS__?: typeof activityReactionSelections;
  }
).__FUSTIFY_ACTIVITY_REACTION_SELECTIONS__ = activityReactionSelections;
const activityReactions: ActivityReactionController | undefined =
  activityReactionFixture
    ? {
        canReact: !guestReactionFixture,
        summaries: Object.fromEntries(
          activityEvents.map((event, index) => [
            event.id,
            {
              eventId: event.id,
              counts:
                index % 4 === 0
                  ? { fire: 0, laugh: 0, heart: 0, angry: 0 }
                  : index % 4 === 1
                    ? { fire: 2, laugh: 0, heart: 0, angry: 0 }
                    : index % 4 === 2
                      ? { fire: 3, laugh: 1, heart: 4, angry: 0 }
                      : { fire: 0, laugh: 0, heart: 1, angry: 0 },
              ownReaction: index % 4 === 3 ? 'heart' : null,
            },
          ]),
        ),
        pendingEventIds: new Set([activityEvents.at(-1)!.id]),
        errors: {},
        setReaction: (eventId, reaction) => {
          activityReactionSelections.push({ eventId, reaction });
        },
      }
    : undefined;

const settings: MultiplayerRoomSettings = {
  seed: 'visual-review-atlas',
  territoryCount: 42,
  continentCount: 5,
  maxSeats: 4,
  assignmentMode: 'random',
};

function navigate(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function MultiplayerVisualApp() {
  const host = parameters.get('role') !== 'nonhost';
  return (
    <MultiplayerGameScene
      matchId="visual-match"
      revision={0}
      activityReactions={activityReactions}
      renderPostMatchActions={
        postMatchFixture
          ? (reviewing, onReviewingChange) => (
              <PostMatchActions
                reviewing={reviewing}
                isHost={host}
                settings={settings}
                createRoom={async () =>
                  ({ id: 'visual-replacement-room' }) as Room
                }
                generateSeed={() => 'visual-fresh-world-271'}
                onReviewingChange={onReviewingChange}
                navigate={navigate}
              />
            )
          : undefined
      }
    />
  );
}
