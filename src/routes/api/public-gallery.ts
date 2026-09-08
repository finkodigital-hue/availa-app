import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isTenantAssetPath } from "@/lib/safe-url";

const PUBLIC_KINDS = ["cover", "interior", "exterior", "team", "portfolio", "before-after"];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public-gallery")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const businessId = new URL(request.url).searchParams.get("business_id");
        if (!businessId || !UUID_PATTERN.test(businessId)) {
          return Response.json({ photos: [] }, { status: 400 });
        }

        const { data: business } = await (supabaseAdmin as any)
          .from("public_businesses")
          .select("id")
          .eq("id", businessId)
          .maybeSingle();
        if (!business) return Response.json({ photos: [] }, { status: 404 });

        const { data: rows } = await (supabaseAdmin as any)
          .from("business_media")
          .select("id, kind, path, sort_order")
          .eq("business_id", businessId)
          .in("kind", PUBLIC_KINDS)
          .order("sort_order");

        const photos = await Promise.all(
          (rows ?? []).map(async (row: any) => {
            // Storage paths are tenant-scoped. Do not turn a malformed or
            // cross-business row into a public signed URL, even if a legacy
            // database row predates the path constraint migration.
            if (
              !isTenantAssetPath(row.path, businessId)
            ) {
              return null;
            }
            const { data } = await supabaseAdmin.storage
              .from("business-assets")
              .createSignedUrl(row.path, 3600);
            return data?.signedUrl ? { id: row.id, kind: row.kind, url: data.signedUrl } : null;
          }),
        );

        return Response.json(
          { photos: photos.filter(Boolean) },
          {
            headers: { "Cache-Control": "public, max-age=300" },
          },
        );
      },
    },
  },
});
