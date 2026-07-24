import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EventReactions } from './EventReactions';
import { desiredReactionAfterSelection } from './eventReactionPresentation';

describe('Activity reaction controls', () => {
  it('renders only nonzero chips plus the compact React control', () => {
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
    expect(markup).toContain('Remove your heart reaction');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('>React</button>');
  });

  it('models set, switch, and explicit removal without toggle semantics', () => {
    expect(desiredReactionAfterSelection(null, 'fire')).toBe('fire');
    expect(desiredReactionAfterSelection('fire', 'heart')).toBe('heart');
    expect(desiredReactionAfterSelection('fire', 'fire')).toBeNull();
  });

  it('shows a local pending or sanitized error state without blocking Focus', () => {
    const markup = renderToStaticMarkup(
      createElement(EventReactions, {
        eventId: 'event-4',
        pending: true,
        error: 'That Activity entry is no longer available for reactions.',
        onSetReaction: vi.fn(),
      }),
    );
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Saving…');
    expect(markup).toContain('role="alert"');
  });
});
