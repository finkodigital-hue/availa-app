type PublicRuntimeEnv = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

declare global {
  interface Window {
    __BOOKZENVO_ENV__?: PublicRuntimeEnv;
  }
}

export function getPublicSupabaseEnvironment(): PublicRuntimeEnv {
  if (typeof window !== "undefined") {
    return {
      // The browser talks only to Bookzenvo's same-origin gateway. The real
      // Supabase project URL and publishable key remain server-side.
      supabaseUrl: `${window.location.origin}/api/supabase`,
      // supabase-js requires a non-empty key. The gateway replaces this
      // deliberately non-secret marker with the real server-side key.
      supabasePublishableKey: "sb_publishable_browser_proxy",
    };
  }

  return {
    // Never reference VITE_* Supabase variables here. Vite replaces them in
    // browser bundles even when this server-only branch is not executed.
    supabaseUrl: process.env.SUPABASE_URL,
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  };
}
