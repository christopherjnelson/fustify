import * as THREE from 'three';
import type { MatchState, TerritoryMatchState } from '../core/game/types';
import { playerColorValue } from '../core/setup/playerConfig';
import type { MatchSetup } from '../core/setup/startingPositions';
import type { PlanetDefinition } from '../core/types/planet';
import type { TerritoryDefinition } from '../core/types/territory';
import type { PlanetViewMode } from '../state/useGameStore';

export type TerritoryVisualKind =
  | 'hovered'
  | 'source'
  | 'target'
  | 'valid-source'
  | 'valid-target'
  | 'captured'
  | 'invalid'
  | null;

export function displayedTerritoryStates(
  matchSetup: MatchSetup,
  match: MatchState | null,
): Record<string, TerritoryMatchState> {
  if (match) return match.territories;
  if (matchSetup.setupPhase === 'ready') {
    return matchSetup.startingPosition.territories;
  }
  if (matchSetup.setupPhase === 'assignment-in-progress') {
    return Object.fromEntries(
      Object.entries(matchSetup.draft.territoryOwners).map(
        ([territoryId, ownerId]) => [territoryId, { ownerId, armyCount: 1 }],
      ),
    );
  }
  return {};
}

export function territoryFillColor(
  territory: TerritoryDefinition,
  playerColor: string | null,
  viewMode: PlanetViewMode,
  active: boolean,
  kind: TerritoryVisualKind,
) {
  let color: THREE.Color;
  if (viewMode === 'continents') {
    color = new THREE.Color(territory.displayColor);
    if (playerColor) color.lerp(new THREE.Color(playerColor), 0.16);
  } else if (viewMode === 'terrain') {
    const landmassIndex = Number(territory.landmassId.split('-').at(-1) ?? 0);
    color = new THREE.Color(landmassIndex % 2 === 0 ? '#58714d' : '#6b7650')
      .lerp(new THREE.Color(territory.displayColor), 0.16)
      .offsetHSL(0, -0.12, 0);
  } else if (playerColor) {
    color = new THREE.Color(playerColor).lerp(
      new THREE.Color(territory.displayColor),
      0.18,
    );
  } else {
    color = new THREE.Color(territory.displayColor).offsetHSL(0, -0.08, -0.03);
  }
  const numericId = Number(territory.id.slice('territory-'.length));
  color.offsetHSL(0, 0, ((numericId % 5) - 2) * 0.022);
  if (active) color.lerp(new THREE.Color('#ffffff'), 0.06);
  if (kind === 'invalid') color.multiplyScalar(0.52);
  if (kind === 'valid-source') color.lerp(new THREE.Color('#c8f2ff'), 0.18);
  if (kind === 'valid-target') color.lerp(new THREE.Color('#ffcc78'), 0.3);
  if (kind === 'captured') color.lerp(new THREE.Color('#ffffff'), 0.42);
  if (kind === 'source') color.lerp(new THREE.Color('#fff3a1'), 0.62);
  if (kind === 'target') color.lerp(new THREE.Color('#ff8c66'), 0.62);
  if (kind === 'hovered') color.lerp(new THREE.Color('#ffffff'), 0.32);
  return color;
}

export interface MinimapTerritoryStyle {
  territoryId: string;
  ownerId: string | null;
  fill: string;
  active: boolean;
}

export function minimapTerritoryStyles(
  planet: PlanetDefinition,
  matchSetup: MatchSetup,
  match: MatchState | null,
): MinimapTerritoryStyle[] {
  const displayed = displayedTerritoryStates(matchSetup, match);
  const playerColors = new Map(
    matchSetup.players.map((player) => [
      player.id,
      playerColorValue(player.colorId),
    ]),
  );
  return planet.territories.map((territory) => {
    const ownerId = displayed[territory.id]?.ownerId ?? null;
    const active = ownerId !== null && ownerId === match?.activePlayerId;
    return {
      territoryId: territory.id,
      ownerId,
      active,
      fill: `#${territoryFillColor(
        territory,
        ownerId ? (playerColors.get(ownerId) ?? null) : null,
        'ownership',
        active,
        null,
      ).getHexString()}`,
    };
  });
}
