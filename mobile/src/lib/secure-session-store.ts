type SecureStorage = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

const OLD_PREFIX = "bookzenvo-secure-chunks:v1:";
const PREFIX = "bookzenvo-secure-chunks:v2:";
const MAX_CHUNKS = 128;
const MAX_BYTES = 1700;

function splitUtf8(value: string) {
  const chunks: string[] = [];
  let chunk = "", bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    const size = point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    if (bytes + size > MAX_BYTES) { chunks.push(chunk); chunk = ""; bytes = 0; }
    chunk += character; bytes += size;
  }
  chunks.push(chunk);
  if (chunks.length > MAX_CHUNKS) throw new Error("The session is too large for secure storage.");
  return chunks;
}

function chunkKeys(key: string, value: string | null): string[] | null {
  if (value?.startsWith(OLD_PREFIX)) {
    const count = Number(value.slice(OLD_PREFIX.length));
    return Number.isInteger(count) && count > 0 && count <= MAX_CHUNKS
      ? Array.from({ length: count }, (_, i) => `${key}.chunk.${i}`) : null;
  }
  if (value?.startsWith(PREFIX)) {
    const match = /^([a-z0-9-]+):([0-9]+)$/.exec(value.slice(PREFIX.length));
    const count = Number(match?.[2]);
    return match && count > 0 && count <= MAX_CHUNKS
      ? Array.from({ length: count }, (_, i) => `${key}.chunk.${match[1]}.${i}`) : null;
  }
  return [];
}

export function createSecureSessionStore(storage: SecureStorage) {
  const queues = new Map<string, Promise<unknown>>();
  let generation = 0;
  function serial<T>(key: string, action: () => Promise<T>): Promise<T> {
    const result = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(action);
    queues.set(key, result);
    void result.finally(() => { if (queues.get(key) === result) queues.delete(key); }).catch(() => undefined);
    return result;
  }
  const read = async (key: string) => {
    try { return await storage.getItemAsync(key); } catch { return null; }
  };
  const removeChunks = async (keys: string[]) => {
    // Orphan cleanup cannot invalidate a committed session or restore a removed
    // manifest. The manifest itself is always written/deleted strictly.
    await Promise.all(keys.map(async key => { try { await storage.deleteItemAsync(key); } catch { /* best effort */ } }));
  };
  return {
    getItem(key: string) {
      return serial(key, async () => {
        const value = await read(key);
        const keys = chunkKeys(key, value);
        if (keys === null) return null;
        if (!keys.length) return value;
        const parts = await Promise.all(keys.map(read));
        return parts.every((part): part is string => part !== null) ? parts.join("") : null;
      });
    },
    setItem(key: string, value: string) {
      return serial(key, async () => {
        const oldKeys = chunkKeys(key, await read(key)) ?? [];
        const parts = splitUtf8(value);
        if (parts.length === 1) {
          await storage.setItemAsync(key, value);
          await removeChunks(oldKeys);
          return;
        }
        // A new generation keeps the previous complete session intact if a
        // chunk write fails or the process stops before committing the manifest.
        // This identifier is for uniqueness, not a cryptographic secret.
        const id = `${Date.now().toString(36)}-${(++generation).toString(36)}-${Math.random().toString(36).slice(2)}`;
        const keys = parts.map((_, i) => `${key}.chunk.${id}.${i}`);
        try {
          for (let i = 0; i < parts.length; i++) await storage.setItemAsync(keys[i], parts[i]);
          await storage.setItemAsync(key, `${PREFIX}${id}:${parts.length}`);
        } catch (error) {
          await removeChunks(keys);
          throw error;
        }
        await removeChunks(oldKeys);
      });
    },
    removeItem(key: string) {
      return serial(key, async () => {
        const keys = chunkKeys(key, await read(key)) ?? [];
        await storage.deleteItemAsync(key);
        await removeChunks(keys);
      });
    },
  };
}
