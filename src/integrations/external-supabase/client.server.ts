// Server-only clients for the EXTERNAL Supabase project.
//
// Import ONLY inside a createServerFn `.handler()` body via `await import(...)`
// or from other `*.server.ts` files. Never import at module scope of a file
// that reaches client bundles (routes, components, or `.functions.ts` top-level).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Anon-key client for the external project. Respects RLS as an unauthenticated
 * caller. Use for reads/writes that a public/anon policy allows.
 */
export function getExternalSupabaseAnon(): SupabaseClient {
  return createClient(
    requireEnv("EXTERNAL_SUPABASE_URL"),
    requireEnv("EXTERNAL_SUPABASE_ANON_KEY"),
    {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

/**
 * Service-role client for the external project. BYPASSES RLS.
 * Use only from trusted server code and after authorizing the caller.
 */
export function getExternalSupabaseAdmin(): SupabaseClient {
  return createClient(
    requireEnv("EXTERNAL_SUPABASE_URL"),
    requireEnv("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
