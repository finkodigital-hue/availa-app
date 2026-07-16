import { statusMeta } from "@/lib/format";

// Single source of "what color is this booking" for Day, Week, and Month —
// status drives the block color everywhere (see lib/format.ts for the
// palette); a manually-colored custom/blocked entry (NewBookingDialog's
// "custom" mode) is the one deliberate exception, since its color is a
// user choice rather than a lifecycle state.
export type BookingColors = {
  bg: string;
  border: string;
  ink: string;
  dashed: boolean;
  isCustom: boolean;
};

export function bookingColors(b: any): BookingColors {
  if (b?.is_custom) {
    const accent = b.custom_color || "oklch(0.55 0.15 300)";
    return {
      bg: `color-mix(in oklab, ${accent} 16%, var(--color-card))`,
      border: accent,
      ink: accent,
      dashed: true,
      isCustom: true,
    };
  }
  const status = statusMeta(b?.status);
  return { bg: status.tint, border: status.color, ink: status.color, dashed: false, isCustom: false };
}
