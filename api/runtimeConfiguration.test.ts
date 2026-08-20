import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FUSTIFY_API_HOST,
  resolveFustifyApiHost,
} from './runtimeConfiguration';

describe('resolveFustifyApiHost', () => {
  it('keeps the API loopback-only by default', () => {
    expect(resolveFustifyApiHost(undefined)).toBe(DEFAULT_FUSTIFY_API_HOST);
  });

  it('allows container networking explicitly', () => {
    expect(resolveFustifyApiHost('0.0.0.0')).toBe('0.0.0.0');
  });

  it('rejects arbitrary bind addresses', () => {
    expect(() => resolveFustifyApiHost('192.0.2.10')).toThrow(
      'FUSTIFY_API_HOST must be 127.0.0.1 or 0.0.0.0.',
    );
  });
});
