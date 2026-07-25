import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FustifyLogo } from './FustifyLogo';
import { FustifyMark } from './FustifyMark';
import {
  FUSTIFY_FAVICON_GEOMETRY,
  FUSTIFY_LOGO_VIEW_BOX,
  FUSTIFY_MARK_GEOMETRY,
  FUSTIFY_MARK_VIEW_BOX,
} from './logoGeometry';

const assetPaths = [
  'public/brand/fustify-mark.svg',
  'public/brand/fustify-logo-horizontal.svg',
  'public/brand/fustify-mark-monochrome-light.svg',
  'public/brand/fustify-mark-monochrome-dark.svg',
  'public/favicon.svg',
] as const;

describe('FustifyMark', () => {
  it('renders meaningful and decorative accessibility states', () => {
    const meaningful = renderToStaticMarkup(
      createElement(FustifyMark, { label: 'Fustify home' }),
    );
    const decorative = renderToStaticMarkup(
      createElement(FustifyMark, { decorative: true }),
    );

    expect(meaningful).toContain('role="img"');
    expect(meaningful).toContain('aria-label="Fustify home"');
    expect(meaningful).not.toContain('aria-hidden');
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain('aria-label');
    expect(decorative).not.toContain('role="img"');
  });

  it('has a stable viewBox, predictable size, and variant class', () => {
    const markup = renderToStaticMarkup(
      createElement(FustifyMark, {
        size: 64,
        variant: 'monochrome-light',
      }),
    );

    expect(markup).toContain(`viewBox="${FUSTIFY_MARK_VIEW_BOX}"`);
    expect(markup).toContain('height="64"');
    expect(markup).toContain('width="64"');
    expect(markup).toContain('fustify-mark--monochrome-light');
  });

  it('does not generate IDs when multiple marks render together', () => {
    const markup = renderToStaticMarkup(
      createElement(
        'div',
        null,
        createElement(FustifyMark, { decorative: true }),
        createElement(FustifyMark, { decorative: true }),
      ),
    );

    expect(markup).not.toMatch(/\sid=/);
  });
});

describe('FustifyLogo', () => {
  it('uses predictable compact dimensions and supports a descriptor', () => {
    const markup = renderToStaticMarkup(
      createElement(FustifyLogo, {
        size: 'compact',
        showDescriptor: true,
        variant: 'monochrome-dark',
      }),
    );

    expect(markup).toContain(`viewBox="${FUSTIFY_LOGO_VIEW_BOX}"`);
    expect(markup).toContain('height="32"');
    expect(markup).toContain('width="110"');
    expect(markup).toContain('PROCEDURAL GLOBE STRATEGY');
    expect(markup).toContain('fustify-logo--monochrome-dark');
  });
});

describe('static brand assets', () => {
  it.each(assetPaths)('%s is a clean standalone SVG', (assetPath) => {
    const svg = readFileSync(assetPath, 'utf8');

    expect(svg).toMatch(/<svg[^>]+viewBox="0 0 \d+ \d+"/);
    expect(svg).not.toMatch(/<image\b|data:|base64|<metadata\b/i);
    expect(svg).not.toMatch(/\b(?:href|src)="https?:/i);
    expect(svg).not.toMatch(/xmlns:[a-z]+=/i);
    expect(svg).not.toMatch(/\sid=/);
  });

  it('keeps static mark paths synchronized with React geometry', () => {
    const fullColorMark = readFileSync('public/brand/fustify-mark.svg', 'utf8');
    const horizontalLogo = readFileSync(
      'public/brand/fustify-logo-horizontal.svg',
      'utf8',
    );
    const monochromeLight = readFileSync(
      'public/brand/fustify-mark-monochrome-light.svg',
      'utf8',
    );
    const monochromeDark = readFileSync(
      'public/brand/fustify-mark-monochrome-dark.svg',
      'utf8',
    );

    for (const path of Object.values(FUSTIFY_MARK_GEOMETRY)) {
      expect(fullColorMark).toContain(path);
      expect(horizontalLogo).toContain(path);
      expect(monochromeLight).toContain(path);
      expect(monochromeDark).toContain(path);
    }
  });

  it('uses reduced geometry for the favicon and is referenced by HTML', () => {
    const favicon = readFileSync('public/favicon.svg', 'utf8');
    const html = readFileSync('index.html', 'utf8');

    for (const path of Object.values(FUSTIFY_FAVICON_GEOMETRY)) {
      expect(favicon).toContain(path);
    }
    expect(favicon).not.toContain(FUSTIFY_MARK_GEOMETRY.westLongitude);
    expect(favicon).not.toContain(FUSTIFY_MARK_GEOMETRY.eastLongitude);
    expect(html).toContain(
      'rel="icon" type="image/svg+xml" href="/favicon.svg"',
    );
  });
});
