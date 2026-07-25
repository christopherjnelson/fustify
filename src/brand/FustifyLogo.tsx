import type { SVGProps } from 'react';
import { FustifyMark, type FustifyLogoVariant } from './FustifyMark';
import { FUSTIFY_LOGO_VIEW_BOX } from './logoGeometry';

const LOGO_HEIGHTS = {
  compact: 32,
  standard: 48,
  large: 64,
} as const;

export type FustifyLogoSize = keyof typeof LOGO_HEIGHTS;

export interface FustifyLogoProps extends Omit<
  SVGProps<SVGSVGElement>,
  'children' | 'height' | 'width'
> {
  size?: FustifyLogoSize | number;
  variant?: FustifyLogoVariant;
  showDescriptor?: boolean;
  decorative?: boolean;
  label?: string;
}

export function FustifyLogo({
  size = 'standard',
  variant = 'full-color',
  showDescriptor = false,
  decorative = false,
  label = 'Fustify',
  className,
  ...svgProps
}: FustifyLogoProps) {
  const height = typeof size === 'number' ? size : LOGO_HEIGHTS[size];
  const accessibilityProps = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ 'aria-label': label, role: 'img' } as const);

  return (
    <svg
      {...svgProps}
      {...accessibilityProps}
      className={['fustify-logo', `fustify-logo--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      focusable="false"
      height={height}
      viewBox={FUSTIFY_LOGO_VIEW_BOX}
      width={height * 3.4375}
      xmlns="http://www.w3.org/2000/svg"
    >
      <FustifyMark
        className="fustify-logo__mark"
        decorative
        size={128}
        variant={variant}
        x="0"
        y="0"
      />
      <text className="fustify-logo__wordmark" x="151" y="76">
        FUSTIFY
      </text>
      {showDescriptor ? (
        <text className="fustify-logo__descriptor" x="154" y="99">
          PROCEDURAL GLOBE STRATEGY
        </text>
      ) : null}
    </svg>
  );
}
