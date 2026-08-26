import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarDays, Clock3, Loader2, Moon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WEEKDAYS } from "@/lib/format";
import { toast } from "sonner";

type Mode = "business" | "custom" | "off";
type Row = {
  id?: string;
  staff_id: string;
  business_id: string;
  weekday: number;
  open_time: string | null;
  close_time: string | null;
  closed: boolean;
  repeat_weeks: number;
  repeat_anchor: string | null;
  mode: Mode;
};

function nextWeekdayDate(weekday: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + ((weekday - date.getDay() + 7) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Staff hours deliberately use three states, rather than a single vague
 * on/off switch. A missing staff_hours row means “follow the business”, an
 * open row is a custom shift, and a closed row is a genuine day off.
 */
export function StaffHoursEditor({ staffId, businessId }: { staffId: string; businessId: string }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["staff-hours", staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_hours")
        .select("*")
        .eq("staff_id", staffId)
        .order("weekday");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const byWeekday = new Map<number, any>((data ?? []).map((row: any) => [row.weekday, row]));
    setRows(
      Array.from({ length: 7 }, (_, weekday) => {
        const existing = byWeekday.get(weekday);
        if (!existing) {
          return {
            staff_id: staffId,
            business_id: businessId,
            weekday,
            open_time: "09:00",
            close_time: "17:00",
            closed: false,
            repeat_weeks: 1,
            repeat_anchor: null,
            mode: "business" as const,
          };
        }
        return {
          ...existing,
          open_time: existing.open_time?.slice(0, 5) ?? "09:00",
          close_time: existing.close_time?.slice(0, 5) ?? "17:00",
          repeat_weeks: existing.repeat_weeks ?? 1,
          repeat_anchor: existing.repeat_anchor ?? null,
          mode: existing.closed ? ("off" as const) : ("custom" as const),
        };
      }),
    );
  }, [data, staffId, businessId]);

  const update = (index: number, patch: Partial<Row>) => {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  };

  const save = async () => {
    for (const row of rows) {
      if (
        row.mode === "custom" &&
        (!row.open_time || !row.close_time || row.open_time >= row.close_time)
      ) {
        toast.error(`${WEEKDAYS[row.weekday]}: opening time must be before closing time.`);
        return;
      }
      if (row.mode === "custom" && row.repeat_weeks > 1 && !row.repeat_anchor) {
        toast.error(`${WEEKDAYS[row.weekday]}: choose the first working date.`);
        return;
      }
      if (
        row.mode === "custom" &&
        row.repeat_weeks > 1 &&
        row.repeat_anchor &&
        new Date(`${row.repeat_anchor}T12:00:00`).getDay() !== row.weekday
      ) {
        toast.error(`The first working date must be a ${WEEKDAYS[row.weekday]}.`);
        return;
      }
    }

    setSaving(true);
    try {
      for (const row of rows) {
        // Business hours is represented by no row at all. Deleting a saved
        // override means that moving back to this option works immediately.
        if (row.mode === "business") {
          if (row.id) {
            const { error } = await supabase.from("staff_hours").delete().eq("id", row.id);
            if (error) throw error;
          }
          continue;
        }

        const payload = {
          staff_id: row.staff_id,
          business_id: row.business_id,
          weekday: row.weekday,
          open_time: row.mode === "off" ? null : row.open_time,
          close_time: row.mode === "off" ? null : row.close_time,
          closed: row.mode === "off",
          repeat_weeks: row.mode === "custom" ? row.repeat_weeks : 1,
          repeat_anchor: row.mode === "custom" && row.repeat_weeks > 1 ? row.repeat_anchor : null,
        };
        const result = row.id
          ? await supabase.from("staff_hours").update(payload).eq("id", row.id)
          : await supabase.from("staff_hours").upsert(payload, { onConflict: "staff_id,weekday" });
        if (result.error) throw result.error;
      }

      toast.success("Working days saved");
      qc.invalidateQueries({ queryKey: ["staff-hours", staffId] });
      qc.invalidateQueries({ queryKey: ["calendar-day-staff-hours"] });
      qc.invalidateQueries({ queryKey: ["slots-day"] });
    } catch (error: any) {
      toast.error(error.message ?? "Could not save working days");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Set this person's schedule one day at a time. <b className="text-foreground">Business</b>{" "}
        follows your studio hours; <b className="text-foreground">Day off</b> hides them from that
        day's availability.
      </p>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div
            key={row.weekday}
            className={`rounded-xl border bg-card p-3 transition-colors ${row.mode === "off" ? "bg-muted/25" : ""}`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-semibold">{WEEKDAYS[row.weekday]}</span>
              <div className="grid grid-cols-3 rounded-lg border bg-background p-0.5 text-[11px]">
                {(
                  [
                    ["business", Building2, "Business"],
                    ["custom", Clock3, "Custom"],
                    ["off", Moon, "Day off"],
                  ] as const
                ).map(([mode, Icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update(index, {
                      mode,
                      closed: mode === "off",
                      ...(mode === "custom" ? {} : { repeat_weeks: 1, repeat_anchor: null }),
                    })}
                    className={`inline-flex min-h-8 items-center justify-center gap-1 rounded-md px-2 font-medium transition-colors ${
                      row.mode === mode
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3 w-3" /> {label}
                  </button>
                ))}
              </div>
            </div>

            {row.mode === "custom" && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-[11px] text-muted-foreground">
                    Starts
                    <Input
                      type="time"
                      value={row.open_time?.slice(0, 5) ?? ""}
                      onChange={(event) => update(index, { open_time: event.target.value })}
                      className="h-9 tabular-nums text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-[11px] text-muted-foreground">
                    Finishes
                    <Input
                      type="time"
                      value={row.close_time?.slice(0, 5) ?? ""}
                      onChange={(event) => update(index, { close_time: event.target.value })}
                      className="h-9 tabular-nums text-sm"
                    />
                  </label>
                </div>
                <div className="rounded-lg bg-secondary/45 p-3">
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /> Repeats
                  </label>
                  <select
                    value={row.repeat_weeks}
                    onChange={(event) => {
                      const repeat_weeks = Number(event.target.value);
                      update(index, {
                        repeat_weeks,
                        repeat_anchor: repeat_weeks > 1 ? (row.repeat_anchor ?? nextWeekdayDate(row.weekday)) : null,
                      });
                    }}
                    className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    aria-label={`${WEEKDAYS[row.weekday]} repeat pattern`}
                  >
                    <option value={1}>Every week</option>
                    <option value={2}>Every 2 weeks</option>
                    <option value={3}>Every 3 weeks</option>
                    <option value={4}>Every 4 weeks</option>
                  </select>
                  {row.repeat_weeks > 1 && (
                    <label className="mt-2 block space-y-1 text-[11px] text-muted-foreground">
                      First working {WEEKDAYS[row.weekday]}
                      <Input
                        type="date"
                        value={row.repeat_anchor ?? ""}
                        onChange={(event) => update(index, { repeat_anchor: event.target.value })}
                        className="h-9 text-sm"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
            {row.mode === "business" && (
              <p className="mt-2 text-xs text-muted-foreground">Uses your business hours.</p>
            )}
            {row.mode === "off" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Not bookable. They are hidden from the day calendar unless they already have a
                booking.
              </p>
            )}
          </div>
        ))}
      </div>
      <Button onClick={save} disabled={saving} size="sm">
        {saving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
        Save working days
      </Button>
    </div>
  );
}
