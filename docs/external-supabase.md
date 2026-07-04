# Connecting an external Supabase project

This app runs on Lovable Cloud (its own Supabase instance) but can also talk to a
**second, external** Supabase project you control.

## 1. Configure the secrets

Three secrets are stored in Lovable (Cloud → Secrets), available as
`process.env` in server code:

| Secret | Purpose |
| --- | --- |
| `EXTERNAL_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
| `EXTERNAL_SUPABASE_ANON_KEY` | Public "anon" key — respects RLS |
| `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` | Service-role key — **bypasses RLS** |

Update them any time in Cloud settings; no code change needed.

## 2. Use the clients (server-only)

Import from `@/integrations/external-supabase/client.server` **inside a server
function handler**, never at module scope of a client-reachable file:

```ts
// src/lib/external.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Public/anon read — safe to expose via a server fn
export const listExternalProducts = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getExternalSupabaseAnon } = await import(
      "@/integrations/external-supabase/client.server"
    );
    const supabase = getExternalSupabaseAnon();
    const { data, error } = await supabase
      .from("products")
      .select("id, name, price_cents")
      .eq("is_public", true);
    if (error) throw error;
    return data ?? [];
  },
);

// Privileged write — verify the caller first, then use service role
export const syncExternalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { orderId: string }) => v)
  .handler(async ({ data, context }) => {
    // authorize: only admins of THIS app can sync
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { getExternalSupabaseAdmin } = await import(
      "@/integrations/external-supabase/client.server"
    );
    const external = getExternalSupabaseAdmin();
    const { error } = await external
      .from("orders")
      .update({ synced_at: new Date().toISOString() })
      .eq("id", data.orderId);
    if (error) throw error;
    return { ok: true };
  });
```

Call these from components with `useServerFn`, or from `_authenticated` loaders.

### Why server-only?

- The service-role key **must never** reach the browser.
- Even the anon key + URL are kept server-side here so keys can be rotated in
  Cloud settings without a redeploy of the frontend bundle.

## 3. Required RLS policies on the external project

For each table you plan to reach with the **anon key**, on the external Supabase
project (SQL editor there, not here):

```sql
-- 1. Enable RLS on every table you expose
alter table public.products enable row level security;

-- 2. Data API grants (Supabase does NOT grant these by default)
grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;

-- 3. Anon read policy — narrow it as much as possible
create policy "Public products are readable by anon"
on public.products for select
to anon
using (is_public = true);
```

Rules of thumb:

- **Never** write policies like `using (true)` unless the whole table is truly public.
- Project only safe columns in your `select(...)` calls — RLS filters rows, not columns.
- Writes from the app should go through the **service-role** path, gated by an
  authorization check in the server function (see `syncExternalOrder` above).
- If you want end-users of this app to write to the external project as
  themselves, you'd need to share Supabase Auth between the two projects — out
  of scope here; ask if you need it.

## 4. Rotating keys

Rotate in the external Supabase dashboard, then update
`EXTERNAL_SUPABASE_ANON_KEY` / `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` in Cloud →
Secrets. Server functions pick up the new value on the next invocation.
