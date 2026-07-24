import { MultiplayerGameScene } from '../multiplayer/MultiplayerApp';
import { PostMatchActions } from '../multiplayer/PostMatchActions';
import type {
  MultiplayerRoomSettings,
  Room,
} from '../multiplayer/multiplayerApi';
import { applyScenario } from './visualScenarios';

const parameters = new URLSearchParams(window.location.search);
const postMatchFixture = parameters.get('scenario') === 'multiplayer-game-over';

applyScenario(
  postMatchFixture
    ? 'multiplayer-game-over'
    : 'multiplayer-reinforcement-active',
);

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
