import { resolveGeneratorVersion } from '../../../src/core/generation/constants.ts';
import { generatePlanet } from '../../../src/core/generation/generatePlanet.ts';
import {
  getProjectedWorldGeometry,
  type ProjectedPoint,
} from '../../../src/core/minimap/projection.ts';

export const ANNOUNCEMENT_PREVIEW_FILENAME = 'fustify-world.png';
export const ANNOUNCEMENT_PREVIEW_WIDTH = 640;
export const ANNOUNCEMENT_PREVIEW_HEIGHT = 360;

export type AnnouncementPreviewSettings = {
  seed: string;
  territoryCount: number;
  continentCount: number;
  playerCapacity: number;
  generatorVersion: number;
};

type Color = readonly [number, number, number];

const MAP_LEFT = 20;
const MAP_TOP = 30;
const MAP_SCALE = 5 / 3;

function color(hex: string): Color {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function setPixel(
  pixels: Uint8Array,
  x: number,
  y: number,
  fill: Color,
  opacity = 1,
): void {
  if (
    x < 0 ||
    x >= ANNOUNCEMENT_PREVIEW_WIDTH ||
    y < 0 ||
    y >= ANNOUNCEMENT_PREVIEW_HEIGHT
  ) {
    return;
  }
  const offset = (y * ANNOUNCEMENT_PREVIEW_WIDTH + x) * 4;
  const inverse = 1 - opacity;
  pixels[offset] = Math.round(pixels[offset]! * inverse + fill[0] * opacity);
  pixels[offset + 1] = Math.round(
    pixels[offset + 1]! * inverse + fill[1] * opacity,
  );
  pixels[offset + 2] = Math.round(
    pixels[offset + 2]! * inverse + fill[2] * opacity,
  );
  pixels[offset + 3] = 255;
}

function projected({ x, y }: ProjectedPoint): ProjectedPoint {
  return { x: MAP_LEFT + x * MAP_SCALE, y: MAP_TOP + y * MAP_SCALE };
}

function fillPolygon(
  pixels: Uint8Array,
  points: readonly ProjectedPoint[],
  fill: Color,
): void {
  const vertices = points.map(projected);
  if (vertices.length < 3) return;
  const minimumY = Math.max(
    MAP_TOP,
    Math.floor(Math.min(...vertices.map(({ y }) => y))),
  );
  const maximumY = Math.min(
    MAP_TOP + 300,
    Math.ceil(Math.max(...vertices.map(({ y }) => y))),
  );
  for (let y = minimumY; y < maximumY; y += 1) {
    const scanY = y + 0.5;
    const intersections: number[] = [];
    for (let index = 0; index < vertices.length; index += 1) {
      const first = vertices[index]!;
      const second = vertices[(index + 1) % vertices.length]!;
      if (
        (first.y <= scanY && second.y > scanY) ||
        (second.y <= scanY && first.y > scanY)
      ) {
        intersections.push(
          first.x +
            ((scanY - first.y) * (second.x - first.x)) / (second.y - first.y),
        );
      }
    }
    intersections.sort((left, right) => left - right);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const start = Math.max(MAP_LEFT, Math.ceil(intersections[index]!));
      const end = Math.min(
        MAP_LEFT + 600,
        Math.floor(intersections[index + 1]!),
      );
      for (let x = start; x <= end; x += 1) setPixel(pixels, x, y, fill);
    }
  }
}

function drawDisc(
  pixels: Uint8Array,
  x: number,
  y: number,
  radius: number,
  stroke: Color,
  opacity: number,
): void {
  const extent = Math.ceil(radius);
  for (let offsetY = -extent; offsetY <= extent; offsetY += 1) {
    for (let offsetX = -extent; offsetX <= extent; offsetX += 1) {
      if (offsetX * offsetX + offsetY * offsetY <= radius * radius) {
        setPixel(
          pixels,
          Math.round(x + offsetX),
          Math.round(y + offsetY),
          stroke,
          opacity,
        );
      }
    }
  }
}

function drawSegment(
  pixels: Uint8Array,
  first: ProjectedPoint,
  second: ProjectedPoint,
  stroke: Color,
  width: number,
  opacity: number,
  dashLength?: number,
): void {
  const from = projected(first);
  const to = projected(second);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance * 1.4));
  for (let step = 0; step <= steps; step += 1) {
    const amount = step / steps;
    if (
      dashLength !== undefined &&
      Math.floor((distance * amount) / dashLength) % 2 === 1
    ) {
      continue;
    }
    drawDisc(
      pixels,
      from.x + (to.x - from.x) * amount,
      from.y + (to.y - from.y) * amount,
      Math.max(0.6, width / 2),
      stroke,
      opacity,
    );
  }
}

function drawPolyline(
  pixels: Uint8Array,
  points: readonly ProjectedPoint[],
  stroke: Color,
  width: number,
  opacity: number,
  dashLength?: number,
): void {
  for (let index = 1; index < points.length; index += 1) {
    drawSegment(
      pixels,
      points[index - 1]!,
      points[index]!,
      stroke,
      width,
      opacity,
      dashLength,
    );
  }
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const name = new TextEncoder().encode(type);
  const content = concat([name, data]);
  return concat([uint32(data.length), content, uint32(crc32(content))]);
}

async function encodePng(
  pixels: Uint8Array,
  settings: AnnouncementPreviewSettings,
): Promise<Uint8Array> {
  const rowLength = ANNOUNCEMENT_PREVIEW_WIDTH * 4;
  const scanlines = new Uint8Array(
    (rowLength + 1) * ANNOUNCEMENT_PREVIEW_HEIGHT,
  );
  for (let y = 0; y < ANNOUNCEMENT_PREVIEW_HEIGHT; y += 1) {
    const target = y * (rowLength + 1);
    scanlines[target] = 0;
    scanlines.set(
      pixels.subarray(y * rowLength, (y + 1) * rowLength),
      target + 1,
    );
  }
  const compressed = new Uint8Array(
    await new Response(
      new Blob([scanlines])
        .stream()
        .pipeThrough(new CompressionStream('deflate')),
    ).arrayBuffer(),
  );
  const header = new Uint8Array(13);
  header.set(uint32(ANNOUNCEMENT_PREVIEW_WIDTH), 0);
  header.set(uint32(ANNOUNCEMENT_PREVIEW_HEIGHT), 4);
  header[8] = 8;
  header[9] = 6;
  const publicSettings = {
    seed: settings.seed,
    territoryCount: settings.territoryCount,
    continentCount: settings.continentCount,
    playerCapacity: settings.playerCapacity,
  };
  const metadata = new TextEncoder().encode(
    `FustifySettings\u0000${JSON.stringify(publicSettings)}`,
  );
  return concat([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('tEXt', metadata),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array()),
  ]);
}

export async function buildAnnouncementPreview(
  settings: AnnouncementPreviewSettings,
): Promise<Uint8Array> {
  const planet = generatePlanet(settings.seed, {
    territoryCount: settings.territoryCount,
    continentCount: settings.continentCount,
    playerCount: settings.playerCapacity,
    generatorVersion: resolveGeneratorVersion(settings.generatorVersion),
  });
  const geometry = getProjectedWorldGeometry(planet);
  const pixels = new Uint8Array(
    ANNOUNCEMENT_PREVIEW_WIDTH * ANNOUNCEMENT_PREVIEW_HEIGHT * 4,
  );
  const top = color('#0b1119');
  const bottom = color('#111b25');
  for (let y = 0; y < ANNOUNCEMENT_PREVIEW_HEIGHT; y += 1) {
    const amount = y / (ANNOUNCEMENT_PREVIEW_HEIGHT - 1);
    const row: Color = [
      Math.round(top[0] + (bottom[0] - top[0]) * amount),
      Math.round(top[1] + (bottom[1] - top[1]) * amount),
      Math.round(top[2] + (bottom[2] - top[2]) * amount),
    ];
    for (let x = 0; x < ANNOUNCEMENT_PREVIEW_WIDTH; x += 1) {
      setPixel(pixels, x, y, row);
    }
  }

  for (let y = MAP_TOP; y < MAP_TOP + 300; y += 1) {
    for (let x = MAP_LEFT; x < MAP_LEFT + 600; x += 1) {
      setPixel(pixels, x, y, color('#102d43'));
    }
  }
  const territoryById = new Map(
    planet.territories.map((territory) => [territory.id, territory]),
  );
  for (const territory of geometry.territories) {
    const fill = color(
      territoryById.get(territory.territoryId)?.displayColor ?? '#64748b',
    );
    for (const fragment of territory.fragments) {
      fillPolygon(pixels, fragment.points, fill);
    }
  }
  for (const route of geometry.routes) {
    for (const fragment of route.fragments) {
      drawPolyline(pixels, fragment, color('#d6eff9'), 1.25, 0.48, 4);
    }
  }
  const boundaryStyles = {
    territory: { color: color('#08121c'), width: 1.4, opacity: 0.88 },
    continent: { color: color('#e3bd79'), width: 2.1, opacity: 0.7 },
    coastline: { color: color('#78c4df'), width: 1.8, opacity: 0.86 },
  } as const;
  for (const kind of ['territory', 'continent', 'coastline'] as const) {
    const style = boundaryStyles[kind];
    for (const boundary of geometry.boundaries) {
      if (boundary.kind === kind) {
        drawPolyline(
          pixels,
          boundary.points,
          style.color,
          style.width,
          style.opacity,
        );
      }
    }
  }
  const frame = color('#8faabe');
  for (let x = MAP_LEFT; x <= MAP_LEFT + 600; x += 1) {
    setPixel(pixels, x, MAP_TOP, frame, 0.24);
    setPixel(pixels, x, MAP_TOP + 300, frame, 0.24);
  }
  for (let y = MAP_TOP; y <= MAP_TOP + 300; y += 1) {
    setPixel(pixels, MAP_LEFT, y, frame, 0.24);
    setPixel(pixels, MAP_LEFT + 600, y, frame, 0.24);
  }
  return encodePng(pixels, settings);
}
