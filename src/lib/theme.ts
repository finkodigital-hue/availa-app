// The booking page's unified theme object — the single source of styling
// truth for the public booking page (see businesses.page_theme). Successor
// to the old flat brand_color/font/button_style/... columns and the unused
// brandingVars() helper that used to live here.
// Apply with: <div style={applyThemeVars(theme)}> ... </div>

export type ButtonStyle = "solid" | "outline" | "soft";
export type PresetId = "clean_minimal" | "bold_modern" | "soft_elegant" | "fresh_playful";

export interface Theme {
  version: 1;
  preset: PresetId;
  colors: {
    primary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
  };
  typography: {
    displayFont: string;
    bodyFont: string;
  };
  buttons: {
    style: ButtonStyle;
    cornerRadius: number;
  };
  logoUrl: string | null;
  updatedAt: string;
}

// Curated Google Fonts offered in the display-font picker. `stack` is the
// full font-family fallback chain; `googleParam` is the family spec used to
// build the Google Fonts CSS2 URL (weights cover body + display use).
export const FONT_CHOICES: { id: string; label: string; stack: string; googleParam: string }[] = [
  { id: "Inter", label: "Inter (modern sans)", stack: '"Inter", ui-sans-serif, system-ui, sans-serif', googleParam: "Inter:wght@400;500;600;700" },
  { id: "Playfair Display", label: "Playfair Display (luxe serif)", stack: '"Playfair Display", ui-serif, Georgia, serif', googleParam: "Playfair+Display:wght@400;500;600;700" },
  { id: "Space Grotesk", label: "Space Grotesk (technical)", stack: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif', googleParam: "Space+Grotesk:wght@400;500;600;700" },
  { id: "Lato", label: "Lato (friendly)", stack: '"Lato", ui-sans-serif, system-ui, sans-serif', googleParam: "Lato:wght@400;700" },
  { id: "Poppins", label: "Poppins (geometric)", stack: '"Poppins", ui-sans-serif, system-ui, sans-serif', googleParam: "Poppins:wght@400;500;600;700" },
  { id: "Fraunces", label: "Fraunces (editorial serif)", stack: '"Fraunces", ui-serif, Georgia, serif', googleParam: "Fraunces:wght@400;500;600;700" },
  { id: "DM Sans", label: "DM Sans (clean sans)", stack: '"DM Sans", ui-sans-serif, system-ui, sans-serif', googleParam: "DM+Sans:wght@400;500;600;700" },
  { id: "Manrope", label: "Manrope (geometric)", stack: '"Manrope", ui-sans-serif, system-ui, sans-serif', googleParam: "Manrope:wght@400;500;600;700" },
  { id: "Cormorant Garamond", label: "Cormorant Garamond (elegant serif)", stack: '"Cormorant Garamond", ui-serif, Georgia, serif', googleParam: "Cormorant+Garamond:wght@400;500;600;700" },
  { id: "Work Sans", label: "Work Sans (neutral sans)", stack: '"Work Sans", ui-sans-serif, system-ui, sans-serif', googleParam: "Work+Sans:wght@400;500;600;700" },
];

function fontStack(name: string): string {
  return FONT_CHOICES.find((f) => f.id === name)?.stack ?? `"${name}", ui-sans-serif, system-ui, sans-serif`;
}

// Tailwind v4's `@theme inline` bakes --font-display/--font-sans into the
// generated `.font-display`/`html` rules as literal values at build time,
// not `var()` references — so overriding those custom properties on an
// ancestor (via applyThemeVars) has no effect on elements using those
// utility classes. A scoped, higher-specificity stylesheet is the only way
// to actually override the fonts Tailwind already inlined.
export function themeFontOverrideCss(theme: Pick<Theme, "typography">, scopeSelector: string): string {
  const display = fontStack(theme.typography.displayFont);
  const body = fontStack(theme.typography.bodyFont);
  return `${scopeSelector} { font-family: ${body}; }
${scopeSelector} h1, ${scopeSelector} h2, ${scopeSelector} h3, ${scopeSelector} .font-display { font-family: ${display} !important; }`;
}

// Builds a single Google Fonts CSS2 stylesheet URL for the fonts a theme
// actually uses, for use in a route's `head()` `links`.
export function googleFontsHref(theme: Pick<Theme, "typography">): string {
  const families = Array.from(new Set([theme.typography.displayFont, theme.typography.bodyFont]))
    .map((name) => FONT_CHOICES.find((f) => f.id === name)?.googleParam ?? `${name.replace(/ /g, "+")}:wght@400;500;600;700`);
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
}

export const BUTTON_RADIUS_MIN = 0;
export const BUTTON_RADIUS_MAX = 24;

export function applyThemeVars(theme: Theme): React.CSSProperties {
  return {
    ["--brand" as any]: theme.colors.primary,
    ["--brand-accent" as any]: theme.colors.accent,
    ["--brand-bg" as any]: theme.colors.background,
    ["--brand-surface" as any]: theme.colors.surface,
    ["--brand-text" as any]: theme.colors.text,
    ["--brand-text-muted" as any]: theme.colors.textMuted,
    ["--font-display" as any]: fontStack(theme.typography.displayFont),
    ["--font-sans" as any]: fontStack(theme.typography.bodyFont),
    ["--brand-radius" as any]: `${theme.buttons.cornerRadius}px`,
  } as React.CSSProperties;
}

// Button *style* changes which CSS properties are set (fill vs. outline vs.
// tinted), so it can't be expressed as a single CSS var the way color/radius
// can — this returns the concrete style object for a themed CTA.
export function themedButtonStyle(
  theme: Theme,
  variant: "primary" | "accent" = "primary",
): React.CSSProperties {
  const color = variant === "accent" ? theme.colors.accent : theme.colors.primary;
  const radius = `${theme.buttons.cornerRadius}px`;
  switch (theme.buttons.style) {
    case "outline":
      return { background: "transparent", color, border: `1.5px solid ${color}`, borderRadius: radius };
    case "soft":
      return { background: `color-mix(in oklab, ${color} 16%, transparent)`, color, border: "none", borderRadius: radius };
    case "solid":
    default:
      return { background: color, color: "#FFFFFF", border: "none", borderRadius: radius };
  }
}

export function defaultTheme(): Theme {
  return {
    version: 1,
    preset: "clean_minimal",
    colors: {
      primary: "#8E2A38",
      accent: "#8E2A38",
      background: "#FFFFFF",
      surface: "#F7F7F9",
      text: "#16161A",
      textMuted: "#6B6B76",
    },
    typography: { displayFont: "Fraunces", bodyFont: "Inter" },
    buttons: { style: "solid", cornerRadius: 12 },
    logoUrl: null,
    updatedAt: new Date().toISOString(),
  };
}

export function parseTheme(raw: unknown): Theme {
  if (!raw || typeof raw !== "object" || !("colors" in raw)) return defaultTheme();
  return { ...defaultTheme(), ...(raw as object) } as Theme;
}
