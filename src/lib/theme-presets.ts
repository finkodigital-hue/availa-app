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
      primary: "#16161A",
      accent: "#1A1A2E",
      background: "#FFFFFF",
      surface: "#F7F7F9",
      text: "#16161A",
      textMuted: "#6B6B76",
    },
    typography: { displayFont: "Inter", bodyFont: "Inter" },
    buttons: { style: "solid", cornerRadius: 8 },
  },
  bold_modern: {
    version: 1,
    preset: "bold_modern",
    colors: {
      primary: "#E94560",
      accent: "#E94560",
      background: "#0F0F14",
      surface: "#1A1A22",
      text: "#F5F5F7",
      textMuted: "#9A9AA5",
    },
    typography: { displayFont: "Space Grotesk", bodyFont: "Inter" },
    buttons: { style: "solid", cornerRadius: 4 },
  },
  soft_elegant: {
    version: 1,
    preset: "soft_elegant",
    colors: {
      primary: "#B8869B",
      accent: "#C9A66B",
      background: "#FBF6F1",
      surface: "#F3E9DF",
      text: "#3A2E2A",
      textMuted: "#8A7A72",
    },
    typography: { displayFont: "Playfair Display", bodyFont: "Lato" },
    buttons: { style: "soft", cornerRadius: 16 },
  },
  fresh_playful: {
    version: 1,
    preset: "fresh_playful",
    colors: {
      primary: "#FF6B6B",
      accent: "#4ECDC4",
      background: "#FFFFFF",
      surface: "#FFF5F3",
      text: "#25232B",
      textMuted: "#77737F",
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
