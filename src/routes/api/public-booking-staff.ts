import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isTenantAssetPath, safeImageSrc } from "@/lib/safe-url";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PublicStaffRow = {
  id: string;
  name: string;
  role: string | null;
  business_id: string;
  photo_url: string | null;
};

async function resolvePhotoUrl(value: string | null, businessId: string) {
  const safeValue = safeImageSrc(value);
  if (!safeValue) return null;
  if (/^https?:\/\//i.test(safeValue)) return safeValue;

  // Relative storage paths must belong to the same business as the staff
  // row. Without this check a compromised/incorrect row could make this
  // service-role endpoint sign another salon's private asset.
  if (!isTenantAssetPath(safeValue, businessId)) return null;

  const { data, error } = await supabaseAdmin.storage
    .from("business-assets")
    .createSignedUrl(safeValue, 3600);

  return error ? null : (data?.signedUrl ?? null);
}

export const Route = createFileRoute("/api/public-booking-staff")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const rawIds =
          new URL(request.url).searchParams.get("service_ids") ?? "";
        const serviceIds = Array.from(
          new Set(
            rawIds
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean),
          ),
        );

        if (
          serviceIds.length === 0 ||
          serviceIds.length > 50 ||
          serviceIds.some((id) => !UUID_PATTERN.test(id))
        ) {
          return Response.json({ staff: [] }, { status: 400 });
        }

        const { data: services, error: servicesError } = await supabaseAdmin
          .from("services")
          .select("id, business_id")
          .in("id", serviceIds)
          .eq("active", true);

        if (servicesError) {
          return Response.json({ staff: [] }, { status: 500 });
        }

        const activeServices = services ?? [];
        if (activeServices.length === 0) return Response.json({ staff: [] });

        const activeServiceIds = activeServices.map((service) => service.id);
        const { data: links, error: linksError } = await supabaseAdmin
          .from("service_staff")
          .select("staff_id, service_id")
          .in("service_id", activeServiceIds);

        if (linksError) {
          return Response.json({ staff: [] }, { status: 500 });
        }

        const linkedByService = new Map<string, string[]>();
        for (const link of links ?? []) {
          const linked = linkedByService.get(link.service_id) ?? [];
          linked.push(link.staff_id);
          linkedByService.set(link.service_id, linked);
        }

        const staffIds = new Set<string>();
        const fallbackBusinessIds = new Set<string>();
        for (const service of activeServices) {
          const linked = linkedByService.get(service.id);
          if (linked?.length) linked.forEach((id) => staffIds.add(id));
          else fallbackBusinessIds.add(service.business_id);
        }

        const rows: PublicStaffRow[] = [];
        if (staffIds.size > 0) {
          const { data, error } = await supabaseAdmin
            .from("public_staff")
            .select("id, name, role, business_id, photo_url")
            .in("id", Array.from(staffIds));
          if (error) return Response.json({ staff: [] }, { status: 500 });
          rows.push(...((data ?? []) as PublicStaffRow[]));
        }

        if (fallbackBusinessIds.size > 0) {
          const { data, error } = await supabaseAdmin
            .from("public_staff")
            .select("id, name, role, business_id, photo_url")
            .in("business_id", Array.from(fallbackBusinessIds));
          if (error) return Response.json({ staff: [] }, { status: 500 });
          rows.push(...((data ?? []) as PublicStaffRow[]));
        }

        const uniqueRows = Array.from(
          new Map(rows.map((staff) => [staff.id, staff])).values(),
        ).sort((a, b) => a.name.localeCompare(b.name));

        const staff = await Promise.all(
          uniqueRows.map(async (person) => ({
            id: person.id,
            name: person.name,
            role: person.role,
            business_id: person.business_id,
            photoUrl: await resolvePhotoUrl(person.photo_url, person.business_id),
          })),
        );

        return Response.json(
          { staff },
          { headers: { "Cache-Control": "public, max-age=60" } },
        );
      },
    },
  },
});
