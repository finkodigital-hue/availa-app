import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function publicName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || "Customer";
  return `${parts[0]} ${parts.at(-1)![0].toUpperCase()}.`;
}

export const Route = createFileRoute("/api/public-reviews")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const businessId = new URL(request.url).searchParams.get("business_id");
        if (!businessId) return Response.json({ reviews: [] }, { status: 400 });
        const { data: business } = await (supabaseAdmin as any)
          .from("public_businesses")
          .select("id")
          .eq("id", businessId)
          .maybeSingle();
        if (!business) return Response.json({ reviews: [] }, { status: 404 });
        const { data: rows, error } = await (supabaseAdmin as any)
          .from("customer_reviews")
          .select(
            "id, rating, body, reviewer_name, submitted_at, source, verified, bookings(services(name))",
          )
          .eq("business_id", businessId)
          .eq("status", "published")
          .not("publication_consent_at", "is", null)
          .order("submitted_at", { ascending: false })
          .limit(50);
        if (error) return Response.json({ reviews: [] }, { status: 500 });
        return Response.json(
          {
            reviews: (rows ?? []).map((row: any) => ({
              id: row.id,
              rating: row.rating,
              body: row.body,
              reviewerName: publicName(row.reviewer_name),
              submittedAt: row.submitted_at,
              serviceName: row.bookings?.services?.name ?? null,
              verified: row.source === "bookzenvo" && row.verified,
            })),
          },
          { headers: { "Cache-Control": "public, max-age=60" } },
        );
      },
    },
  },
});
