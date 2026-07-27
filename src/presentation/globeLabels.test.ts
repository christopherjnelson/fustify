import { describe, expect, it } from 'vitest';
import { generatePlanet } from '../core/generation/generatePlanet';
import {
  getTerritoryLabelAnchors,
  globeLabelMode,
  TERRITORY_LABEL_MAX_CAMERA_DISTANCE,
} from './globeLabels';

describe('globe labels', () => {
  it('switches exclusively from continents to territories at close zoom', () => {
    expect(globeLabelMode(TERRITORY_LABEL_MAX_CAMERA_DISTANCE + 0.01)).toBe(
      'continents',
    );
    expect(globeLabelMode(TERRITORY_LABEL_MAX_CAMERA_DISTANCE)).toBe(
      'territories',
    );
    expect(globeLabelMode(3.1)).toBe('territories');
  });

  it('creates one normalized territory-name anchor per territory', () => {
    const planet = generatePlanet('globe-territory-label-test', {
      territoryCount: 12,
      continentCount: 3,
      playerCount: 2,
    });

    const anchors = getTerritoryLabelAnchors(planet);

    expect(anchors).toHaveLength(planet.territories.length);
    expect(anchors.map((anchor) => anchor.territoryId)).toEqual(
      planet.territories.map((territory) => territory.id),
    );
    expect(anchors.map((anchor) => anchor.name)).toEqual(
      planet.territories.map((territory) => territory.name),
    );
    for (const anchor of anchors) {
      expect(Math.hypot(...anchor.vector)).toBeCloseTo(1);
    }
  });
});
