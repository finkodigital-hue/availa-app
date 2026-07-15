// Bright, saturated palette assigned deterministically per staff id.
// Each hue reads as a distinct, cheerful colour at a glance (Fresha-style
// calendar blocks) while staying premium: washes stay light enough for
// dark text on top, and hue spacing skips the yellow/lime band, which
// looks sickly at this lightness against dark ink.
// Each entry: name → { bg (wash), border (accent), ink (text on bg), dot (chip dot) }
export const STAFF_PASTELS = [
  { name: "Coral",  bg: "oklch(0.93 0.05 22)",   border: "oklch(0.64 0.19 22)",  ink: "oklch(0.36 0.13 22)",  dot: "oklch(0.65 0.20 22)" },
  { name: "Amber",  bg: "oklch(0.93 0.06 55)",   border: "oklch(0.70 0.15 58)",  ink: "oklch(0.38 0.10 55)",  dot: "oklch(0.73 0.16 58)" },
  { name: "Green",  bg: "oklch(0.93 0.05 145)",  border: "oklch(0.62 0.15 145)", ink: "oklch(0.35 0.09 145)", dot: "oklch(0.63 0.16 145)" },
  { name: "Teal",   bg: "oklch(0.92 0.045 190)", border: "oklch(0.58 0.11 195)", ink: "oklch(0.34 0.07 195)", dot: "oklch(0.60 0.12 195)" },
  { name: "Sky",    bg: "oklch(0.93 0.05 225)",  border: "oklch(0.62 0.14 228)", ink: "oklch(0.37 0.10 228)", dot: "oklch(0.63 0.15 228)" },
  { name: "Indigo", bg: "oklch(0.92 0.05 265)",  border: "oklch(0.58 0.16 268)", ink: "oklch(0.38 0.12 268)", dot: "oklch(0.60 0.17 268)" },
  { name: "Violet", bg: "oklch(0.92 0.055 300)", border: "oklch(0.60 0.17 300)", ink: "oklch(0.40 0.13 300)", dot: "oklch(0.62 0.18 300)" },
  { name: "Pink",   bg: "oklch(0.93 0.055 340)", border: "oklch(0.65 0.17 338)", ink: "oklch(0.42 0.13 338)", dot: "oklch(0.68 0.18 338)" },
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
