import {
  Children,
  createElement,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EventReactions } from './EventReactions';
import { desiredReactionAfterSelection } from './eventReactionPresentation';

describe('Activity reaction controls', () => {
  it('always renders all four reactions while omitting visible zero counts', () => {
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
    expect(markup).toContain('😂');
    expect(markup).toContain('😡');
    expect(markup).not.toContain('>0<');
    expect(markup).toContain('remove your heart reaction');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('class="event-reaction-button active"');
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(3);
    expect(markup).not.toContain('React to this Activity entry');
    expect(markup).not.toContain('role="menu"');
  });

  it('models set, switch, and explicit removal without toggle semantics', () => {
    expect(desiredReactionAfterSelection(null, 'fire')).toBe('fire');
    expect(desiredReactionAfterSelection('fire', 'heart')).toBe('heart');
    expect(desiredReactionAfterSelection('fire', 'fire')).toBeNull();
  });

  it('calls the existing desired-state operation for set, switch, and removal', () => {
    const click = {
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent<HTMLButtonElement>;

    const invoke = (
      ownReaction: 'fire' | 'laugh' | 'heart' | 'angry' | null,
      accessibleName: string,
    ) => {
      const onSetReaction = vi.fn();
      const tree = EventReactions({
        eventId: 'event-4',
        summary: {
          eventId: 'event-4',
          counts: { fire: 0, laugh: 0, heart: 0, angry: 0 },
          ownReaction,
        },
        pending: false,
        onSetReaction,
      });
      findButton(tree, accessibleName).props.onClick(click);
      return onSetReaction;
    };

    expect(invoke(null, 'add fire reaction')).toHaveBeenCalledWith('fire');
    expect(invoke('fire', 'remove your fire reaction')).toHaveBeenCalledWith(
      null,
    );
    expect(invoke('fire', 'switch to laugh reaction')).toHaveBeenCalledWith(
      'laugh',
    );
    expect(click.stopPropagation).toHaveBeenCalledTimes(3);
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
    expect(markup.match(/disabled=""/g)).toHaveLength(4);
    expect(markup).toContain('role="alert"');
  });
});

interface ReactionButtonProps {
  'aria-label': string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

function findButton(
  node: ReactNode,
  accessibleName: string,
): ReactElement<ReactionButtonProps> {
  if (isValidElement<ReactionButtonProps>(node)) {
    if (node.type === 'button' && node.props['aria-label'] === accessibleName) {
      return node;
    }
    for (const child of Children.toArray(
      (node.props as { children?: ReactNode }).children,
    )) {
      const match = findButtonOrNull(child, accessibleName);
      if (match) return match;
    }
  }
  throw new Error(`Could not find ${accessibleName}`);
}

function findButtonOrNull(
  node: ReactNode,
  accessibleName: string,
): ReactElement<ReactionButtonProps> | null {
  try {
    return findButton(node, accessibleName);
  } catch {
    return null;
  }
}
