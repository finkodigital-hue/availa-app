import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { createSecureSessionStore } from "./secure-session-store";
import { resolveMobileConfiguration } from "./mobile-config";
import { createTimedFetch } from "./timed-fetch";

export const mobileConfiguration = resolveMobileConfiguration(process.env.EXPO_PUBLIC_APP_URL, __DEV__);
const supabaseUrl = mobileConfiguration?.supabaseUrl;
// The website gateway supplies the real publishable key on the server.
const supabaseKey = "sb_publishable_browser_proxy";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// Persist sessions in bounded UTF-8 chunks with atomic manifest replacement.
export const secureStore = createSecureSessionStore(SecureStore);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      global: { fetch: createTimedFetch(fetch) },
      auth: {
        storage: secureStore,
        storageKey: mobileConfiguration!.authStorageKey,
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
