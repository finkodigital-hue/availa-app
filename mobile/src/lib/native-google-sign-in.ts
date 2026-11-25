import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { createGoogleSignIn } from "./google-sign-in";
import { mobileConfiguration, secureStore, supabase } from "./supabase";
import { createTimedFetch } from "./timed-fetch";

// Enable only after the provider callback and a signed device build are verified.
export const googleSignInEnabled = process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED === "true" &&
  Platform.OS !== "web" && mobileConfiguration?.appUrl.startsWith("https://") === true;

export const nativeGoogleSignIn = mobileConfiguration && supabase ? createGoogleSignIn({
  enabled: googleSignInEnabled,
  gateway: mobileConfiguration.supabaseUrl,
  storageKey: mobileConfiguration.authStorageKey,
  storage: secureStore,
  auth: supabase.auth,
  randomBytes: () => Crypto.getRandomBytesAsync(32),
  sha256Base64: value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, { encoding: Crypto.CryptoEncoding.BASE64 }),
  openBrowser: (url, callback) => WebBrowser.openAuthSessionAsync(url, callback),
  fetch: createTimedFetch(fetch),
}) : null;
