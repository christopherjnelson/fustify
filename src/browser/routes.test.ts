import { describe, expect, it } from 'vitest';
import { isAdminRoute } from './routes';

describe('application routes', () => {
  it('recognizes only the admin pathname as the admin application', () => {
    expect(isAdminRoute('/admin')).toBe(true);
    expect(isAdminRoute('/admin/')).toBe(true);
    expect(isAdminRoute('/')).toBe(false);
    expect(isAdminRoute('/game')).toBe(false);
  });
});
