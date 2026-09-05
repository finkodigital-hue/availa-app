import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, EyeOff, Loader2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ReviewManager({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
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
          "id, rating, body, reviewer_name, submitted_at, status, source, verified, bookings(services(name))",
        )
        .eq("business_id", businessId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const setVisible = async (id: string, visible: boolean) => {
    const { error } = await (supabase as any).rpc(
      "set_customer_review_visibility",
      { p_review_id: id, p_visible: visible },
    );
    if (error) return toast.error("Review visibility could not be changed.");
    toast.success(visible ? "Review published" : "Review hidden");
    qc.invalidateQueries({ queryKey: ["customer-reviews", businessId] });
  };

  if (isLoading)
    return (
      <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading reviews
      </div>
    );
  if (isError)
    return (
      <p className="py-5 text-sm text-destructive">
        Reviews could not be loaded.
      </p>
    );

  const average = reviews.length
    ? reviews.reduce((sum: number, review: any) => sum + review.rating, 0) /
      reviews.length
    : 0;
  return (
    <div className="mt-5 border-t pt-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Verified reviews</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Customers receive a private link after a completed booking. You can
            hide inappropriate content, but reviews cannot be edited.
          </p>
        </div>
        {reviews.length > 0 && (
          <div className="shrink-0 text-right">
            <div className="font-display text-2xl">{average.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">
              {reviews.length} total
            </div>
          </div>
        )}
      </div>
      {reviews.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <Star className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No customer reviews yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            They will appear here after customers use their review link.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-xl border">
          {reviews.map((review: any) => (
            <article key={review.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {review.reviewer_name}
                    </span>
                    {review.verified && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setVisible(review.id, review.status !== "published")
                  }
                  className="shrink-0"
                >
                  {review.status === "published" ? (
                    <>
                      <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                      Hide
                    </>
                  ) : (
                    <>
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                      Publish
                    </>
                  )}
                </Button>
              </div>
              <p className="mt-3 text-sm leading-6 text-foreground/80">
                {review.body}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {review.bookings?.services?.name ?? "Appointment"} ·{" "}
                {new Date(review.submitted_at).toLocaleDateString("en-GB")}
                {review.status === "hidden" ? " · Hidden from your page" : ""}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
