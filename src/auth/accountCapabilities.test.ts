import { describe, expect, it } from 'vitest';
import { accountCapabilities } from './accountCapabilities';

describe('account capabilities', () => {
  it('fails guest customization, reactions, and future chat closed', () => {
    expect(accountCapabilities(true)).toEqual({
      canCustomizeProfile: false,
      canReact: false,
      canChat: false,
    });
  });

  it('enables registered account capabilities', () => {
    expect(accountCapabilities(false)).toEqual({
      canCustomizeProfile: true,
      canReact: true,
      canChat: true,
    });
  });
});
