# Fustify brand foundation

This directory documents the initial production logo system derived from the
approved chartreuse concept. The concept image remains an untracked visual
reference only; no raster material from it is embedded in these assets.

## Assets

- `public/brand/fustify-mark.svg` — full-color standalone mark
- `public/brand/fustify-logo-horizontal.svg` — full-color horizontal lockup
- `public/brand/fustify-mark-monochrome-light.svg` — light one-color mark
- `public/brand/fustify-mark-monochrome-dark.svg` — dark one-color mark
- `public/favicon.svg` — simplified small-size mark without globe grid lines
- `src/brand/FustifyMark.tsx` — typed React mark
- `src/brand/FustifyLogo.tsx` — typed React horizontal lockup
- `src/brand/brand.css` — isolated brand tokens and component styles

All SVGs have transparent outer backgrounds. The dark circle in the full-color
mark is intentional logo geometry, not a page-sized background.

## React usage

```tsx
<FustifyMark size={32} variant="full-color" decorative />

<FustifyLogo
  size="compact"
  variant="full-color"
  showDescriptor={false}
  label="Fustify"
/>
```

Supported variants are `full-color`, `monochrome-light`, and
`monochrome-dark`. Decorative instances set `aria-hidden`; meaningful
instances render as an image with the supplied accessible label. Neither
component generates SVG IDs.

The horizontal lockup uses real SVG text and the self-hosted Orbitron semibold
face. Orbitron is intentionally limited to the wordmark and display samples.
The body-font token prefers Inter with system UI fallbacks and does not alter
the application’s existing global typography.

## Geometry synchronization

`src/brand/logoGeometry.ts` is the source of truth for the mark’s path data.
The checked-in SVGs repeat that data so they remain standalone and portable.
Focused tests compare every production mark path with the shared constants;
update both together when geometry changes.

The core assets use only flat fills and strokes. Optional presentation glow is
demonstrated exclusively in `preview.html`.

## Preview

Run the Vite development server and open:

`http://127.0.0.1:4173/docs/brand/preview.html`

The preview is a static development document and is not an application route.
