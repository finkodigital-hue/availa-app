// The booking page's unified theme object — the single source of styling
// truth for the public booking page (see businesses.page_theme). Successor
// to the old flat brand_color/font/button_style/... columns and the unused
// brandingVars() helper that used to live here.
// Apply with: <div style={applyThemeVars(theme)}> ... </div>

import { safeImageSrc } from "@/lib/safe-url";

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
  {
    id: "Inter",
    label: "Inter (modern sans)",
    stack: '"Inter", ui-sans-serif, system-ui, sans-serif',
    googleParam: "Inter:wght@400;500;600;700",
  },
  {
    id: "Playfair Display",
    label: "Playfair Display (luxe serif)",
    stack: '"Playfair Display", ui-serif, Georgia, serif',
    googleParam: "Playfair+Display:wght@400;500;600;700",
  },
  {
    id: "Space Grotesk",
    label: "Space Grotesk (technical)",
    stack: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
    googleParam: "Space+Grotesk:wght@400;500;600;700",
  },
  {
    id: "Lato",
    label: "Lato (friendly)",
    stack: '"Lato", ui-sans-serif, system-ui, sans-serif',
    googleParam: "Lato:wght@400;700",
  },
  {
    id: "Poppins",
    label: "Poppins (geometric)",
    stack: '"Poppins", ui-sans-serif, system-ui, sans-serif',
    googleParam: "Poppins:wght@400;500;600;700",
  },
  {
    id: "Fraunces",
    label: "Fraunces (editorial serif)",
    stack: '"Fraunces", ui-serif, Georgia, serif',
    googleParam: "Fraunces:wght@400;500;600;700",
  },
  {
    id: "DM Sans",
    label: "DM Sans (clean sans)",
    stack: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
    googleParam: "DM+Sans:wght@400;500;600;700",
  },
  {
    id: "Manrope",
    label: "Manrope (geometric)",
    stack: '"Manrope", ui-sans-serif, system-ui, sans-serif',
    googleParam: "Manrope:wght@400;500;600;700",
  },
  {
    id: "Cormorant Garamond",
    label: "Cormorant Garamond (elegant serif)",
    stack: '"Cormorant Garamond", ui-serif, Georgia, serif',
    googleParam: "Cormorant+Garamond:wght@400;500;600;700",
  },
  {
    id: "Work Sans",
    label: "Work Sans (neutral sans)",
    stack: '"Work Sans", ui-sans-serif, system-ui, sans-serif',
    googleParam: "Work+Sans:wght@400;500;600;700",
  },
];

function fontStack(name: string): string {
  // Theme data is persisted JSON and can be edited outside the UI. Never
  // interpolate an arbitrary value into the raw scoped stylesheet.
  return FONT_CHOICES.find((f) => f.id === name)?.stack ?? FONT_CHOICES[0].stack;
}

// Tailwind v4's `@theme inline` bakes --font-display/--font-sans into the
// generated `.font-display`/`html` rules as literal values at build time,
// not `var()` references — so overriding those custom properties on an
// ancestor (via applyThemeVars) has no effect on elements using those
// utility classes. A scoped, higher-specificity stylesheet is the only way
// to actually override the fonts Tailwind already inlined.
export function themeFontOverrideCss(
  theme: Pick<Theme, "typography">,
  scopeSelector: string,
): string {
  const display = fontStack(theme.typography.displayFont);
  const body = fontStack(theme.typography.bodyFont);
  return `${scopeSelector} { font-family: ${body}; }
${scopeSelector} h1, ${scopeSelector} h2, ${scopeSelector} h3, ${scopeSelector} .font-display { font-family: ${display} !important; }`;
}

// Builds a single Google Fonts CSS2 stylesheet URL for the fonts a theme
// actually uses, for use in a route's `head()` `links`.
export function googleFontsHref(theme: Pick<Theme, "typography">): string {
  const families = Array.from(
    new Set([theme.typography.displayFont, theme.typography.bodyFont]),
  ).map(
    (name) =>
      FONT_CHOICES.find((f) => f.id === name)?.googleParam ?? FONT_CHOICES[0].googleParam,
  );
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
}

export const BUTTON_RADIUS_MIN = 0;
export const BUTTON_RADIUS_MAX = 24;

export function applyThemeVars(theme: Theme): React.CSSProperties {
  const safeTheme = parseTheme(theme);
  return {
    // Override the app's semantic colour tokens inside the public page so
    // Tailwind utilities such as bg-background, bg-card and text-muted-
    // foreground reflect the owner's theme instead of the Bookzenvo admin
    // palette. Keeping these scoped on the page root prevents the storefront
    // theme from leaking into the surrounding page-builder UI.
    ["--background" as any]: safeTheme.colors.background,
    ["--foreground" as any]: safeTheme.colors.text,
    ["--card" as any]: safeTheme.colors.surface,
    ["--card-foreground" as any]: safeTheme.colors.text,
    ["--popover" as any]: safeTheme.colors.surface,
    ["--popover-foreground" as any]: safeTheme.colors.text,
    ["--primary" as any]: safeTheme.colors.primary,
    ["--accent" as any]: safeTheme.colors.accent,
    ["--secondary" as any]: `color-mix(in srgb, ${safeTheme.colors.accent} 10%, ${safeTheme.colors.background})`,
    ["--secondary-foreground" as any]: safeTheme.colors.text,
    ["--muted" as any]: safeTheme.colors.surface,
    ["--muted-foreground" as any]: safeTheme.colors.textMuted,
    ["--border" as any]: `color-mix(in srgb, ${safeTheme.colors.text} 14%, transparent)`,
    ["--input" as any]: `color-mix(in srgb, ${safeTheme.colors.text} 18%, transparent)`,
    ["--ring" as any]: safeTheme.colors.primary,
    ["--brand" as any]: safeTheme.colors.primary,
    ["--brand-accent" as any]: safeTheme.colors.accent,
    ["--brand-bg" as any]: safeTheme.colors.background,
    ["--brand-surface" as any]: safeTheme.colors.surface,
    ["--brand-text" as any]: safeTheme.colors.text,
    ["--brand-text-muted" as any]: safeTheme.colors.textMuted,
    ["--font-display" as any]: fontStack(safeTheme.typography.displayFont),
    ["--font-sans" as any]: fontStack(safeTheme.typography.bodyFont),
    ["--brand-radius" as any]: `${safeTheme.buttons.cornerRadius}px`,
  } as React.CSSProperties;
}

// Button *style* changes which CSS properties are set (fill vs. outline vs.
// tinted), so it can't be expressed as a single CSS var the way color/radius
// can — this returns the concrete style object for a themed CTA.
export function themedButtonStyle(
  theme: Theme,
  variant: "primary" | "accent" = "primary",
): React.CSSProperties {
  const safeTheme = parseTheme(theme);
  const color = variant === "accent" ? safeTheme.colors.accent : safeTheme.colors.primary;
  const radius = `${safeTheme.buttons.cornerRadius}px`;
  switch (safeTheme.buttons.style) {
    case "outline":
      return {
        background: "transparent",
        color,
        border: `1.5px solid ${color}`,
        borderRadius: radius,
      };
    case "soft":
      return {
        background: `color-mix(in oklab, ${color} 16%, transparent)`,
        color,
        border: "none",
        borderRadius: radius,
      };
    case "solid":
    default:
      return { background: color, color: "#FFFFFF", border: "none", borderRadius: radius };
  }
}

// What a caller (the AI suggest-changes flow) is allowed to propose changing
// about the design — narrower than the full Theme: background/surface/text
// colors stay owner-only, since a bad AI-picked background could wreck
// contrast/readability site-wide in a way a bad button color can't.
export interface DesignSuggestion {
  primaryColor?: string;
  accentColor?: string;
  displayFont?: string;
  buttonStyle?: ButtonStyle;
  cornerRadius?: number;
}

export function applyDesignSuggestion(
  theme: Theme,
  design: DesignSuggestion | null | undefined,
): Theme {
  if (!design) return theme;
  return {
    ...theme,
    colors: {
      ...theme.colors,
      ...(design.primaryColor ? { primary: design.primaryColor } : {}),
      ...(design.accentColor ? { accent: design.accentColor } : {}),
    },
    typography: {
      ...theme.typography,
      ...(design.displayFont ? { displayFont: design.displayFont } : {}),
    },
    buttons: {
      ...theme.buttons,
      ...(design.buttonStyle ? { style: design.buttonStyle } : {}),
      ...(design.cornerRadius !== undefined ? { cornerRadius: design.cornerRadius } : {}),
    },
  };
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
  const fallback = defaultTheme();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;

  const input = raw as Record<string, unknown>;
  const inputColors = isRecord(input.colors) ? input.colors : {};
  const inputTypography = isRecord(input.typography) ? input.typography : {};
  const inputButtons = isRecord(input.buttons) ? input.buttons : {};
  const hex = (value: unknown, defaultValue: string) =>
    typeof value === "string" && HEX_COLOR.test(value) ? value : defaultValue;
  const font = (value: unknown, defaultValue: string) =>
    typeof value === "string" && FONT_CHOICES.some((choice) => choice.id === value)
      ? value
      : defaultValue;
  const preset = PRESET_IDS.includes(input.preset as PresetId)
    ? (input.preset as PresetId)
    : fallback.preset;
  const style = BUTTON_STYLES.includes(inputButtons.style as ButtonStyle)
    ? (inputButtons.style as ButtonStyle)
    : fallback.buttons.style;
  const radius =
    typeof inputButtons.cornerRadius === "number" && Number.isFinite(inputButtons.cornerRadius)
      ? Math.min(BUTTON_RADIUS_MAX, Math.max(BUTTON_RADIUS_MIN, inputButtons.cornerRadius))
      : fallback.buttons.cornerRadius;
  const logoUrl = safeImageSrc(input.logoUrl);
  const updatedAt =
    typeof input.updatedAt === "string" && input.updatedAt.length <= 100
      ? input.updatedAt
      : fallback.updatedAt;

  return {
    version: 1,
    preset,
    colors: {
      primary: hex(inputColors.primary, fallback.colors.primary),
      accent: hex(inputColors.accent, fallback.colors.accent),
      background: hex(inputColors.background, fallback.colors.background),
      surface: hex(inputColors.surface, fallback.colors.surface),
      text: hex(inputColors.text, fallback.colors.text),
      textMuted: hex(inputColors.textMuted, fallback.colors.textMuted),
    },
    typography: {
      displayFont: font(inputTypography.displayFont, fallback.typography.displayFont),
      bodyFont: font(inputTypography.bodyFont, fallback.typography.bodyFont),
    },
    buttons: { style, cornerRadius: radius },
    logoUrl,
    updatedAt,
  };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const BUTTON_STYLES: ButtonStyle[] = ["solid", "outline", "soft"];
const PRESET_IDS: PresetId[] = [
  "clean_minimal",
  "bold_modern",
  "soft_elegant",
  "fresh_playful",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
