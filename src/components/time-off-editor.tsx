import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Plane, Stethoscope, Coffee, GraduationCap, CalendarOff, MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { fmtTime } from "@/lib/format";
import { toast } from "sonner";

const KINDS = [
  { id: "holiday", label: "Holiday", icon: CalendarOff, color: "bg-rose-100 text-rose-900" },
  { id: "vacation", label: "Vacation", icon: Plane, color: "bg-sky-100 text-sky-900" },
  { id: "sick", label: "Sick leave", icon: Stethoscope, color: "bg-amber-100 text-amber-900" },
  { id: "break", label: "Lunch / break", icon: Coffee, color: "bg-emerald-100 text-emerald-900" },
  { id: "training", label: "Training", icon: GraduationCap, color: "bg-violet-100 text-violet-900" },
  { id: "other", label: "Other", icon: MoreHorizontal, color: "bg-secondary text-foreground" },
];

type Row = {
  id: string;
  business_id: string;
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
  kind: string | null;
  title: string | null;
  reason: string | null;
};

export function TimeOffEditor({ businessId, staffId }: { businessId: string; staffId?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["time-off", businessId, staffId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("blocked_dates")
        .select("*")
        .eq("business_id", businessId)
        .order("starts_at", { ascending: false })
        .limit(50);
      if (staffId) q = q.or(`staff_id.eq.${staffId},staff_id.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const del = async (id: string) => {
    const { error } = await supabase.from("blocked_dates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Time off removed");
    qc.invalidateQueries({ queryKey: ["time-off"] });
    qc.invalidateQueries({ queryKey: ["slots-day"] });
    qc.invalidateQueries({ queryKey: ["calendar"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Holidays, vacations, sick leave, breaks — these block bookings automatically.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : data?.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/40 p-6 text-center text-sm text-muted-foreground">
          No time off scheduled.
        </div>
      ) : (
        <ul className="space-y-2">
          {data?.map((r) => {
            const kind = KINDS.find((k) => k.id === (r.kind ?? "other")) ?? KINDS[5];
            const start = new Date(r.starts_at);
            const end = new Date(r.ends_at);
            const allDay =
              start.getHours() === 0 &&
              start.getMinutes() === 0 &&
              end.getHours() === 23 &&
              end.getMinutes() >= 59;
            const sameDay = start.toDateString() === end.toDateString();
            return (
              <li key={r.id} className="rounded-xl border bg-card p-3 flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg grid place-items-center shrink-0 ${kind.color}`}>
                  <kind.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium truncate">
                    {r.title || kind.label}
                    {!r.staff_id && <Badge variant="secondary" className="text-[10px]">All staff</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {sameDay
                      ? `${start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}${allDay ? " · all day" : ` · ${fmtTime(start)} – ${fmtTime(end)}`}`
                      : `${start.toLocaleDateString([], { month: "short", day: "numeric" })} – ${end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`}
                  </div>
                  {r.reason && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.reason}</p>}
                </div>
                <ConfirmDialog
                  trigger={
                    <button className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive" aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  }
                  title="Remove this time off?"
                  description="Bookings will become available in this period again."
                  confirmLabel="Remove"
                  onConfirm={async () => { await del(r.id); }}
                />
              </li>
            );
          })}
        </ul>
      )}

      <AddTimeOffDialog
        open={open}
        onOpenChange={setOpen}
        businessId={businessId}
        defaultStaffId={staffId}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["time-off"] });
          qc.invalidateQueries({ queryKey: ["slots-day"] });
          qc.invalidateQueries({ queryKey: ["calendar"] });
        }}
      />
    </div>
  );
}

function AddTimeOffDialog({
  open,
  onOpenChange,
  businessId,
  defaultStaffId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  businessId: string;
  defaultStaffId?: string;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState("vacation");
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const starts = new Date(`${startDate}T${allDay ? "00:00" : startTime}:00`);
      const ends = new Date(`${endDate}T${allDay ? "23:59" : endTime}:00`);
      if (ends <= starts) throw new Error("End must be after start.");
      const { error } = await supabase.from("blocked_dates").insert({
        business_id: businessId,
        staff_id: defaultStaffId ?? null,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        kind,
        title: title || null,
        reason: reason || null,
      });
      if (error) throw error;
      toast.success("Time off added");
      onOpenChange(false);
      setTitle("");
      setReason("");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Add time off</DialogTitle>
          <DialogDescription>
            {defaultStaffId ? "Blocks bookings for this staff member." : "Blocks bookings for the whole team."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="mt-1.5 h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    <span className="inline-flex items-center gap-2">
                      <k.icon className="h-3.5 w-3.5" /> {k.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Title (optional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5 h-10" placeholder="e.g. Summer break" />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-secondary/60 p-3">
            <Label className="text-sm">All day</Label>
            <Switch checked={allDay} onCheckedChange={setAllDay} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1.5 h-10" />
            </div>
            <div>
              <Label>End</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1.5 h-10" />
            </div>
          </div>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1.5 h-10" />
              </div>
              <div>
                <Label>Until</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1.5 h-10" />
              </div>
            </div>
          )}
          <div>
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5 h-10" placeholder="Internal note" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
