export type DatePreset = "this_month" | "last_month" | "this_quarter" | "tax_year" | "custom";

export const PRESET_LABELS: Record<Exclude<DatePreset, "custom">, string> = {
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  tax_year: "Tax year",
};

// "Tax year" has no single universal definition — this uses calendar
// year-to-date (Jan 1 → today), which is the correct tax year for a
// calendar-year filer. Labeled explicitly in the UI so it's never a silent
// assumption.
export function presetRange(preset: Exclude<DatePreset, "custom">): { from: Date; to: Date } {
  const now = new Date();
  if (preset === "this_month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to };
  }
  if (preset === "last_month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from, to };
  }
  if (preset === "this_quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const from = new Date(now.getFullYear(), q * 3, 1);
    const to = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
    return { from, to };
  }
  // tax_year
  const from = new Date(now.getFullYear(), 0, 1);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export type CompareMode = "previous_period" | "same_period_last_year";

export function comparisonRange(from: Date, to: Date, mode: CompareMode): { from: Date; to: Date } {
  if (mode === "same_period_last_year") {
    const f = new Date(from);
    f.setFullYear(f.getFullYear() - 1);
    const t = new Date(to);
    t.setFullYear(t.getFullYear() - 1);
    return { from: f, to: t };
  }
  const lengthMs = to.getTime() - from.getTime();
  return {
    from: new Date(from.getTime() - lengthMs - 1),
    to: new Date(from.getTime() - 1),
  };
}

export function fmtRange(from: Date, to: Date): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromStr = from.toLocaleDateString([], { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
  const toStr = to.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  return `${fromStr} – ${toStr}`;
}
