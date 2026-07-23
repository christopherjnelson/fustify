import * as THREE from 'three';
import { PLANET_RADIUS } from '../core/generation/constants';
import type { ContinentLabelAnchor } from './continentLabels';

export function placeContinentLabelSprite(
  sprite: THREE.Sprite,
  anchor: ContinentLabelAnchor,
): void {
  sprite.position.set(...anchor.vector).multiplyScalar(PLANET_RADIUS * 1.075);
  sprite.raycast = () => undefined;
  sprite.userData.continentId = anchor.continentId;
  sprite.userData.anchorTerritoryId = anchor.territoryId;
}
