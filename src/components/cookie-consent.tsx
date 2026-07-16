import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  CONSENT_STORAGE_KEY,
  acceptAllChoice,
  rejectNonEssentialChoice,
  readConsent,
  type ConsentChoice,
} from "@/lib/cookie-consent";

interface CookieConsentCtx {
  consent: ConsentChoice | null;
  ready: boolean;
  preferencesOpen: boolean;
  acceptAll: () => void;
  rejectNonEssential: () => void;
  openPreferences: () => void;
  closePreferences: () => void;
}

const Ctx = createContext<CookieConsentCtx | null>(null);

// Wrap a public-facing page (marketing site, /book/$slug) in this once, then
// drop <CookieConsentBanner/> and, in the footer, <CookieSettingsFooterLink/>
// anywhere inside it. Deliberately not mounted in the authenticated
// dashboard or in the page-builder's embedded booking-page preview — both
// render PublicBookingPage without this provider, so neither ever shows the
// banner or the footer link.
export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentChoice | null>(null);
  const [ready, setReady] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // Read on mount only — localStorage isn't available during SSR, and
  // starting from `ready: false` keeps the client's first render matching
  // the server's (nothing shown) so there's no hydration flash/mismatch.
  useEffect(() => {
    setConsent(readConsent());
    setReady(true);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CONSENT_STORAGE_KEY) setConsent(readConsent());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const acceptAll = () => {
    setConsent(acceptAllChoice());
    setPreferencesOpen(false);
  };
  const rejectNonEssential = () => {
    setConsent(rejectNonEssentialChoice());
    setPreferencesOpen(false);
  };

  return (
    <Ctx.Provider
      value={{
        consent,
        ready,
        preferencesOpen,
        acceptAll,
        rejectNonEssential,
        openPreferences: () => setPreferencesOpen(true),
        closePreferences: () => setPreferencesOpen(false),
      }}
    >
      {children}
      <CookiePreferencesDialog />
    </Ctx.Provider>
  );
}

function useCookieConsentCtx() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCookieConsent must be used within a CookieConsentProvider");
  return ctx;
}

export function useCookieConsent() {
  return useCookieConsentCtx();
}

export function CookieSettingsFooterLink({ className }: { className?: string }) {
  const { openPreferences } = useCookieConsentCtx();
  return (
    <button
      type="button"
      onClick={openPreferences}
      className={cn("hover:text-foreground underline-offset-4 hover:underline transition-colors cursor-pointer", className)}
    >
      Cookie settings
    </button>
  );
}

export function CookieConsentBanner() {
  const { consent, ready, acceptAll, rejectNonEssential, openPreferences } = useCookieConsentCtx();
  if (!ready || consent) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4 animate-rise"
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
    >
      <div className="mx-auto max-w-2xl rounded-2xl border bg-card shadow-elegant p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 h-8 w-8 rounded-full bg-secondary grid place-items-center">
            <ShieldCheck className="h-4 w-4 text-[color:var(--gold-deep)]" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--gold-deep)] font-semibold">
              Your privacy
            </div>
            <p className="text-sm text-foreground/90 mt-1 text-pretty">
              We only use strictly necessary cookies and local storage — to keep you signed in and remember this
              choice. Nothing for analytics or advertising.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <Button variant="outline" className="flex-1 sm:flex-none sm:min-w-[180px] h-11" onClick={rejectNonEssential}>
            Reject non-essential
          </Button>
          <Button className="flex-1 sm:flex-none sm:min-w-[140px] h-11" onClick={acceptAll}>
            Accept all
          </Button>
          <Button variant="ghost" className="sm:ml-auto h-11" onClick={openPreferences}>
            Manage preferences
          </Button>
        </div>
      </div>
    </div>
  );
}

function CookiePreferencesDialog() {
  const { preferencesOpen, closePreferences, acceptAll, rejectNonEssential } = useCookieConsentCtx();

  return (
    <Dialog open={preferencesOpen} onOpenChange={(open) => { if (!open) closePreferences(); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Cookie preferences</DialogTitle>
          <DialogDescription>
            Bookzenvo currently uses only strictly necessary cookies and local storage — the minimum needed to run
            your booking and keep you signed in. We don't use analytics or advertising cookies today.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border p-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Strictly necessary</div>
            <p className="text-xs text-muted-foreground mt-1">
              Keeps you signed in, prevents double-booking a slot, and remembers this choice. The site can't work
              without these.
            </p>
          </div>
          <Switch checked disabled aria-label="Strictly necessary cookies (always on)" />
        </div>
        <p className="text-xs text-muted-foreground">
          We don't use analytics or marketing cookies today. If that ever changes, we'll update this panel and ask
          again.
        </p>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="flex-1 h-11" onClick={rejectNonEssential}>
            Reject non-essential
          </Button>
          <Button className="flex-1 h-11" onClick={acceptAll}>
            Accept all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
