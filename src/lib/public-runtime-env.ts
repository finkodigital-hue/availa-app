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
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL || window.__BOOKZENVO_ENV__?.supabaseUrl,
      supabasePublishableKey:
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || window.__BOOKZENVO_ENV__?.supabasePublishableKey,
    };
  }

  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    supabasePublishableKey:
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY,
  };
}
