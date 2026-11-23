import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';

export type Bucket = 'bills' | 'identity_documents' | 'income_documents' | 'verification_evidence' | 'public_assets';

export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

const KEY_PATTERN = /^(bills|identity_documents|income_documents|verification_evidence|public_assets)\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.[a-z0-9]{2,5}$/;

export function isValidStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * Local private storage. Files live outside `public/` and are only served by an
 * authenticated route after a signature check, so a file path is never a URL.
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly baseDir: string) {}

  private resolve(key: string): string {
    if (!isValidStorageKey(key)) throw new Error('Invalid storage key');
    const full = path.resolve(this.baseDir, key);
    const base = path.resolve(this.baseDir);
    if (!full.startsWith(base + path.sep)) throw new Error('Path traversal blocked');
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data, { mode: 0o600 });
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      const info = await stat(this.resolve(key));
      return info.isFile();
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch {
      // already gone
    }
  }
}

let provider: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!provider) {
    provider = new LocalStorageProvider(path.resolve(env().LOCAL_STORAGE_DIR));
  }
  return provider;
}

export function setStorageForTests(next: StorageProvider): void {
  provider = next;
}

/** Unpredictable, non-identifying key: bucket/YYYY/MM/uuid.ext */
export function newStorageKey(bucket: Bucket, extension: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return `${bucket}/${year}/${month}/${crypto.randomUUID()}.${ext}`;
}
