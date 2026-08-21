import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FUSTIFY_API_HOST,
  resolveFustifyApiHost,
} from './runtimeConfiguration.ts';

describe('API host configuration', () => {
  it('uses loopback unless container binding is explicit', () => {
    expect(resolveFustifyApiHost(undefined)).toBe(DEFAULT_FUSTIFY_API_HOST);
    expect(resolveFustifyApiHost('0.0.0.0')).toBe('0.0.0.0');
  });

  it('rejects arbitrary interfaces', () => {
    expect(() => resolveFustifyApiHost('example.com')).toThrow(
      'FUSTIFY_API_HOST must be 127.0.0.1 or 0.0.0.0.',
    );
  });
});
