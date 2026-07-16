import { paletteFor, initialsOf } from "@/lib/staff-colors";

// Small staff-identity cue for Week/Month bookings, where — unlike Day view
// — there's no dedicated staff column carrying that context. Deliberately
// initials-only (no photo fetch) since a single view can render dozens of
// these at once.
export function StaffAvatarChip({ staffId, name, className }: { staffId?: string | null; name?: string | null; className?: string }) {
  const palette = paletteFor(staffId);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-[8px] font-semibold leading-none ${className ?? "h-4 w-4"}`}
      style={{ background: palette.bg, color: palette.ink, border: `1px solid ${palette.border}` }}
      title={name ?? undefined}
    >
      {initialsOf(name)}
    </span>
  );
}
