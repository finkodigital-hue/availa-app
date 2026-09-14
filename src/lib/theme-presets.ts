import type { PresetId, Theme } from "@/lib/theme";
import type { BusinessType } from "@/lib/business-type";

// The 4 starter "vibes" offered in the wizard's Step 2 and the Design
// panel's preset switcher. Each is a complete Theme (minus logoUrl/updatedAt,
// which are business-specific and merged in by the caller).
export const THEME_PRESETS: Record<PresetId, Omit<Theme, "logoUrl" | "updatedAt">> = {
  clean_minimal: {
    version: 1,
    preset: "clean_minimal",
    colors: {
      primary: "#80633A",
      accent: "#947044",
      background: "#FCFAF6",
      surface: "#F3EBDD",
      text: "#29241E",
      textMuted: "#716557",
    },
    typography: { displayFont: "Inter", bodyFont: "Inter" },
    buttons: { style: "solid", cornerRadius: 8 },
  },
  bold_modern: {
    version: 1,
    preset: "bold_modern",
    colors: {
      primary: "#D5B586",
      accent: "#D5B586",
      background: "#191A1C",
      surface: "#252629",
      text: "#FAF6F0",
      textMuted: "#B9B1A6",
    },
    typography: { displayFont: "Space Grotesk", bodyFont: "Inter" },
    buttons: { style: "solid", cornerRadius: 4 },
  },
  soft_elegant: {
    version: 1,
    preset: "soft_elegant",
    colors: {
      primary: "#914C60",
      accent: "#987344",
      background: "#FFF9F8",
      surface: "#F6E8E7",
      text: "#39292D",
      textMuted: "#796168",
    },
    typography: { displayFont: "Playfair Display", bodyFont: "Lato" },
    buttons: { style: "soft", cornerRadius: 16 },
  },
  fresh_playful: {
    version: 1,
    preset: "fresh_playful",
    colors: {
      primary: "#4C6856",
      accent: "#96734E",
      background: "#FAFBF7",
      surface: "#EAF0E5",
      text: "#26372D",
      textMuted: "#62705F",
    },
    typography: { displayFont: "Poppins", bodyFont: "Poppins" },
    buttons: { style: "soft", cornerRadius: 24 },
  },
};

export const PRESET_LABELS: Record<PresetId, string> = {
  clean_minimal: "Clean & minimal",
  bold_modern: "Bold & modern",
  soft_elegant: "Soft & elegant",
  fresh_playful: "Fresh & playful",
};

export function themeFromPreset(preset: PresetId, existing?: Pick<Theme, "logoUrl">): Theme {
  return {
    ...THEME_PRESETS[preset],
    logoUrl: existing?.logoUrl ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export function defaultPresetForBusinessType(type: BusinessType | null | undefined): PresetId {
  switch (type) {
    case "barber":
      return "bold_modern";
    case "spa":
      return "soft_elegant";
    case "nails":
    case "beauty":
      return "fresh_playful";
    case "salon":
    case "other":
    default:
      return "clean_minimal";
  }
}
