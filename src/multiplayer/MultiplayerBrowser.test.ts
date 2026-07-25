import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MultiplayerBrowser,
  type MultiplayerBrowserServices,
} from './MultiplayerBrowser';

const profile = {
  userId: '10000000-0000-4000-8000-000000000001',
  displayName: 'Host',
  avatarUrl: null,
  createdAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:00:00.000Z',
};

const services = {
  createGame: async () => {
    throw new Error('not used');
  },
  joinWithCode: async () => {
    throw new Error('not used');
  },
  joinPublicGame: async () => {
    throw new Error('not used');
  },
  listPublicGames: async () => [],
  thumbnailUrl: () => '',
  navigate: () => undefined,
} satisfies MultiplayerBrowserServices;

describe('multiplayer landing feedback', () => {
  it('does not mount the room notice element without landing feedback', () => {
    const markup = renderToStaticMarkup(
      createElement(MultiplayerBrowser, { profile, services }),
    );

    expect(markup).not.toContain('multiplayer-browser-notice');
    expect(markup).not.toContain('Room closed.');
  });

  it('renders genuine landing feedback inside the padded landing page', () => {
    const markup = renderToStaticMarkup(
      createElement(MultiplayerBrowser, {
        profile,
        services,
        notice: 'The host closed this room.',
      }),
    );

    expect(markup).toMatch(
      /<main class="multiplayer-shell multiplayer-browser">[\s\S]*<p class="multiplayer-browser-notice" role="status">The host closed this room\.<\/p>/u,
    );
  });
});
