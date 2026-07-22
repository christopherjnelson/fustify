import { MultiplayerGameScene } from '../multiplayer/MultiplayerApp';
import { applyScenario } from './visualScenarios';

applyScenario('multiplayer-reinforcement-active');

export function MultiplayerVisualApp() {
  return <MultiplayerGameScene matchId="visual-match" revision={0} />;
}
