import { Label } from "@/components/ui/label";

// Swatch-only — no raw hex text, no decorative icon. The swatch itself IS
// the click-to-open-picker affordance (native color input), so a separate
// icon next to it would just be redundant chrome, not a real second
// control — a plain full-width color block reads as one intentional thing
// rather than icon + swatch competing for the same "this opens a picker"
// meaning. The native picker UI still shows/accepts a hex value for anyone
// who wants to type one; we just don't surface it in the main panel.
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} colour`}
        className="mt-1.5 h-10 w-full rounded-lg border cursor-pointer shadow-soft p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[inherit] [&::-webkit-color-swatch]:border-none"
      />
    </div>
  );
}
