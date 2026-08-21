import {
  getProjectedWorldGeometry,
  type ProjectedPoint,
} from '../core/minimap/projection';
import type { PlanetDefinition } from '../core/types/planet';
import {
  getContinentLabelAnchors,
  layoutMinimapContinentLabels,
} from '../presentation/continentLabels';

export const ROOM_THUMBNAIL_WIDTH = 640;
export const ROOM_THUMBNAIL_HEIGHT = 360;

function format(value: number): number {
  return Number(value.toFixed(3));
}

function polygonPath(fragments: readonly { points: ProjectedPoint[] }[]) {
  return fragments
    .map(
      ({ points }) =>
        `M ${points.map(({ x, y }) => `${format(x)} ${format(y)}`).join(' L ')} Z`,
    )
    .join(' ');
}

function linePath(fragments: readonly ProjectedPoint[][]) {
  return fragments
    .map(
      (points) =>
        `M ${points.map(({ x, y }) => `${format(x)} ${format(y)}`).join(' L ')}`,
    )
    .join(' ');
}

function xml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!,
  );
}

export function buildWorldThumbnailSvg(planet: PlanetDefinition): string {
  const geometry = getProjectedWorldGeometry(planet);
  const territoryById = new Map(
    planet.territories.map((territory) => [territory.id, territory]),
  );
  const boundaryPath = (kind: 'territory' | 'continent' | 'coastline') =>
    linePath(
      geometry.boundaries
        .filter((boundary) => boundary.kind === kind)
        .map((boundary) => boundary.points),
    );
  const territories = geometry.territories
    .map((territory) => {
      const color =
        territoryById.get(territory.territoryId)?.displayColor ?? '#64748b';
      return `<path d="${polygonPath(territory.fragments)}" fill="${xml(color)}" stroke="${xml(color)}"/>`;
    })
    .join('');
  const routes = geometry.routes
    .map(
      (route) =>
        `<path d="${linePath(route.fragments)}" fill="none" stroke="#d6eff9" stroke-width=".75" stroke-dasharray="2.2 2.3" stroke-linecap="round" opacity=".48"/>`,
    )
    .join('');
  const labels = layoutMinimapContinentLabels(getContinentLabelAnchors(planet))
    .map(
      (label) =>
        `<text x="${format(label.point.x)}" y="${format(label.point.y)}" font-size="${format(label.fontSize)}">${xml(label.name)}</text>`,
    )
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ROOM_THUMBNAIL_WIDTH}" height="${ROOM_THUMBNAIL_HEIGHT}" viewBox="0 0 ${ROOM_THUMBNAIL_WIDTH} ${ROOM_THUMBNAIL_HEIGHT}">`,
    '<defs>',
    '<linearGradient id="matte" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b1119"/><stop offset="1" stop-color="#111b25"/></linearGradient>',
    '<filter id="shadow"><feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="#000" flood-opacity=".4"/></filter>',
    '<clipPath id="map-clip"><rect width="360" height="180" rx="4"/></clipPath>',
    '</defs>',
    '<rect width="640" height="360" fill="url(#matte)"/>',
    '<circle cx="560" cy="62" r="125" fill="#c7f000" opacity=".035"/>',
    '<g transform="translate(20 30) scale(1.6666667)" clip-path="url(#map-clip)" filter="url(#shadow)">',
    '<rect width="360" height="180" rx="4" fill="#102d43"/>',
    `<g stroke-width=".26" stroke-linejoin="round">${territories}</g>`,
    `<g>${routes}</g>`,
    `<path d="${boundaryPath('territory')}" fill="none" stroke="#08121c" stroke-width=".55" stroke-linecap="round" stroke-linejoin="round" opacity=".88"/>`,
    `<path d="${boundaryPath('continent')}" fill="none" stroke="#e3bd79" stroke-width=".95" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>`,
    `<path d="${boundaryPath('coastline')}" fill="none" stroke="#78c4df" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round" opacity=".86"/>`,
    `<g fill="#f4fbff" font-family="system-ui,sans-serif" font-weight="650" text-anchor="middle" dominant-baseline="central" paint-order="stroke fill" stroke="#030910" stroke-width="2.2" stroke-linejoin="round">${labels}</g>`,
    '</g>',
    '<rect x="20.5" y="30.5" width="599" height="299" rx="7" fill="none" stroke="#8faabe" stroke-opacity=".24"/>',
    '</svg>',
  ].join('');
}
