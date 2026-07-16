import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarDays } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { PRESET_LABELS, presetRange, fmtRange, type DatePreset } from "@/lib/report-dates";

const PRESET_IDS = Object.keys(PRESET_LABELS) as Exclude<DatePreset, "custom">[];

export function ReportDateRangePicker({
  from,
  to,
  preset,
  onChange,
}: {
  from: Date;
  to: Date;
  preset: DatePreset;
  onChange: (v: { from: Date; to: Date; preset: DatePreset }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>({ from, to });

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft({ from, to });
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 print:hidden">
          <CalendarDays className="h-4 w-4" />
          {fmtRange(from, to)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="flex sm:flex-col gap-1 p-3 border-b sm:border-b-0 sm:border-r sm:w-40">
            {PRESET_IDS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  const r = presetRange(p);
                  onChange({ ...r, preset: p });
                  setOpen(false);
                }}
                className={`text-left text-sm px-3 py-2 rounded-lg whitespace-nowrap transition-colors ${
                  preset === p ? "bg-secondary font-medium" : "hover:bg-secondary/60 text-muted-foreground"
                }`}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="p-3">
            <Calendar
              mode="range"
              selected={draft}
              onSelect={setDraft}
              numberOfMonths={2}
              defaultMonth={from}
            />
            <div className="flex justify-end gap-2 mt-2 pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!draft?.from || !draft?.to}
                onClick={() => {
                  if (!draft?.from || !draft?.to) return;
                  const t = new Date(draft.to);
                  t.setHours(23, 59, 59, 999);
                  onChange({ from: draft.from, to: t, preset: "custom" });
                  setOpen(false);
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
