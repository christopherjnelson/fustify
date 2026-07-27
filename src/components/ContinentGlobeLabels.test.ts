import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PLANET_RADIUS } from '../core/generation/constants';
import { generatePlanet } from '../core/generation/generatePlanet';
import { getContinentLabelAnchors } from '../presentation/continentLabels';
import {
  placeContinentLabelSprite,
  placeTerritoryLabelSprite,
} from '../presentation/globeLabelSprite';
import { getTerritoryLabelAnchors } from '../presentation/globeLabels';

describe('continent globe label sprite', () => {
  it('uses the shared anchor above the surface and never raycasts', () => {
    const planet = generatePlanet('globe-continent-label-test', {
      territoryCount: 12,
      continentCount: 3,
      playerCount: 2,
    });
    const anchor = getContinentLabelAnchors(planet)[0]!;
    const sprite = new THREE.Sprite();

    placeContinentLabelSprite(sprite, anchor);

    expect(sprite.position.length()).toBeCloseTo(PLANET_RADIUS * 1.075);
    sprite.position
      .clone()
      .normalize()
      .toArray()
      .forEach((component, index) =>
        expect(component).toBeCloseTo(anchor.vector[index]!),
      );
    expect(sprite.userData).toMatchObject({
      continentId: anchor.continentId,
      anchorTerritoryId: anchor.territoryId,
    });
    expect(sprite.raycast({} as THREE.Raycaster, [])).toBeUndefined();
  });

  it('places territory labels above army markers and never raycasts', () => {
    const planet = generatePlanet('globe-territory-label-test', {
      territoryCount: 12,
      continentCount: 3,
      playerCount: 2,
    });
    const anchor = getTerritoryLabelAnchors(planet)[0]!;
    const sprite = new THREE.Sprite();

    placeTerritoryLabelSprite(sprite, anchor);

    expect(sprite.position.length()).toBeCloseTo(PLANET_RADIUS * 1.075);
    expect(sprite.center.toArray()).toEqual([0.5, -0.8]);
    expect(sprite.userData).toMatchObject({
      territoryId: anchor.territoryId,
    });
    expect(sprite.raycast({} as THREE.Raycaster, [])).toBeUndefined();
  });
});
