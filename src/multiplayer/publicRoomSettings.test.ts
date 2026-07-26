import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublicRoomSettingsSummary } from './PublicRoomSettingsSummary';
import { stablePublicRoomSettingFields } from './publicRoomSettings';

const settings = {
  name: 'Atlas Prime',
  seed: 'quiet-orbit-271',
  playerCapacity: 4,
  territoryCount: 42,
  continentCount: 5,
  assignmentMode: 'random',
};

describe('stable public room settings presentation', () => {
  it('keeps the complete locked public contract in one canonical order', () => {
    expect(stablePublicRoomSettingFields(settings)).toEqual([
      { key: 'name', label: 'Room name', value: 'Atlas Prime' },
      { key: 'seed', label: 'Seed', value: 'quiet-orbit-271' },
      {
        key: 'playerCapacity',
        label: 'Player capacity',
        value: '4 players',
      },
      { key: 'territoryCount', label: 'Territories', value: '42' },
      { key: 'continentCount', label: 'Continents', value: '5' },
      { key: 'assignmentMode', label: 'Assignment', value: 'Random' },
    ]);
  });

  it('renders the complete published-room summary and permits title deduplication on cards', () => {
    const published = renderToStaticMarkup(
      createElement(PublicRoomSettingsSummary, { settings }),
    );
    const card = renderToStaticMarkup(
      createElement(PublicRoomSettingsSummary, {
        settings,
        includeRoomName: false,
      }),
    );

    for (const value of [
      'Room name',
      'Atlas Prime',
      'Seed',
      'quiet-orbit-271',
      'Player capacity',
      '4 players',
      'Territories',
      '42',
      'Continents',
      '5',
      'Assignment',
      'Random',
    ]) {
      expect(published).toContain(value);
    }
    expect(card).not.toContain('Room name');
    expect(card).not.toContain('Atlas Prime');
    expect(card).toContain('Player capacity');
  });
});
