import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
});

type Staff = { id: string; name: string; email: string | null; phone: string | null; role: string | null; bio: string | null; photo_url: string | null; bookable: boolean };

const AVATAR_TINTS = [
  "from-orange-200 to-rose-200 text-rose-900",
  "from-amber-200 to-yellow-100 text-amber-900",
  "from-emerald-200 to-teal-100 text-emerald-900",
  "from-sky-200 to-indigo-100 text-indigo-900",
  "from-violet-200 to-fuchsia-100 text-violet-900",
];

function StaffPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Staff> | null>(null);

  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("*").eq("business_id", bid!).order("name");
      if (error) throw error;
      return data as Staff[];
    },
  });

  const save = async () => {
    if (!edit || !bid || !edit.name) return toast.error("Name is required");
    const payload = { business_id: bid, name: edit.name, email: edit.email ?? null, phone: edit.phone ?? null, role: edit.role ?? null, bio: edit.bio ?? null, bookable: edit.bookable ?? true };
    const { error } = edit.id
      ? await supabase.from("staff").update(payload).eq("id", edit.id)
      : await supabase.from("staff").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(edit.id ? "Staff updated" : "Staff added"); setEdit(null);
    qc.invalidateQueries({ queryKey: ["staff"] });
  };
  const del = async (id: string) => {
    if (!confirm("Remove this team member?")) return;
    const { error } = await supabase.from("staff").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Staff removed");
    qc.invalidateQueries({ queryKey: ["staff"] });
  };

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader
        eyebrow="Team"
        title="Staff"
        subtitle="The people who take bookings. Customers can choose between them on your booking page."
        action={
          <Button onClick={() => setEdit({ bookable: true })} className="shadow-glow">
            <Plus className="h-4 w-4 mr-1" /> Add staff
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : staff?.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No team members yet"
          description="Add yourself or a colleague to start taking bookings. You can hide anyone from the public page later."
          action={
            <Button onClick={() => setEdit({ bookable: true })}>
              <Plus className="h-4 w-4 mr-1" /> Add first member
            </Button>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff?.map((s, i) => {
            const tint = AVATAR_TINTS[i % AVATAR_TINTS.length];
            return (
              <div key={s.id} className={`group rounded-2xl border bg-card p-5 card-hover animate-rise stagger-${(i % 6) + 1}`}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-12 w-12 shrink-0 rounded-full bg-gradient-to-br ${tint} grid place-items-center font-display text-lg`}>
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium truncate">{s.name}</h3>
                      {s.role && <p className="text-xs text-muted-foreground truncate">{s.role}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-2 rounded-lg hover:bg-secondary" onClick={() => setEdit(s)} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive" onClick={() => del(s.id)} aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {s.bio && <p className="text-sm text-muted-foreground mt-3 line-clamp-2 text-pretty">{s.bio}</p>}
                {!s.bookable && <Badge variant="secondary" className="mt-3">Hidden</Badge>}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{edit?.id ? "Edit staff" : "Add staff"}</DialogTitle>
            <DialogDescription>Their name and role appear on your booking page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={edit?.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="mt-1.5 h-10" autoFocus placeholder="Jamie Lee" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role</Label>
                <Input value={edit?.role ?? ""} onChange={(e) => setEdit({ ...edit, role: e.target.value })} className="mt-1.5 h-10" placeholder="Senior Stylist" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={edit?.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} className="mt-1.5 h-10" />
              </div>
            </div>
            <div>
              <Label>Bio</Label>
              <Textarea value={edit?.bio ?? ""} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} className="mt-1.5" placeholder="A short intro for clients…" />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-secondary/60 p-3">
              <div>
                <Label className="text-sm">Bookable online</Label>
                <p className="text-xs text-muted-foreground">Show on the public booking page.</p>
              </div>
              <Switch checked={edit?.bookable ?? true} onCheckedChange={(v) => setEdit({ ...edit, bookable: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={save}>{edit?.id ? "Save changes" : "Add staff"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
