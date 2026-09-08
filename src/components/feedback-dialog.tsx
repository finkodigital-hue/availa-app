import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, Loader2, MessageSquarePlus } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { createSupportTicket } from "@/lib/support.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "idea", label: "Idea" },
  { value: "issue", label: "Something isn't right" },
  { value: "other", label: "Other" },
] as const;

export function FeedbackDialog() {
  const { user } = useAuth();
  const createTicket = useServerFn(createSupportTicket);
  const [open, setOpen] = useState(false);
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]["value"]>("idea");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (message.trim().length < 5)
      return toast.error("Please add a little more detail.");
    if (!user)
      return toast.error("Please sign in again before sending feedback.");
    setSending(true);
    try {
      const ticket = await createTicket({
        data: {
          kind: "feedback",
          category,
          subject:
            category === "idea"
              ? "Product idea"
              : category === "issue"
                ? "Product issue"
                : "General feedback",
          message: message.trim(),
          urgency: "normal",
        },
        headers: await getServerFnAuthHeaders(),
      });
      toast.success(
        `Thanks — feedback #${ticket.ticket_number} has been received.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send feedback.",
      );
      setSending(false);
      return;
    }
    setSending(false);
    setMessage("");
    setCategory("idea");
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-card/60 hover:text-foreground transition-colors"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" /> Share feedback
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" /> Share feedback
            </DialogTitle>
            <DialogDescription>
              Tell us what would make Bookzenvo better for your business.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={category === item.value ? "default" : "outline"}
                  onClick={() => setCategory(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="What would you like us to know?"
              className="min-h-32 resize-y"
              maxLength={2000}
            />
            <div className="flex justify-end">
              <Button onClick={submit} disabled={sending}>
                {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{" "}
                Send feedback
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
