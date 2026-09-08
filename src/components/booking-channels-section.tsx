import { useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe2,
  Instagram,
  Link2,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  bookingButtonHtml,
  bookingPageUrl,
  channelBookingUrl,
} from "@/lib/booking-channels";

type Props = {
  businessName: string;
  slug: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

async function copyText(value: string, message: string) {
  await navigator.clipboard.writeText(value);
  toast.success(message);
}

function CopyButton({
  value,
  label = "Copy link",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await copyText(value, `${label} copied`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn’t copy automatically. Select and copy it manually.");
    }
  };
  return (
    <Button type="button" size="sm" variant="outline" onClick={copy}>
      {copied ? (
        <Check className="mr-1.5 h-3.5 w-3.5" />
      ) : (
        <Copy className="mr-1.5 h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

function ChannelCard({
  icon,
  title,
  description,
  steps,
  url,
  openUrl,
  note,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  steps: string[];
  url: string;
  openUrl: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex min-w-0 gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{title}</p>
            <Badge variant="secondary" className="text-[10px]">
              Ready to add
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <ol className="mt-3 space-y-1.5 pl-5 text-xs leading-5 text-muted-foreground">
        {steps.map((step) => (
          <li key={step} className="list-decimal pl-1">
            {step}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <CopyButton value={url} />
        <Button type="button" size="sm" variant="ghost" asChild>
          <a href={openUrl} target="_blank" rel="noopener noreferrer">
            Open {title} <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
      <p className="mt-3 border-t pt-3 text-[11px] leading-4 text-muted-foreground">
        {note}
      </p>
    </div>
  );
}

export function BookingChannelsSection({
  businessName,
  slug,
  open,
  onOpenChange,
}: Props) {
  const links = useMemo(() => {
    if (!slug || typeof window === "undefined") return null;
    const isLocalPreview = ["localhost", "127.0.0.1"].includes(
      window.location.hostname,
    );
    // A salon testing the dashboard locally must not accidentally paste a
    // localhost link into its public profiles. Deployed preview environments
    // keep their own origin; local development points sharing at production.
    const shareOrigin = isLocalPreview
      ? "https://bookzenvo.com"
      : window.location.origin;
    return {
      direct: bookingPageUrl(shareOrigin, slug),
      preview: bookingPageUrl(window.location.origin, slug),
      google: channelBookingUrl(shareOrigin, slug, "google"),
      instagram: channelBookingUrl(shareOrigin, slug, "instagram"),
    };
  }, [slug]);

  const share = async () => {
    if (!links) return;
    if (!navigator.share) {
      try {
        await copyText(links.direct, "Booking link copied");
      } catch {
        toast.error("Couldn’t copy the booking link.");
      }
      return;
    }
    try {
      await navigator.share({
        title: `Book with ${businessName}`,
        text: `Choose a service and book with ${businessName}.`,
        url: links.direct,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Couldn’t open sharing. Copy the link instead.");
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-secondary/25"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <Share2 className="h-4 w-4" /> Booking channels
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          {!links ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Finish setting up your page address before sharing it.
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-secondary/35 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-background">
                    <Link2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Your booking link</p>
                    <p className="mt-1 break-all text-xs leading-5 text-muted-foreground">
                      {links.direct}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyButton value={links.direct} />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={share}
                  >
                    <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
                  </Button>
                  <Button type="button" size="sm" variant="ghost" asChild>
                    <a
                      href={links.preview}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Preview <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </div>

              <ChannelCard
                icon={<Globe2 className="h-4 w-4" />}
                title="Google Business Profile"
                description="Let people who find you on Google go straight to your booking page."
                steps={[
                  "Copy the Google booking link below.",
                  "Open your Business Profile, choose Edit profile, then add it under Booking links.",
                  "Save and check the link from your public Google listing.",
                ]}
                url={links.google}
                openUrl="https://business.google.com/"
                note="This adds a normal booking link to your profile. It is not Reserve with Google, which requires a separately approved scheduling partnership."
              />

              <ChannelCard
                icon={<Instagram className="h-4 w-4" />}
                title="Instagram"
                description="Turn profile visitors into bookings without asking them to message you."
                steps={[
                  "Copy the Instagram booking link below.",
                  "In Instagram, open Edit profile, then Links, and add an external link.",
                  "Name it Book now and test it from your public profile.",
                ]}
                url={links.instagram}
                openUrl="https://www.instagram.com/"
                note="This creates a reliable profile link. Instagram’s native action button is only available through supported partners and is not currently connected to Bookzenvo."
              />

              <div className="rounded-xl border bg-background p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary">
                    <Globe2 className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      Your existing website
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Add a Book now button to any website without sharing
                      account access.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyButton
                    value={bookingButtonHtml(links.direct, businessName)}
                    label="Copy button code"
                  />
                  <CopyButton value={links.direct} />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
