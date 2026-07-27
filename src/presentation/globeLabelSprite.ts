import * as THREE from 'three';
import { PLANET_RADIUS } from '../core/generation/constants';
import type { ContinentLabelAnchor } from './continentLabels';
import type { TerritoryLabelAnchor } from './globeLabels';

export function placeContinentLabelSprite(
  sprite: THREE.Sprite,
  anchor: ContinentLabelAnchor,
): void {
  sprite.position.set(...anchor.vector).multiplyScalar(PLANET_RADIUS * 1.075);
  sprite.raycast = () => undefined;
  sprite.userData.continentId = anchor.continentId;
  sprite.userData.anchorTerritoryId = anchor.territoryId;
}

export function placeTerritoryLabelSprite(
  sprite: THREE.Sprite,
  anchor: TerritoryLabelAnchor,
): void {
  sprite.position.set(...anchor.vector).multiplyScalar(PLANET_RADIUS * 1.075);
  // Keep the label above the army marker instead of covering its count.
  sprite.center.set(0.5, -0.8);
  sprite.raycast = () => undefined;
  sprite.userData.territoryId = anchor.territoryId;
}
