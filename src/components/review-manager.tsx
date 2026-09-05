import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, Loader2, ShieldAlert, Star } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const MODERATION_REASONS = {
  customer_request: "Customer asked for removal",
  personal_information: "Contains personal information",
  abusive_or_illegal: "Abusive or potentially unlawful content",
  irrelevant: "Not about this appointment",
  suspected_fraud: "Suspected manipulation or fraud",
} as const;

type ModerationReason = keyof typeof MODERATION_REASONS;

export function ReviewManager({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [reason, setReason] = useState<ModerationReason | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: reviewSettings } = useQuery({
    queryKey: ["review-request-settings", businessId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("businesses")
        .select("review_requests_enabled")
        .eq("id", businessId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const {
    data: reviews = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["customer-reviews", businessId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customer_reviews")
        .select(
          "id, rating, body, reviewer_name, submitted_at, status, source, verified, moderation_reason, moderation_note, bookings(services(name))",
        )
        .eq("business_id", businessId)
        .not("publication_consent_at", "is", null)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const setReviewRequestsEnabled = async (enabled: boolean) => {
    const previous = reviewSettings?.review_requests_enabled;
    qc.setQueryData(["review-request-settings", businessId], {
      review_requests_enabled: enabled,
    });
    const { error } = await (supabase as any)
      .from("businesses")
      .update({ review_requests_enabled: enabled })
      .eq("id", businessId);
    if (error) {
      qc.setQueryData(["review-request-settings", businessId], {
        review_requests_enabled: previous,
      });
      return toast.error("Review request setting could not be saved.");
    }
    toast.success(
      enabled ? "Review requests enabled" : "Review requests paused",
    );
  };

  const moderateReview = async (
    reviewId: string,
    action: "remove" | "restore",
  ) => {
    if (action === "remove" && (!reason || note.trim().length < 10)) {
      return toast.error("Choose a reason and add a short explanation.");
    }
    setSaving(true);
    const { error } = await (supabase as any).rpc("moderate_customer_review", {
      p_review_id: reviewId,
      p_action: action,
      p_reason: action === "remove" ? reason : null,
      p_note: action === "remove" ? note.trim() : null,
    });
    setSaving(false);
    if (error) return toast.error("The review could not be updated.");
    toast.success(
      action === "remove" ? "Review removed from page" : "Review restored",
    );
    setSelectedReview(null);
    setReason("");
    setNote("");
    qc.invalidateQueries({ queryKey: ["customer-reviews", businessId] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading reviews
      </div>
    );
  }
  if (isError) {
    return (
      <p className="py-5 text-sm text-destructive">
        Reviews could not be loaded.
      </p>
    );
  }

  const publishedReviews = reviews.filter(
    (review: any) => review.status === "published",
  );
  const average = publishedReviews.length
    ? publishedReviews.reduce(
        (sum: number, review: any) => sum + review.rating,
        0,
      ) / publishedReviews.length
    : 0;

  return (
    <div className="mt-5 border-t pt-5">
      <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border bg-muted/25 p-4">
        <div>
          <Label htmlFor="review-requests" className="text-sm font-semibold">
            Send review requests automatically
          </Label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Email customers once after a completed appointment. The message asks
            for honest feedback and does not offer an incentive.
          </p>
        </div>
        <Switch
          id="review-requests"
          checked={reviewSettings?.review_requests_enabled ?? true}
          onCheckedChange={setReviewRequestsEnabled}
          aria-label="Send review requests automatically"
        />
      </div>

      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Verified reviews</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Genuine positive and negative reviews stay published. Remove a
            review only when it breaks the review policy. Every action is
            recorded.
          </p>
        </div>
        {publishedReviews.length > 0 && (
          <div className="shrink-0 text-right">
            <div className="font-display text-2xl">{average.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">
              {publishedReviews.length} published
            </div>
          </div>
        )}
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <Star className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No customer reviews yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            They will appear here after customers use their private review link.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-xl border">
          {reviews.map((review: any) => (
            <article key={review.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      {review.reviewer_name}
                    </span>
                    {review.verified && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified booking
                      </span>
                    )}
                    {review.status === "hidden" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                        Removed from page
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-1 flex"
                    aria-label={`${review.rating} out of 5 stars`}
                  >
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className="h-3.5 w-3.5"
                        fill={star <= review.rating ? "currentColor" : "none"}
                      />
                    ))}
                  </div>
                </div>
                {review.status === "published" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedReview(review)}
                    className="shrink-0"
                  >
                    <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
                    Review content
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => moderateReview(review.id, "restore")}
                    className="shrink-0"
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Restore
                  </Button>
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-foreground/80">
                {review.body}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {review.bookings?.services?.name ?? "Appointment"} ·{" "}
                {new Date(review.submitted_at).toLocaleDateString("en-GB")}
              </p>
              {review.status === "hidden" && review.moderation_reason && (
                <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    Reason:{" "}
                    {
                      MODERATION_REASONS[
                        review.moderation_reason as ModerationReason
                      ]
                    }
                  </span>
                  {review.moderation_note ? ` · ${review.moderation_note}` : ""}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(selectedReview)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedReview(null);
            setReason("");
            setNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review this content</DialogTitle>
            <DialogDescription className="leading-6">
              A review cannot be removed just because it is negative. Only
              remove content that matches one of the policy reasons below. Your
              action and explanation will be recorded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="moderation-reason">Reason for removal</Label>
              <Select
                value={reason}
                onValueChange={(value) => setReason(value as ModerationReason)}
              >
                <SelectTrigger id="moderation-reason">
                  <SelectValue placeholder="Choose a policy reason" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MODERATION_REASONS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="moderation-note">What is wrong with it?</Label>
              <Textarea
                id="moderation-note"
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, 500))}
                rows={4}
                placeholder="Briefly explain which part breaks the policy."
              />
              <p className="text-xs text-muted-foreground">
                At least 10 characters. {note.length}/500
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedReview(null)}
            >
              Keep published
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={saving || !reason || note.trim().length < 10}
              onClick={() => moderateReview(selectedReview.id, "remove")}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove from page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
