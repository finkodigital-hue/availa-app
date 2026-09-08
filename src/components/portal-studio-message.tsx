import { Mail } from "lucide-react";

export function PortalStudioMessage() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-primary/10">
        <Mail className="h-5 w-5 text-primary" />
      </div>
      <h1 className="font-display text-2xl">Customer portal unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Manage your booking using the links in your confirmation email.
      </p>
    </div>
  );
}
