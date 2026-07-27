import { describe, expect, it } from 'vitest';
import { requiresManualHomePreviewLoad } from './homePreviewPolicy';

describe('homepage globe loading policy', () => {
  it('progressively loads on a desktop connection', () => {
    expect(
      requiresManualHomePreviewLoad({
        narrowViewport: false,
        saveData: false,
      }),
    ).toBe(false);
  });

  it('requires an explicit action on narrow viewports', () => {
    expect(
      requiresManualHomePreviewLoad({
        narrowViewport: true,
        saveData: false,
      }),
    ).toBe(true);
  });

  it('requires an explicit action when data saver is enabled', () => {
    expect(
      requiresManualHomePreviewLoad({
        narrowViewport: false,
        saveData: true,
      }),
    ).toBe(true);
  });
});
