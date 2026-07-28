import { useEffect, type ReactNode } from 'react';
import { publishRouteConnection } from '../brand/routeConnectionStatus';
import { GlobeScene } from '../components/GlobeScene';
import { TerritoryHud } from '../components/TerritoryHud';
import { ControlLegend } from '../components/ControlLegend';
import { TurnNotificationController } from '../components/TurnNotificationController';
import { ActionTrackingProvider } from '../components/ActionTracking';
import type { ActivityReactionController } from './matchEventReactions';

export function MultiplayerGameScene({
  matchId,
  revision,
  connection = 'SUBSCRIBED',
  renderPostMatchActions,
  activityReactions,
}: {
  matchId: string;
  revision: number;
  connection?: string;
  renderPostMatchActions?: (
    reviewing: boolean,
    onReviewingChange: (reviewing: boolean) => void,
  ) => ReactNode;
  activityReactions?: ActivityReactionController;
}) {
  useEffect(() => {
    publishRouteConnection(connection);
    return () => publishRouteConnection(null);
  }, [connection]);

  return (
    <ActionTrackingProvider>
      <main
        className="app-shell mode-playing multiplayer-game-shell"
        data-testid="multiplayer-match"
        data-match-id={matchId}
        data-revision={revision}
      >
        <GlobeScene />
        <ControlLegend />
        <TurnNotificationController />
        <TerritoryHud
          renderMultiplayerPostMatchActions={renderPostMatchActions}
          activityReactions={activityReactions}
        />
        <div className="multiplayer-game-metadata" aria-hidden="true">
          <span data-testid="match-id">{matchId}</span>
          <span data-testid="match-revision">{revision}</span>
        </div>
      </main>
    </ActionTrackingProvider>
  );
}

export default MultiplayerGameScene;
