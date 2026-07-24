import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EventReactions } from './EventReactions';
import { desiredReactionAfterSelection } from './eventReactionPresentation';

describe('Activity reaction controls', () => {
  it('renders only counted reactions, the active reaction, and the picker trigger', () => {
    const markup = renderToStaticMarkup(
      createElement(EventReactions, {
        eventId: 'event-4',
        summary: {
          eventId: 'event-4',
          counts: { fire: 2, laugh: 0, heart: 1, angry: 0 },
          ownReaction: 'heart',
        },
        pending: false,
        onSetReaction: vi.fn(),
      }),
    );
    expect(markup).toContain('🔥');
    expect(markup).toContain('❤️');
    expect(markup).not.toContain('😂');
    expect(markup).not.toContain('😡');
    expect(markup).not.toContain('>0<');
    expect(markup).toContain('remove your heart reaction');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('class="event-reaction-button active"');
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Change reaction"');
    expect(markup).not.toContain('event-reaction-picker');
  });

  it('models set, switch, and explicit removal without toggle semantics', () => {
    expect(desiredReactionAfterSelection(null, 'fire')).toBe('fire');
    expect(desiredReactionAfterSelection('fire', 'heart')).toBe('heart');
    expect(desiredReactionAfterSelection('fire', 'fire')).toBeNull();
  });

  it('shows only Add reaction when there are no counts or current selection', () => {
    const markup = renderToStaticMarkup(
      createElement(EventReactions, {
        eventId: 'event-4',
        summary: {
          eventId: 'event-4',
          counts: { fire: 0, laugh: 0, heart: 0, angry: 0 },
          ownReaction: null,
        },
        pending: false,
        onSetReaction: vi.fn(),
      }),
    );
    expect(markup).toContain('aria-label="Add reaction"');
    expect(markup).not.toContain('event-reaction-button');
  });

  it('shows event-local pending and sanitized error state while retaining counts', () => {
    const markup = renderToStaticMarkup(
      createElement(EventReactions, {
        eventId: 'event-4',
        summary: {
          eventId: 'event-4',
          counts: { fire: 2, laugh: 0, heart: 0, angry: 0 },
          ownReaction: 'fire',
        },
        pending: true,
        error: 'That Activity entry is no longer available for reactions.',
        onSetReaction: vi.fn(),
      }),
    );
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Saving reaction');
    expect(markup).toContain('>2<');
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup).toContain('role="alert"');
  });
});
