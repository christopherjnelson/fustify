import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FustifyLogo } from './FustifyLogo';
import { FustifyMark } from './FustifyMark';

const assetPaths = [
  'public/brand/fustify-globe-f-master.png',
  'public/brand/fustify-globe-f-512.png',
  'public/brand/fustify-globe-f-256.png',
  'public/apple-touch-icon.png',
  'public/favicon-64.png',
  'public/favicon-32.png',
] as const;

function pngDimensions(assetPath: string) {
  const png = readFileSync(assetPath);

  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(png.readUInt8(25)).toBe(6);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

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

  it('uses the production raster assets at a predictable size', () => {
    const markup = renderToStaticMarkup(
      createElement(FustifyMark, {
        size: 64,
        variant: 'monochrome-light',
      }),
    );

    expect(markup).toContain('height="64"');
    expect(markup).toContain('width="64"');
    expect(markup).toContain('fustify-mark--monochrome-light');
    expect(markup).toContain('src="/brand/fustify-globe-f-256.png"');
    expect(markup).toContain('/brand/fustify-globe-f-512.png 2x');
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

    expect(markup).toContain('--fustify-logo-height:32px');
    expect(markup).toContain('PROCEDURAL GLOBE STRATEGY');
    expect(markup).toContain('fustify-logo--monochrome-dark');
  });
});

describe('static brand assets', () => {
  it.each(assetPaths)('%s is a square PNG', (assetPath) => {
    const dimensions = pngDimensions(assetPath);

    expect(dimensions.width).toBe(dimensions.height);
  });

  it('keeps expected production dimensions', () => {
    expect(pngDimensions('public/brand/fustify-globe-f-master.png')).toEqual({
      width: 998,
      height: 998,
    });
    expect(pngDimensions('public/brand/fustify-globe-f-512.png')).toEqual({
      width: 512,
      height: 512,
    });
    expect(pngDimensions('public/brand/fustify-globe-f-256.png')).toEqual({
      width: 256,
      height: 256,
    });
  });

  it('references the PNG favicon and Apple touch icon from HTML', () => {
    const html = readFileSync('index.html', 'utf8');

    expect(html).toContain(
      'rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"',
    );
    expect(html).toContain(
      'rel="apple-touch-icon" href="/apple-touch-icon.png"',
    );
  });
});
