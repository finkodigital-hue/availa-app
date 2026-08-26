import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PUBLIC_KINDS = ["cover", "interior", "exterior", "team", "portfolio", "before-after"];

export const Route = createFileRoute("/api/public-gallery")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const businessId = new URL(request.url).searchParams.get("business_id");
        if (!businessId) return Response.json({ photos: [] }, { status: 400 });

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
