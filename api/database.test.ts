import { describe, expect, it, vi } from 'vitest';
import { createDatabasePool } from './database.ts';
describe('database configuration', () => {
  it('creates a bounded application pool', async () => {
    const pool = createDatabasePool({
      connectionString: 'postgresql://fustify:secret@database/fustify',
    });
    expect(pool.options.max).toBe(10);
    expect(pool.options.idleTimeoutMillis).toBe(30_000);
    expect(pool.options.connectionTimeoutMillis).toBe(5_000);
    const end = vi.spyOn(pool, 'end').mockResolvedValue();
    await pool.end();
    expect(end).toHaveBeenCalledOnce();
  });
});
