// Refined, low-chroma palette assigned deterministically per staff id.
// Kept in the same tonal family as the brand's warm terracotta primary —
// restrained saturation across all hues so the calendar reads as one
// coherent system rather than a rainbow of pastels.
// Each entry: name → { bg (wash), border (accent), ink (text on bg), dot (chip dot) }
export const STAFF_PASTELS = [
  { name: "Terracotta", bg: "oklch(0.965 0.022 35)",  border: "oklch(0.74 0.08 35)",   ink: "oklch(0.36 0.07 32)",  dot: "oklch(0.63 0.13 34)" },
  { name: "Amber",      bg: "oklch(0.965 0.028 85)",  border: "oklch(0.77 0.09 82)",   ink: "oklch(0.4 0.06 70)",   dot: "oklch(0.7 0.13 80)" },
  { name: "Sage",       bg: "oklch(0.96 0.022 150)",  border: "oklch(0.74 0.07 150)",  ink: "oklch(0.36 0.05 150)", dot: "oklch(0.63 0.1 150)" },
  { name: "Slate Teal", bg: "oklch(0.96 0.018 205)",  border: "oklch(0.74 0.055 205)", ink: "oklch(0.36 0.04 205)", dot: "oklch(0.62 0.08 205)" },
  { name: "Dusty Blue", bg: "oklch(0.96 0.02 258)",   border: "oklch(0.74 0.065 258)", ink: "oklch(0.38 0.055 258)",dot: "oklch(0.64 0.1 258)" },
  { name: "Mauve",      bg: "oklch(0.955 0.024 312)", border: "oklch(0.72 0.07 312)",  ink: "oklch(0.4 0.065 312)", dot: "oklch(0.62 0.11 312)" },
  { name: "Dusty Rose", bg: "oklch(0.96 0.026 8)",    border: "oklch(0.76 0.075 8)",   ink: "oklch(0.42 0.07 8)",   dot: "oklch(0.68 0.12 8)" },
  { name: "Warm Taupe", bg: "oklch(0.955 0.012 70)",  border: "oklch(0.74 0.03 70)",   ink: "oklch(0.38 0.02 60)",  dot: "oklch(0.62 0.045 65)" },
] as const;

export type StaffPalette = (typeof STAFF_PASTELS)[number];

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function paletteFor(staffId: string | null | undefined, override?: string | null): StaffPalette {
  if (override) {
    const found = STAFF_PASTELS.find((p) => p.name.toLowerCase() === override.toLowerCase());
    if (found) return found;
  }
  if (!staffId) return STAFF_PASTELS[0];
  return STAFF_PASTELS[hash(staffId) % STAFF_PASTELS.length];
}

export function initialsOf(name?: string | null) {
  if (!name) return "•";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
