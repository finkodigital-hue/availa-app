import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Lock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  applyThemeVars,
  parseTheme,
  themeFontOverrideCss,
  themedButtonStyle,
  type Theme,
} from "@/lib/theme";

type ReviewDetails = {
  businessName: string;
  serviceName: string;
  staffName: string | null;
  startsAt: string;
  timezone: string;
  theme: Theme;
};

const ERROR_COPY: Record<string, string> = {
  invalid: "This review link is not valid.",
  expired: "This review link has expired.",
  used: "This review link has already been used.",
  already_submitted: "A review has already been submitted for this booking.",
  not_completed: "Reviews become available after the booking is completed.",
};

export const Route = createFileRoute("/review/$token")({
  component: ReviewPage,
});

function ReviewPage() {
  const { token } = Route.useParams();
  const [details, setDetails] = useState<ReviewDetails | null>(null);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [agreedToPublish, setAgreedToPublish] = useState(false);

  useEffect(() => {
    fetch("/api/reviews/peek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(({ response, payload }) =>
        response.ok
          ? setDetails(payload)
          : setError(
              ERROR_COPY[payload.reason] ??
                "We could not open this review link.",
            ),
      )
      .catch(() =>
        setError("We could not open this review link. Please try again."),
      );
  }, [token]);

  const theme = details?.theme ?? parseTheme(null);
  const brand = theme.colors.primary;
  const submit = async () => {
    if (!rating) return setError("Choose a star rating first.");
    if (body.trim().length < 2)
      return setError("Tell us a little about your visit.");
    if (!agreedToPublish)
      return setError(
        "Please agree to the publication details before submitting.",
      );
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, rating, body, agreedToPublish }),
      });
      const payload = await response
        .json()
        .catch(() => ({ reason: "server_error" }));
      if (!response.ok || !payload.ok)
        throw new Error(
          ERROR_COPY[payload.reason] ?? "Your review could not be sent.",
        );
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      id="review-page"
      className="min-h-[100dvh] bg-background px-5 py-10 text-foreground sm:py-16"
      style={applyThemeVars(theme)}
    >
      <style>{themeFontOverrideCss(theme, "#review-page")}</style>
      <div className="mx-auto max-w-xl">
        <div className="mb-8 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Verified customer review
          </p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl">
            {details?.businessName ?? "Share your experience"}
          </h1>
        </div>
        <section className="rounded-[28px] border bg-card p-6 shadow-sm sm:p-9">
          {!details && !error && (
            <div className="grid min-h-48 place-items-center">
              <Loader2
                className="h-6 w-6 animate-spin text-muted-foreground"
                aria-label="Loading review"
              />
            </div>
          )}
          {error && !details && (
            <div className="py-12 text-center">
              <h2 className="font-display text-2xl">Link unavailable</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {error}
              </p>
            </div>
          )}
          {details && submitted && (
            <div className="py-10 text-center">
              <CheckCircle2
                className="mx-auto h-10 w-10"
                style={{ color: brand }}
              />
              <h2 className="mt-5 font-display text-3xl">Thank you</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Your review is now published on {details.businessName}&apos;s
                booking page.
              </p>
            </div>
          )}
          {details && !submitted && (
            <div>
              <div className="border-b pb-6">
                <h2 className="font-display text-2xl">How was your visit?</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {details.serviceName}
                  {details.staffName ? ` with ${details.staffName}` : ""} ·{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: details.timezone,
                  }).format(new Date(details.startsAt))}
                </p>
              </div>
              <div className="pt-6">
                <Label id="rating-label">Your rating</Label>
                <div
                  className="mt-3 flex gap-2"
                  role="radiogroup"
                  aria-labelledby="rating-label"
                  onMouseLeave={() => setHovered(0)}
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={rating === value}
                      aria-label={`${value} star${value === 1 ? "" : "s"}`}
                      onMouseEnter={() => setHovered(value)}
                      onFocus={() => setHovered(value)}
                      onBlur={() => setHovered(0)}
                      onClick={() => setRating(value)}
                      className="rounded-lg p-1.5 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Star
                        className="h-9 w-9"
                        fill={
                          value <= (hovered || rating) ? brand : "transparent"
                        }
                        style={{
                          color:
                            value <= (hovered || rating) ? brand : undefined,
                        }}
                      />
                    </button>
                  ))}
                </div>
                <Label htmlFor="review-body" className="mt-7 block">
                  Your review
                </Label>
                <Textarea
                  id="review-body"
                  value={body}
                  onChange={(event) =>
                    setBody(event.target.value.slice(0, 1000))
                  }
                  rows={6}
                  className="mt-2 resize-none"
                  placeholder="What did you enjoy? What should future customers know?"
                />
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>Be honest, specific and respectful.</span>
                  <span>{body.length}/1000</span>
                </div>
                <div className="mt-6 flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
                  <Checkbox
                    id="publication-consent"
                    checked={agreedToPublish}
                    onCheckedChange={(checked) =>
                      setAgreedToPublish(checked === true)
                    }
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor="publication-consent"
                    className="text-sm font-normal leading-6"
                  >
                    I agree that my rating, review, first name and surname
                    initial will be published on {details.businessName}&apos;s
                    booking page. I can ask the business to remove it. Read the{" "}
                    <a
                      href="/review-policy"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline underline-offset-4"
                    >
                      review policy
                    </a>{" "}
                    and{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline underline-offset-4"
                    >
                      privacy policy
                    </a>
                    .
                  </Label>
                </div>
                {error && (
                  <p role="alert" className="mt-4 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button
                  className="mt-6 h-12 w-full"
                  onClick={submit}
                  disabled={submitting || !agreedToPublish}
                  style={themedButtonStyle(theme, "primary")}
                >
                  {submitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Submit review
                </Button>
                <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Only verified completed bookings can leave a review.
                </p>
              </div>
            </div>
          )}
        </section>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Powered by Bookzenvo
        </p>
      </div>
    </main>
  );
}
