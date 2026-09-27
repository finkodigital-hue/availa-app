// The booking page's unified theme object — the single source of styling
// truth for the public booking page (see businesses.page_theme). Successor
// to the old flat brand_color/font/button_style/... columns and the unused
// brandingVars() helper that used to live here.
// Apply with: <div style={applyThemeVars(theme)}> ... </div>

import { safeImageSrc } from "@/lib/safe-url";

export type ButtonStyle = "solid" | "outline" | "soft";
export type PresetId =
  | "clean_minimal"
  | "bold_modern"
  | "soft_elegant"
  | "fresh_playful";

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

// Curated fonts bundled with Bookzenvo. Keeping the public booking page
// self-hosted avoids disclosing each visitor's network details to a font CDN.
export const FONT_CHOICES: { id: string; label: string; stack: string }[] = [
  {
    id: "Inter",
    label: "Inter (modern sans)",
    stack: '"Inter", ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: "Fraunces",
    label: "Fraunces (editorial serif)",
    stack: '"Fraunces", ui-serif, Georgia, serif',
  },
  {
    id: "DM Sans",
    label: "DM Sans (clean sans)",
    stack: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: "Cormorant Garamond",
    label: "Cormorant Garamond (elegant serif)",
    stack: '"Cormorant Garamond", ui-serif, Georgia, serif',
  },
];

function fontStack(name: string): string {
  // Theme data is persisted JSON and can be edited outside the UI. Never
  // interpolate an arbitrary value into the raw scoped stylesheet.
  return (
    FONT_CHOICES.find((f) => f.id === name)?.stack ?? FONT_CHOICES[0].stack
  );
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

export const BUTTON_RADIUS_MIN = 0;
export const BUTTON_RADIUS_MAX = 24;

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function relativeLuminance(hex: string): number {
  const channels = Object.values(hexToRgb(hex)).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(first: string, second: string): number {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second));
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function mixHex(from: string, to: string, amount: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  return rgbToHex({
    r: start.r + (end.r - start.r) * amount,
    g: start.g + (end.g - start.g) * amount,
    b: start.b + (end.b - start.b) * amount,
  });
}

function minimumContrast(foreground: string, backgrounds: string[]): number {
  return Math.min(
    ...backgrounds.map((background) => contrastRatio(foreground, background)),
  );
}

/**
 * Preserve a chosen theme colour when it is readable, otherwise move it
 * towards whichever of black or white works best on every supplied surface.
 */
export function accessibleForeground(
  foreground: string,
  backgrounds: string[],
  minimum = 4.5,
): string {
  if (minimumContrast(foreground, backgrounds) >= minimum) return foreground;

  const targets = ["#000000", "#FFFFFF"];
  const target = targets.reduce((best, candidate) =>
    minimumContrast(candidate, backgrounds) > minimumContrast(best, backgrounds)
      ? candidate
      : best,
  );

  if (minimumContrast(target, backgrounds) < minimum) return target;

  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const midpoint = (low + high) / 2;
    const candidate = mixHex(foreground, target, midpoint);
    if (minimumContrast(candidate, backgrounds) >= minimum) high = midpoint;
    else low = midpoint;
  }
  return mixHex(foreground, target, high);
}

export function solidButtonForeground(background: string): string {
  return contrastRatio("#000000", background) >=
    contrastRatio("#FFFFFF", background)
    ? "#000000"
    : "#FFFFFF";
}

export function applyThemeVars(theme: Theme): React.CSSProperties {
  const safeTheme = parseTheme(theme);
  const surfaces = [safeTheme.colors.background, safeTheme.colors.surface];
  const readableText = accessibleForeground(safeTheme.colors.text, surfaces);
  const readableMutedText = accessibleForeground(
    safeTheme.colors.textMuted,
    surfaces,
  );
  return {
    // Override the app's semantic colour tokens inside the public page so
    // Tailwind utilities such as bg-background, bg-card and text-muted-
    // foreground reflect the owner's theme instead of the Bookzenvo admin
    // palette. Keeping these scoped on the page root prevents the storefront
    // theme from leaking into the surrounding page-builder UI.
    ["--background" as any]: safeTheme.colors.background,
    ["--foreground" as any]: readableText,
    ["--card" as any]: safeTheme.colors.surface,
    ["--card-foreground" as any]: readableText,
    ["--popover" as any]: safeTheme.colors.surface,
    ["--popover-foreground" as any]: readableText,
    ["--primary" as any]: safeTheme.colors.primary,
    ["--primary-foreground" as any]: solidButtonForeground(
      safeTheme.colors.primary,
    ),
    ["--accent" as any]: safeTheme.colors.accent,
    ["--secondary" as any]: `color-mix(in srgb, ${safeTheme.colors.accent} 10%, ${safeTheme.colors.background})`,
    ["--secondary-foreground" as any]: readableText,
    ["--muted" as any]: safeTheme.colors.surface,
    ["--muted-foreground" as any]: readableMutedText,
    ["--border" as any]: `color-mix(in srgb, ${safeTheme.colors.text} 14%, transparent)`,
    ["--input" as any]: `color-mix(in srgb, ${safeTheme.colors.text} 18%, transparent)`,
    ["--ring" as any]: safeTheme.colors.primary,
    ["--brand" as any]: safeTheme.colors.primary,
    ["--brand-accent" as any]: safeTheme.colors.accent,
    ["--brand-bg" as any]: safeTheme.colors.background,
    ["--brand-surface" as any]: safeTheme.colors.surface,
    ["--brand-text" as any]: readableText,
    ["--brand-text-muted" as any]: readableMutedText,
    ["--brand-contrast" as any]: solidButtonForeground(
      safeTheme.colors.primary,
    ),
    ["--brand-accent-contrast" as any]: solidButtonForeground(
      safeTheme.colors.accent,
    ),
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
  const color =
    variant === "accent" ? safeTheme.colors.accent : safeTheme.colors.primary;
  const readableColor = accessibleForeground(color, [
    safeTheme.colors.background,
    safeTheme.colors.surface,
  ]);
  const radius = `${safeTheme.buttons.cornerRadius}px`;
  switch (safeTheme.buttons.style) {
    case "outline":
      return {
        background: "transparent",
        color: readableColor,
        border: `1.5px solid ${readableColor}`,
        borderRadius: radius,
      };
    case "soft":
      return {
        background: `color-mix(in oklab, ${color} 16%, transparent)`,
        color: readableColor,
        border: "none",
        borderRadius: radius,
      };
    case "solid":
    default:
      return {
        background: color,
        color: solidButtonForeground(color),
        border: "none",
        borderRadius: radius,
      };
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
      ...(design.cornerRadius !== undefined
        ? { cornerRadius: design.cornerRadius }
        : {}),
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
    typeof value === "string" &&
    FONT_CHOICES.some((choice) => choice.id === value)
      ? value
      : defaultValue;
  const preset = PRESET_IDS.includes(input.preset as PresetId)
    ? (input.preset as PresetId)
    : fallback.preset;
  const style = BUTTON_STYLES.includes(inputButtons.style as ButtonStyle)
    ? (inputButtons.style as ButtonStyle)
    : fallback.buttons.style;
  const radius =
    typeof inputButtons.cornerRadius === "number" &&
    Number.isFinite(inputButtons.cornerRadius)
      ? Math.min(
          BUTTON_RADIUS_MAX,
          Math.max(BUTTON_RADIUS_MIN, inputButtons.cornerRadius),
        )
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
      displayFont: font(
        inputTypography.displayFont,
        fallback.typography.displayFont,
      ),
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
