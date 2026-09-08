/* eslint-disable @typescript-eslint/no-explicit-any -- Ticket rows come from server-only tables intentionally excluded from browser database types. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LifeBuoy, Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth";
import {
  createSupportTicket,
  getMySupportTickets,
  replyToSupportTicket,
} from "@/lib/support.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const URGENCY = [
  { value: "normal", label: "Normal" },
  { value: "urgent", label: "Urgent — I'm blocked" },
] as const;

export function ContactSupportDialog() {
  const { user } = useAuth();
  const createTicket = useServerFn(createSupportTicket);
  const loadTickets = useServerFn(getMySupportTickets);
  const replyToTicket = useServerFn(replyToSupportTicket);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [urgency, setUrgency] =
    useState<(typeof URGENCY)[number]["value"]>("normal");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const tickets = useQuery({
    queryKey: ["my-support-tickets", user?.id],
    enabled: open && !!user,
    queryFn: async () =>
      loadTickets({ headers: await getServerFnAuthHeaders() }),
  });

  const submit = async () => {
    if (subject.trim().length < 3)
      return toast.error("Give it a short subject first.");
    if (message.trim().length < 5)
      return toast.error("Please add a little more detail.");
    if (!user)
      return toast.error("Please sign in again before contacting support.");
    setSending(true);
    try {
      const ticket = await createTicket({
        data: {
          kind: "support",
          subject: subject.trim(),
          message: message.trim(),
          urgency,
        },
        headers: await getServerFnAuthHeaders(),
      });
      await queryClient.invalidateQueries({
        queryKey: ["my-support-tickets", user.id],
      });
      toast.success(
        `Request #${ticket.ticket_number} received — you can track it here.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not contact support.",
      );
      setSending(false);
      return;
    }
    setSending(false);
    setSubject("");
    setMessage("");
    setUrgency("normal");
    setOpen(false);
  };

  const sendReply = async (ticketId: string) => {
    if (reply.trim().length < 2) return toast.error("Add a reply first.");
    setReplyingTo(ticketId);
    try {
      await replyToTicket({
        data: { ticketId, message: reply.trim() },
        headers: await getServerFnAuthHeaders(),
      });
      setReply("");
      await queryClient.invalidateQueries({
        queryKey: ["my-support-tickets", user?.id],
      });
      toast.success("Your reply was added.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add your reply.",
      );
    } finally {
      setReplyingTo(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-card/60 hover:text-foreground transition-colors"
      >
        <LifeBuoy className="h-3.5 w-3.5" /> Contact support
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-primary" /> Contact support
            </DialogTitle>
            <DialogDescription>
              {user?.email
                ? `We'll reply to ${user.email}.`
                : "We'll reply to your account email."}
              <br />
              Prefer email?{" "}
              <a
                href="mailto:help@finkodigital.com"
                className="underline underline-offset-4 hover:text-foreground"
              >
                help@finkodigital.com
              </a>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="e.g. Can't take a deposit on a booking"
                className="mt-1.5 h-10"
                maxLength={200}
              />
            </div>
            <div>
              <Label>What's going on?</Label>
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="The more detail, the faster we can help."
                className="mt-1.5 min-h-32 resize-y"
                maxLength={4000}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {URGENCY.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={urgency === item.value ? "default" : "outline"}
                  onClick={() => setUrgency(item.value)}
                  className={cn(
                    item.value === "urgent" &&
                      urgency === item.value &&
                      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  )}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={submit} disabled={sending}>
                {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{" "}
                Send to support
              </Button>
            </div>
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold">Your recent requests</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Replies and status changes appear here. We may also reply to
                your account email.
              </p>
              <div className="mt-3 space-y-2">
                {tickets.isLoading && (
                  <p className="text-sm text-muted-foreground">
                    Loading requests…
                  </p>
                )}
                {tickets.isError && (
                  <p className="text-sm text-destructive">
                    Requests could not be loaded. Try reopening this window.
                  </p>
                )}
                {tickets.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No requests yet.
                  </p>
                )}
                {tickets.data?.map((ticket: any) => (
                  <details
                    key={ticket.id}
                    className="rounded-xl border bg-muted/20 px-3 py-2"
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            #{ticket.ticket_number} · {ticket.subject}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {new Date(ticket.created_at).toLocaleDateString()} ·{" "}
                            {ticket.kind === "feedback"
                              ? "Feedback"
                              : "Support"}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] capitalize">
                          {ticket.status.replaceAll("_", " ")}
                        </span>
                      </div>
                    </summary>
                    <div className="mt-3 space-y-2 border-t pt-3">
                      {ticket.events.map((event: any) => (
                        <div key={event.id} className="text-xs">
                          <p className="font-medium capitalize">
                            {event.actor_type === "operator"
                              ? "Bookzenvo support"
                              : event.actor_type}{" "}
                            · {new Date(event.created_at).toLocaleString()}
                          </p>
                          {event.body && (
                            <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                              {event.body}
                            </p>
                          )}
                        </div>
                      ))}
                      {ticket.status !== "closed" && (
                        <div className="space-y-2 pt-2">
                          <Textarea
                            value={reply}
                            onChange={(event) => setReply(event.target.value)}
                            placeholder="Add more information or reply to support"
                            className="min-h-20 resize-y"
                            maxLength={4000}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={replyingTo === ticket.id}
                            onClick={() => sendReply(ticket.id)}
                          >
                            {replyingTo === ticket.id && (
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            )}
                            Add reply
                          </Button>
                        </div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
