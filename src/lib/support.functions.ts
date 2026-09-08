/* eslint-disable @typescript-eslint/no-explicit-any -- Support tables are server-only and intentionally absent from browser types. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KINDS = new Set(["support", "feedback"]);
const CATEGORIES = new Set(["idea", "issue", "other"]);
const URGENCIES = new Set(["normal", "urgent"]);

function clean(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

async function requesterBusinessId(context: any) {
  const { data, error } = await context.supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Record<string, unknown>) => {
    const kind = clean(input.kind, 20);
    const category = clean(input.category, 20);
    const subject = clean(input.subject, 200);
    const message = clean(input.message, 4000);
    const urgency = clean(input.urgency, 20) || "normal";
    if (!KINDS.has(kind)) throw new Error("Choose a valid request type.");
    if (kind === "feedback" && !CATEGORIES.has(category))
      throw new Error("Choose a feedback category.");
    if (subject.length < 3) throw new Error("Give it a short subject first.");
    if (message.length < 5) throw new Error("Please add a little more detail.");
    if (!URGENCIES.has(urgency)) throw new Error("Choose a valid urgency.");
    return {
      kind,
      category: kind === "feedback" ? category : null,
      subject,
      message,
      urgency,
    };
  })
  .handler(async ({ data, context }) => {
    const businessId = await requesterBusinessId(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const contactEmail =
      typeof context.claims?.email === "string"
        ? context.claims.email.slice(0, 320)
        : null;
    const { data: ticket, error } = await (supabaseAdmin as any)
      .from("support_tickets")
      .insert({
        business_id: businessId,
        requester_id: context.userId,
        contact_email: contactEmail,
        ...data,
      })
      .select("id,ticket_number,status,created_at")
      .single();
    if (error) throw error;
    const { error: historyError } = await (supabaseAdmin as any)
      .from("support_ticket_events")
      .insert([
        {
          ticket_id: ticket.id,
          actor_type: "requester",
          event_type: "submitted",
          body: data.message,
        },
        {
          ticket_id: ticket.id,
          actor_type: "system",
          event_type: "acknowledgement",
          body: "We received your request. The Bookzenvo support team will review it and reply here.",
        },
      ]);
    if (historyError) {
      await (supabaseAdmin as any)
        .from("support_tickets")
        .delete()
        .eq("id", ticket.id)
        .eq("requester_id", context.userId);
      throw historyError;
    }
    return ticket as {
      id: string;
      ticket_number: number;
      status: string;
      created_at: string;
    };
  });

export const getMySupportTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: tickets, error } = await (supabaseAdmin as any)
      .from("support_tickets")
      .select(
        "id,ticket_number,kind,category,subject,urgency,status,created_at,updated_at,resolved_at",
      )
      .eq("requester_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    const ids = (tickets ?? []).map((ticket: any) => ticket.id);
    if (!ids.length) return [];
    const { data: events, error: eventsError } = await (supabaseAdmin as any)
      .from("support_ticket_events")
      .select(
        "id,ticket_id,actor_type,event_type,body,from_status,to_status,created_at",
      )
      .in("ticket_id", ids)
      .eq("visible_to_requester", true)
      .order("created_at", { ascending: true });
    if (eventsError) throw eventsError;
    return (tickets ?? []).map((ticket: any) => ({
      ...ticket,
      events: (events ?? []).filter(
        (event: any) => event.ticket_id === ticket.id,
      ),
    }));
  });

export const replyToSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { ticketId: string; message: string }) => {
    const ticketId = clean(input.ticketId, 36);
    const message = clean(input.message, 4000);
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(ticketId))
      throw new Error("That ticket could not be found.");
    if (message.length < 2) throw new Error("Add a reply first.");
    return { ticketId, message };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: ticket, error } = await (supabaseAdmin as any)
      .from("support_tickets")
      .select("id,status")
      .eq("id", data.ticketId)
      .eq("requester_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!ticket) throw new Error("That ticket could not be found.");
    if (ticket.status === "closed")
      throw new Error("This ticket is closed. Please start a new request.");
    const { error: replyError } = await (supabaseAdmin as any)
      .from("support_ticket_events")
      .insert({
        ticket_id: ticket.id,
        actor_type: "requester",
        event_type: "reply",
        body: data.message,
      });
    if (replyError) throw replyError;
    return { saved: true };
  });
