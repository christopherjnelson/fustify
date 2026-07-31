import { Children, type ReactElement, type ReactNode } from 'react';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  GLOBE_ATMOSPHERE_COLOR,
  GLOBE_ATMOSPHERE_OPACITY,
  GLOBE_ATMOSPHERE_SCALE,
  GLOBE_FILL_LIGHT_COLOR,
  GLOBE_FILL_LIGHT_INTENSITY,
  GLOBE_KEY_LIGHT_COLOR,
  GLOBE_KEY_LIGHT_INTENSITY,
  GlobeAtmosphere,
  GlobeLighting,
} from './GlobeAppearance';

interface SceneNodeProps {
  blending?: number;
  children?: ReactNode;
  color?: string;
  depthWrite?: boolean;
  intensity?: number;
  opacity?: number;
  scale?: number;
  side?: number;
}

describe('GlobeAppearance', () => {
  it('renders the shared warm key and subdued blue fill lights', () => {
    const lighting = GlobeLighting() as ReactElement<SceneNodeProps>;
    const [, keyLight, fillLight] = Children.toArray(
      lighting.props.children,
    ) as ReactElement<SceneNodeProps>[];

    expect(keyLight?.props.color).toBe(GLOBE_KEY_LIGHT_COLOR);
    expect(keyLight?.props.intensity).toBe(GLOBE_KEY_LIGHT_INTENSITY);
    expect(fillLight?.props.color).toBe(GLOBE_FILL_LIGHT_COLOR);
    expect(fillLight?.props.intensity).toBe(GLOBE_FILL_LIGHT_INTENSITY);
  });

  it('renders one shared amber additive atmosphere shell', () => {
    const atmosphere = GlobeAtmosphere() as ReactElement<SceneNodeProps>;
    const [, material] = Children.toArray(
      atmosphere.props.children,
    ) as ReactElement<SceneNodeProps>[];

    expect(atmosphere.props.scale).toBe(GLOBE_ATMOSPHERE_SCALE);
    expect(material?.props.color).toBe(GLOBE_ATMOSPHERE_COLOR);
    expect(material?.props.opacity).toBe(GLOBE_ATMOSPHERE_OPACITY);
    expect(material?.props.side).toBe(THREE.BackSide);
    expect(material?.props.blending).toBe(THREE.AdditiveBlending);
    expect(material?.props.depthWrite).toBe(false);
  });
});
