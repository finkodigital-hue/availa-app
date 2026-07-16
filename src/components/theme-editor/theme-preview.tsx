import { themedButtonStyle, type Theme } from "@/lib/theme";

// A small, self-contained mock booking page driven entirely by `theme` —
// used for the wizard's preset cards, Step 3's live preview, and the Design
// panel. Not the real public page, just a fast approximation of it.
export function ThemePreview({ theme, name = "Your booking page" }: { theme: Theme; name?: string }) {
  return (
    <div
      className="rounded-xl border p-5 transition-colors"
      style={{
        background: theme.colors.background,
        color: theme.colors.text,
        fontFamily: `"${theme.typography.bodyFont}", ui-sans-serif, system-ui, sans-serif`,
        borderRadius: `${Math.max(theme.buttons.cornerRadius, 8)}px`,
      }}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] mb-3" style={{ color: theme.colors.textMuted }}>
        Preview
      </div>
      <div className="flex items-center gap-3 mb-4">
        {theme.logoUrl ? (
          <img src={theme.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
        ) : (
          <div
            className="h-10 w-10 grid place-items-center text-white font-semibold rounded-lg"
            style={{ background: theme.colors.primary }}
          >
            {name.trim().charAt(0).toUpperCase() || "C"}
          </div>
        )}
        <div
          className="text-xl"
          style={{ fontFamily: `"${theme.typography.displayFont}", ui-serif, Georgia, serif` }}
        >
          {name}
        </div>
      </div>
      <div
        className="rounded-lg p-3 mb-3 text-sm"
        style={{ background: theme.colors.surface }}
      >
        Haircut & style · 45 min · $65
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="px-3 py-2 text-xs" style={themedButtonStyle(theme, "primary")}>
          Book now
        </button>
        <button className="px-3 py-2 text-xs" style={themedButtonStyle(theme, "accent")}>
          Accent
        </button>
      </div>
    </div>
  );
}
