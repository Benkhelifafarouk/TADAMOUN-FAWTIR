import { afterAll, beforeAll } from 'vitest';
import { createDb, setDbForTests, closeDb } from '@/lib/db';
import { migrate, runSeeds } from '@/lib/db/migrate';
import { setStorageForTests, type StorageProvider } from '@/lib/storage';

/** In-memory private storage so tests never touch the developer's disk. */
class MemoryStorage implements StorageProvider {
  private readonly files = new Map<string, Buffer>();

  async put(key: string, data: Buffer): Promise<void> {
    this.files.set(key, data);
  }
  async get(key: string): Promise<Buffer> {
    const value = this.files.get(key);
    if (!value) throw new Error('not found');
    return value;
  }
  async exists(key: string): Promise<boolean> {
    return this.files.has(key);
  }
  async remove(key: string): Promise<void> {
    this.files.delete(key);
  }
}

/**
 * Boots an isolated embedded PostgreSQL instance with the real migrations and
 * reference seed. Each test file owns its database.
 */
export function setupTestDatabase(): void {
  beforeAll(async () => {
    const db = await createDb({ driver: 'pglite', dataDir: null });
    await migrate(db);
    await runSeeds(db);
    setDbForTests(db);
    setStorageForTests(new MemoryStorage());
  }, 120_000);

  afterAll(async () => {
    await closeDb();
    setStorageForTests(null as unknown as StorageProvider);
  });
}
