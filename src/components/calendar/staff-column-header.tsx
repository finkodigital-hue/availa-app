import { useEffect, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Armchair, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { compressImage, signedUrl } from "@/lib/image";
import { initialsOf, type StaffPalette } from "@/lib/staff-colors";

export function StaffColumnHeader({ staff, palette, dayOff }: { staff: any; palette: StaffPalette; dayOff?: boolean }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!staff.photo_url) return setUrl(null);
    signedUrl(staff.photo_url).then(setUrl).catch(() => setUrl(null));
  }, [staff.photo_url]);

  const changePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || staff._readOnly) return;
    if (!staff.business_id || !staff.id) {
      toast.error("This staff profile cannot be updated right now");
      return;
    }

    setUploading(true);
    try {
      const blob = await compressImage(file, 640, 0.85);
      const path = `${staff.business_id}/staff/${staff.id}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("business-assets")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("staff")
        .update({ photo_url: path })
        .eq("id", staff.id)
        .eq("business_id", staff.business_id);
      if (updateError) throw updateError;

      setUrl(await signedUrl(path));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["calendar-staff"] }),
        queryClient.invalidateQueries({ queryKey: ["staff"] }),
      ]);
      toast.success(`${staff.name}'s photo updated`);
    } catch (error: any) {
      toast.error(error?.message ?? "Could not update the profile photo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={`border-r last:border-r-0 px-3 py-3.5 flex items-center gap-3 min-w-0 ${dayOff ? "opacity-60" : ""}`}
      data-calendar-staff-person
    >
      <div className="relative shrink-0" data-calendar-staff-avatar>
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
        {!staff._readOnly && (
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card"
            style={{ background: "oklch(0.68 0.16 155)" }}
            title="Online"
          />
        )}
        {!staff._readOnly && (
          <label
            className="absolute -top-1.5 -right-1.5 grid h-5 w-5 cursor-pointer place-items-center rounded-full border border-border bg-card text-foreground shadow-sm transition-transform hover:scale-105 focus-within:ring-2 focus-within:ring-ring"
            title={`Change ${staff.name}'s profile photo`}
            aria-label={`Change ${staff.name}'s profile photo`}
          >
            {uploading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Camera className="h-2.5 w-2.5" />}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={changePhoto}
              disabled={uploading}
            />
          </label>
        )}
      </div>
      <div className="min-w-0 flex-1" data-calendar-staff-copy>
        <div className="text-sm font-semibold truncate tracking-tight flex items-center gap-1.5" data-calendar-staff-name>
          <span className="truncate">{staff.name}</span>
          {staff._readOnly && (
            <span
              className="shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
              title="No longer an active team member — shown only because they have appointments here"
            >
              Inactive
            </span>
          )}
          {!staff._readOnly && dayOff && (
            <span
              className="shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
              title="Not scheduled to work today"
            >
              Off today
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
        {staff.role && <div className="text-[11px] text-muted-foreground truncate" data-calendar-staff-role>{staff.role}</div>}
      </div>
      <span className="h-2 w-8 rounded-full shrink-0" style={{ background: palette.border }} title={palette.name} data-calendar-staff-colour />
    </div>
  );
}
