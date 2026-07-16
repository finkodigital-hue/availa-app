import { useEffect, useState } from "react";
import { Armchair } from "lucide-react";

import { signedUrl } from "@/lib/image";
import { initialsOf, type StaffPalette } from "@/lib/staff-colors";

export function StaffColumnHeader({ staff, palette }: { staff: any; palette: StaffPalette }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!staff.photo_url) return setUrl(null);
    signedUrl(staff.photo_url).then(setUrl).catch(() => setUrl(null));
  }, [staff.photo_url]);

  return (
    <div className="border-r last:border-r-0 px-3 py-3.5 flex items-center gap-3 min-w-0">
      <div className="relative shrink-0">
        {url ? (
          <img
            src={url}
            alt={staff.name}
            className="h-10 w-10 rounded-full object-cover ring-2"
            style={{ ["--tw-ring-color" as any]: palette.border }}
          />
        ) : (
          <div
            className="h-10 w-10 rounded-full grid place-items-center text-[13px] font-semibold ring-2"
            style={{ background: palette.bg, color: palette.ink, ["--tw-ring-color" as any]: palette.border }}
          >
            {initialsOf(staff.name)}
          </div>
        )}
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card"
          style={{ background: "var(--confirmed)" }}
          title="Online"
        />
        {!staff._readOnly && (
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card"
            style={{ background: "oklch(0.68 0.16 155)" }}
            title="Online"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate tracking-tight flex items-center gap-1.5">
          <span className="truncate">{staff.name}</span>
          {staff._readOnly && (
            <span
              className="shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
              title="No longer an active team member — shown only because they have appointments here"
            >
              Inactive
            </span>
          )}
          {staff.is_independent && (
            <span
              className="shrink-0 inline-grid place-items-center h-4 w-4 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300"
              title={staff.chair_label ? `Independent · ${staff.chair_label}` : "Independent professional"}
            >
              <Armchair className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
        {staff.role && <div className="text-[11px] text-muted-foreground truncate">{staff.role}</div>}
      </div>
      <span className="h-2 w-8 rounded-full shrink-0" style={{ background: palette.border }} title={palette.name} />
    </div>
  );
}
