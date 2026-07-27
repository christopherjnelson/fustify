import type { CSSProperties, HTMLAttributes } from 'react';
import { FustifyMark, type FustifyLogoVariant } from './FustifyMark';

const LOGO_HEIGHTS = {
  compact: 32,
  standard: 48,
  large: 64,
} as const;

export type FustifyLogoSize = keyof typeof LOGO_HEIGHTS;

export interface FustifyLogoProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  'children'
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
  style,
  ...svgProps
}: FustifyLogoProps) {
  const height = typeof size === 'number' ? size : LOGO_HEIGHTS[size];
  const accessibilityProps = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ 'aria-label': label, role: 'img' } as const);

  return (
    <span
      {...svgProps}
      {...accessibilityProps}
      className={[
        'fustify-logo',
        `fustify-logo--${variant}`,
        showDescriptor && 'fustify-logo--with-descriptor',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          ...style,
          '--fustify-logo-height': `${height}px`,
        } as CSSProperties
      }
    >
      <FustifyMark
        className="fustify-logo__mark"
        decorative
        size={height}
        style={{ height: '100%', width: 'auto' }}
        variant={variant}
      />
      <span className="fustify-logo__copy" aria-hidden="true">
        <span className="fustify-logo__wordmark">FUSTIFY</span>
        {showDescriptor ? (
          <span className="fustify-logo__descriptor">
            PROCEDURAL GLOBE STRATEGY
          </span>
        ) : null}
      </span>
    </span>
  );
}
