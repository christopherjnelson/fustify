# Fustify brand foundation

The supplied globe-and-F artwork is the canonical Fustify logo. Production
assets are cleaned and resized from that approved raster master. When the
product name is presented as a wordmark beside the logo, it uses Orbitron
semibold in uppercase.

## Assets

- `public/brand/fustify-globe-f-master.png` — cleaned 998 px production master
- `public/brand/fustify-globe-f-512.png` — high-density application source
- `public/brand/fustify-globe-f-256.png` — default application source
- `public/favicon-32.png`, `public/favicon-64.png`, and `public/favicon.ico` —
  browser icons
- `public/apple-touch-icon.png` — 180 px home-screen icon
- `src/brand/FustifyMark.tsx` — typed React mark
- `src/brand/FustifyLogo.tsx` — typed React horizontal lockup
- `src/brand/brand.css` — isolated brand tokens and component styles

All PNGs have transparent outer backgrounds. The production master removes the
low-opacity export residue around the supplied artwork and applies a clean
anti-aliased globe edge.

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

The globe remains full color in every variant. The optional variant changes
only wordmark text color for compatibility with light and dark placements.
Decorative instances set `aria-hidden`; meaningful instances render with the
supplied accessible label.

The horizontal lockup uses HTML text with the self-hosted Orbitron semibold
face. Orbitron is intentionally limited to identity and short display samples.
Normal prose that mentions Fustify remains in the body typeface for
readability.

## Preview

Run the Vite development server and open:

`http://127.0.0.1:4173/docs/brand/preview.html`

The preview is a static development document and is not an application route.
