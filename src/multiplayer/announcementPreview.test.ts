import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATOR_VERSION } from '../core/generation/constants';
import {
  ANNOUNCEMENT_PREVIEW_HEIGHT,
  ANNOUNCEMENT_PREVIEW_WIDTH,
  buildAnnouncementPreview,
  type AnnouncementPreviewSettings,
} from '../../supabase/functions/announce-public-room/preview';

const settings: AnnouncementPreviewSettings = {
  seed: 'discord-preview-271',
  territoryCount: 12,
  continentCount: 2,
  playerCapacity: 3,
  generatorVersion: DEFAULT_GENERATOR_VERSION,
};

function uint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}

function textChunk(bytes: Uint8Array): string {
  let offset = 8;
  while (offset < bytes.length) {
    const length = uint32(bytes, offset);
    const type = new TextDecoder().decode(
      bytes.subarray(offset + 4, offset + 8),
    );
    if (type === 'tEXt') {
      return new TextDecoder().decode(
        bytes.subarray(offset + 8, offset + 8 + length),
      );
    }
    offset += length + 12;
  }
  throw new Error('PNG text metadata is missing.');
}

describe('Discord room minimap preview', () => {
  it('produces a deterministic PNG tied to the supplied locked settings', async () => {
    const [first, second, otherSeed] = await Promise.all([
      buildAnnouncementPreview(settings),
      buildAnnouncementPreview(settings),
      buildAnnouncementPreview({ ...settings, seed: 'discord-preview-314' }),
    ]);

    expect(first.subarray(0, 8)).toEqual(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(uint32(first, 16)).toBe(ANNOUNCEMENT_PREVIEW_WIDTH);
    expect(uint32(first, 20)).toBe(ANNOUNCEMENT_PREVIEW_HEIGHT);
    expect(textChunk(first)).toBe(
      `FustifySettings\u0000${JSON.stringify({
        seed: settings.seed,
        territoryCount: settings.territoryCount,
        continentCount: settings.continentCount,
        playerCapacity: settings.playerCapacity,
      })}`,
    );
    expect(second).toEqual(first);
    expect(otherSeed).not.toEqual(first);
  });
});
