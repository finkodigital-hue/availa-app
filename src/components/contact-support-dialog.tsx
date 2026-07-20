import { useState } from "react";
import { LifeBuoy, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const { data: business } = useMyBusiness();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [urgency, setUrgency] = useState<(typeof URGENCY)[number]["value"]>("normal");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (subject.trim().length < 3) return toast.error("Give it a short subject first.");
    if (message.trim().length < 5) return toast.error("Please add a little more detail.");
    if (!user) return toast.error("Please sign in again before contacting support.");
    setSending(true);
    const { error } = await (supabase as any).from("support_requests").insert({
      business_id: business?.id ?? null,
      user_id: user.id,
      subject: subject.trim(),
      message: message.trim(),
      urgency,
      contact_email: user.email ?? null,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Sent — we'll reply to your account email.");
    setSubject("");
    setMessage("");
    setUrgency("normal");
    setOpen(false);
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-primary" /> Contact support
            </DialogTitle>
            <DialogDescription>
              {user?.email ? `We'll reply to ${user.email}.` : "We'll reply to your account email."}
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
                  className={cn(item.value === "urgent" && urgency === item.value && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={submit} disabled={sending}>
                {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Send to support
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
