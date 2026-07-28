import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// iOS SecureStore warns (and may eventually reject) values over roughly 2 KB.
// A Supabase session can exceed that once user metadata and provider tokens are
// included, so store it in small encrypted pieces instead of risking a lost
// owner session after the app is restarted.
const MAX_SECURE_STORE_CHUNK_SIZE = 1_700;
const CHUNK_MANIFEST_PREFIX = "bookzenvo-secure-chunks:v1:";
const chunkKey = (key: string, index: number) => `${key}:chunk:${index}`;

const secureStore = {
  async getItem(key: string) {
    const value = await SecureStore.getItemAsync(key);
    if (!value?.startsWith(CHUNK_MANIFEST_PREFIX)) return value;

    const chunkCount = Number(value.slice(CHUNK_MANIFEST_PREFIX.length));
    if (!Number.isInteger(chunkCount) || chunkCount < 1) return null;

    const chunks = await Promise.all(
      Array.from({ length: chunkCount }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))),
    );
    return chunks.every((chunk): chunk is string => typeof chunk === "string") ? chunks.join("") : null;
  },
  async setItem(key: string, value: string) {
    const previous = await SecureStore.getItemAsync(key);
    const previousChunkCount = previous?.startsWith(CHUNK_MANIFEST_PREFIX)
      ? Number(previous.slice(CHUNK_MANIFEST_PREFIX.length))
      : 0;

    if (value.length <= MAX_SECURE_STORE_CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      if (Number.isInteger(previousChunkCount) && previousChunkCount > 0) {
        await Promise.all(
          Array.from({ length: previousChunkCount }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index))),
        );
      }
      return;
    }

    const chunks = Array.from(
      { length: Math.ceil(value.length / MAX_SECURE_STORE_CHUNK_SIZE) },
      (_, index) => value.slice(index * MAX_SECURE_STORE_CHUNK_SIZE, (index + 1) * MAX_SECURE_STORE_CHUNK_SIZE),
    );
    await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)));
    await SecureStore.setItemAsync(key, `${CHUNK_MANIFEST_PREFIX}${chunks.length}`);

    if (Number.isInteger(previousChunkCount) && previousChunkCount > chunks.length) {
      await Promise.all(
        Array.from(
          { length: previousChunkCount - chunks.length },
          (_, index) => SecureStore.deleteItemAsync(chunkKey(key, chunks.length + index)),
        ),
      );
    }
  },
  async removeItem(key: string) {
    const value = await SecureStore.getItemAsync(key);
    const chunkCount = value?.startsWith(CHUNK_MANIFEST_PREFIX)
      ? Number(value.slice(CHUNK_MANIFEST_PREFIX.length))
      : 0;

    await SecureStore.deleteItemAsync(key);
    if (Number.isInteger(chunkCount) && chunkCount > 0) {
      await Promise.all(
        Array.from({ length: chunkCount }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index))),
      );
    }
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        storage: secureStore,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

if (supabase) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
