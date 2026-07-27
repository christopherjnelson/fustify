import type { CSSProperties, ImgHTMLAttributes } from 'react';

export type FustifyLogoVariant =
  'full-color' | 'monochrome-light' | 'monochrome-dark';

export interface FustifyMarkProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'alt' | 'children' | 'height' | 'src' | 'srcSet' | 'width'
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
  return (
    <img
      {...svgProps}
      alt={decorative ? '' : label}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className={['fustify-mark', `fustify-mark--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      draggable={false}
      height={size}
      role={decorative ? undefined : 'img'}
      src="/brand/fustify-globe-f-256.png"
      srcSet="/brand/fustify-globe-f-256.png 1x, /brand/fustify-globe-f-512.png 2x"
      style={{ color, height: size, width: size, ...style }}
      width={size}
    />
  );
}
