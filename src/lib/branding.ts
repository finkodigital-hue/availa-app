// Maps a business' branding fields → inline CSS variables that override the
// default editorial palette on the public booking page and customer portal.
// Apply with: <div style={brandingVars(biz)}> ... </div>

export type BrandingSource = {
  brand_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  font?: string | null;
  button_style?: string | null;
  border_radius?: number | null;
  theme?: string | null;
};

const FONT_STACKS: Record<string, string> = {
  fraunces: '"Fraunces", ui-serif, Georgia, serif',
  inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
  playfair: '"Playfair Display", ui-serif, Georgia, serif',
  dm: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
  manrope: '"Manrope", ui-sans-serif, system-ui, sans-serif',
  space: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
};

export const FONT_CHOICES = [
  { id: "fraunces", label: "Fraunces (editorial serif)" },
  { id: "playfair", label: "Playfair Display (luxe serif)" },
  { id: "inter", label: "Inter (modern sans)" },
  { id: "dm", label: "DM Sans (friendly sans)" },
  { id: "manrope", label: "Manrope (geometric)" },
  { id: "space", label: "Space Grotesk (technical)" },
];

export const BUTTON_STYLES = [
  { id: "rounded", label: "Rounded", radius: "0.75rem" },
  { id: "pill", label: "Pill", radius: "9999px" },
  { id: "square", label: "Square", radius: "0.125rem" },
];

export function brandingVars(b: BrandingSource | null | undefined): React.CSSProperties {
  const brand = b?.brand_color ?? "#8E2A38";
  const secondary = b?.secondary_color ?? brand;
  const accent = b?.accent_color ?? brand;
  const font = FONT_STACKS[b?.font ?? "fraunces"] ?? FONT_STACKS.fraunces;
  const bs = BUTTON_STYLES.find((s) => s.id === (b?.button_style ?? "rounded"));
  const radius = `${(b?.border_radius ?? 12)}px`;
  return {
    ["--brand" as any]: brand,
    ["--brand-secondary" as any]: secondary,
    ["--brand-accent" as any]: accent,
    ["--brand-font" as any]: font,
    ["--brand-btn-radius" as any]: bs?.radius ?? "0.75rem",
    ["--brand-radius" as any]: radius,
  } as React.CSSProperties;
}

export function shouldUseDark(b: BrandingSource | null | undefined): boolean {
  const t = b?.theme ?? "light";
  if (t === "dark") return true;
  if (t === "light") return false;
  if (typeof window !== "undefined") return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  return false;
}
