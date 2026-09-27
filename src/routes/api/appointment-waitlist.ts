/* eslint-disable @typescript-eslint/no-explicit-any -- Waitlist table types are generated after the migration is applied. */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  consumePublicRequest,
  publicRequestLimitResponse,
} from "@/lib/public-request-limit.server";
import { readJsonWithLimit } from "@/lib/request-limits";
import { salonDateWindow } from "@/lib/appointment-waitlist";

type Submission = Record<string, unknown>;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TIME = new Set(["any", "morning", "afternoon", "evening"]);

export const Route = createFileRoute("/api/appointment-waitlist")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("origin") !== new URL(request.url).origin)
          return new Response(null, { status: 403 });
        const parsed = await readJsonWithLimit<Submission>(request, 4096);
        if ("error" in parsed) return parsed.error;
        const input = parsed.value ?? {};
        const businessId = String(input.businessId ?? "");
        const serviceId = String(input.serviceId ?? "");
        const staffId = input.staffId ? String(input.staffId) : null;
        const name = String(input.name ?? "").trim();
        const email = String(input.email ?? "")
          .trim()
          .toLowerCase();
        const phone = String(input.phone ?? "").trim();
        const preferredTime = String(input.preferredTime ?? "any");
        const from = String(input.from ?? "");
        const through = String(input.through ?? "");
        if (
          !UUID.test(businessId) ||
          !UUID.test(serviceId) ||
          (staffId && !UUID.test(staffId)) ||
          !name ||
          name.length > 120 ||
          !EMAIL.test(email) ||
          email.length > 254 ||
          phone.length > 50 ||
          !TIME.has(preferredTime) ||
          input.consent !== true ||
          !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(through)
        )
          return Response.json(
            { message: "Please check your details and selected dates." },
            { status: 400 },
          );
        try {
          await consumePublicRequest("waitlist", { headers: request.headers });
        } catch (error) {
          return publicRequestLimitResponse(error);
        }
        // No direct anonymous table grants: this is the sole public writer.
        const db = supabaseAdmin as any;
        const { data: business, error: businessError } = await db
          .from("businesses")
          .select("id,timezone")
          .eq("id", businessId)
          .is("deletion_requested_at", null)
          .maybeSingle();
        if (businessError || !business)
          return Response.json(
            { message: "This salon is unavailable." },
            { status: 404 },
          );
        let window: ReturnType<typeof salonDateWindow>;
        try {
          window = salonDateWindow(from, through, business.timezone || "UTC");
        } catch {
          return Response.json(
            { message: "Choose valid dates within the next 61 days." },
            { status: 400 },
          );
        }
        if (
          Date.parse(window.before) <= Date.now() ||
          Date.parse(window.after) > Date.now() + 61 * 86_400_000
        )
          return Response.json(
            { message: "Choose dates within the next 61 days." },
            { status: 400 },
          );
        const { data: service, error: serviceError } = await db
          .from("services")
          .select("id")
          .eq("id", serviceId)
          .eq("business_id", businessId)
          .eq("active", true)
          .maybeSingle();
        if (serviceError || !service)
          return Response.json(
            { message: "Choose an available service." },
            { status: 400 },
          );
        if (staffId) {
          const { data: staff, error: staffError } = await db
            .from("staff")
            .select("id")
            .eq("id", staffId)
            .eq("business_id", businessId)
            .eq("active", true)
            .eq("bookable", true)
            .maybeSingle();
          if (staffError || !staff)
            return Response.json(
              { message: "Choose an available team member." },
              { status: 400 },
            );
          const { data: links, error: linkError } = await db
            .from("service_staff")
            .select("staff_id")
            .eq("business_id", businessId)
            .eq("service_id", serviceId)
            .limit(1);
          if (linkError)
            return Response.json(
              { message: "Please try again later." },
              { status: 503 },
            );
          if (links?.length) {
            const { data: permitted, error: permittedError } = await db
              .from("service_staff")
              .select("staff_id")
              .eq("business_id", businessId)
              .eq("service_id", serviceId)
              .eq("staff_id", staffId)
              .maybeSingle();
            if (permittedError || !permitted)
              return Response.json(
                { message: "That team member does not offer this service." },
                { status: 400 },
              );
          }
        }
        const { error } = await db
          .from("appointment_waitlist_requests")
          .insert({
            business_id: businessId,
            service_id: serviceId,
            preferred_staff_id: staffId,
            customer_name: name,
            customer_email: email,
            customer_phone: phone || null,
            preferred_after: window.after,
            preferred_before: window.before,
            preferred_time: preferredTime,
          });
        if (error) {
          console.error("Appointment waitlist request failed", error.code);
          return Response.json(
            { message: "Could not save your request. Please try again." },
            { status: 503 },
          );
        }
        return Response.json({
          ok: true,
          message:
            "Request saved. The salon may contact you if a suitable time becomes available. This is not a booking.",
        });
      },
    },
  },
});
