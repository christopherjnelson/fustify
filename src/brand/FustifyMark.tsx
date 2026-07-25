import type { CSSProperties, SVGProps } from 'react';
import { FUSTIFY_MARK_GEOMETRY, FUSTIFY_MARK_VIEW_BOX } from './logoGeometry';
import './brand.css';

export type FustifyLogoVariant =
  'full-color' | 'monochrome-light' | 'monochrome-dark';

export interface FustifyMarkProps extends Omit<
  SVGProps<SVGSVGElement>,
  'children' | 'height' | 'width'
> {
  size?: number;
  variant?: FustifyLogoVariant;
  decorative?: boolean;
  label?: string;
  color?: CSSProperties['color'];
}

export function FustifyMark({
  size = 32,
  variant = 'full-color',
  decorative = false,
  label = 'Fustify',
  color,
  className,
  style,
  ...svgProps
}: FustifyMarkProps) {
  const accessibilityProps = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ 'aria-label': label, role: 'img' } as const);

  return (
    <svg
      {...svgProps}
      {...accessibilityProps}
      className={['fustify-mark', `fustify-mark--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      focusable="false"
      height={size}
      style={{ ...style, color }}
      viewBox={FUSTIFY_MARK_VIEW_BOX}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle className="fustify-mark__field" cx="64" cy="64" r="54.5" />
      <circle className="fustify-mark__rim" cx="64" cy="64" r="55" />
      <g className="fustify-mark__grid">
        <path d={FUSTIFY_MARK_GEOMETRY.westLongitude} />
        <path d={FUSTIFY_MARK_GEOMETRY.eastLongitude} />
        <path d={FUSTIFY_MARK_GEOMETRY.northLatitude} />
        <path d={FUSTIFY_MARK_GEOMETRY.southLatitude} />
      </g>
      <g className="fustify-mark__orbit">
        <path d={FUSTIFY_MARK_GEOMETRY.orbitLead} />
        <path d={FUSTIFY_MARK_GEOMETRY.orbitFollow} />
        <circle cx="111.5" cy="28.5" r="5.5" />
      </g>
      <path
        className="fustify-mark__letter"
        d={FUSTIFY_MARK_GEOMETRY.letterF}
      />
    </svg>
  );
}
