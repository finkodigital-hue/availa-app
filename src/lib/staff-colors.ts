// Soft pastel palette assigned deterministically per staff id.
// Each entry: name → { bg (soft), border (slightly darker), ink (text on bg), dot (chip dot) }
export const STAFF_PASTELS = [
  { name: "Sky Blue",   bg: "oklch(0.94 0.04 235)", border: "oklch(0.78 0.09 235)", ink: "oklch(0.32 0.09 235)", dot: "oklch(0.7 0.13 235)" },
  { name: "Mint Green", bg: "oklch(0.94 0.05 165)", border: "oklch(0.78 0.1 165)",  ink: "oklch(0.32 0.09 165)", dot: "oklch(0.7 0.14 165)" },
  { name: "Peach",      bg: "oklch(0.94 0.05 45)",  border: "oklch(0.8 0.1 45)",    ink: "oklch(0.4 0.12 45)",   dot: "oklch(0.72 0.14 45)" },
  { name: "Lavender",   bg: "oklch(0.94 0.05 295)", border: "oklch(0.78 0.1 295)",  ink: "oklch(0.36 0.12 295)", dot: "oklch(0.66 0.16 295)" },
  { name: "Soft Pink",  bg: "oklch(0.94 0.045 5)",  border: "oklch(0.8 0.1 5)",     ink: "oklch(0.4 0.13 5)",    dot: "oklch(0.72 0.15 5)" },
  { name: "Pale Yellow",bg: "oklch(0.96 0.06 95)",  border: "oklch(0.82 0.12 95)",  ink: "oklch(0.4 0.1 80)",    dot: "oklch(0.78 0.15 95)" },
  { name: "Light Teal", bg: "oklch(0.94 0.04 195)", border: "oklch(0.78 0.09 195)", ink: "oklch(0.32 0.09 200)", dot: "oklch(0.7 0.13 195)" },
  { name: "Sand",       bg: "oklch(0.94 0.03 75)",  border: "oklch(0.8 0.06 70)",   ink: "oklch(0.38 0.05 60)",  dot: "oklch(0.7 0.08 70)" },
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
