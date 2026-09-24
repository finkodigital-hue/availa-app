export type PreparationForm = {
  status: string;
  expires_at: string | null;
  withdrawn_at: string | null;
};

export function preparationFormSummary(
  forms: PreparationForm[] | null,
  now: number,
) {
  if (forms === null) return "Form checks unavailable";
  if (!forms.length) return "No forms linked to this appointment";
  const current = forms.filter(
    (form) =>
      form.status === "signed" &&
      !form.withdrawn_at &&
      (!form.expires_at || new Date(form.expires_at).getTime() > now),
  ).length;
  const needsReview = forms.length - current;
  return `${current} current signed ${current === 1 ? "form" : "forms"}${needsReview ? ` · ${needsReview} to review` : ""}`;
}

export function preparationBalance(
  price: number,
  paid: number,
  status: string,
) {
  if (["paid", "refunded", "partially_refunded"].includes(status)) return 0;
  return Math.max(0, price - paid);
}
