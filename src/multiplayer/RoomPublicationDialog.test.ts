import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RoomPublicationDialog } from './RoomPublicationDialog';

describe('public room publication confirmation', () => {
  it('explains irreversibility, setting locks, direct joining, and code retirement', () => {
    const markup = renderToStaticMarkup(
      createElement(RoomPublicationDialog, {
        busy: false,
        error: null,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );

    expect(markup).toContain('Open Public Lobby?');
    expect(markup).toContain('This cannot be undone.');
    expect(markup).toContain('permanently locked');
    expect(markup).toContain('public game list');
    expect(markup).toContain('direct room link');
    expect(markup).toContain('private room code will stop working');
  });

  it('disables both actions while publication is in flight and shows safe failure copy', () => {
    const markup = renderToStaticMarkup(
      createElement(RoomPublicationDialog, {
        busy: true,
        error:
          'Review and save valid room settings before opening the public lobby.',
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );

    expect(markup.match(/disabled=""/gu)).toHaveLength(2);
    expect(markup).toContain('Opening…');
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain('P0001');
  });
});
