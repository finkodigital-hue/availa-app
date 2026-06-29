import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
});

type Staff = { id: string; name: string; email: string | null; phone: string | null; role: string | null; bio: string | null; photo_url: string | null; bookable: boolean };

function StaffPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Staff> | null>(null);

  const { data: staff } = useQuery({
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
    toast.success("Saved"); setEdit(null);
    qc.invalidateQueries({ queryKey: ["staff"] });
  };
  const del = async (id: string) => {
    if (!confirm("Delete this staff member?")) return;
    const { error } = await supabase.from("staff").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["staff"] });
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <PageHeader title="Staff" subtitle="Your team that takes bookings." action={
        <Button onClick={() => setEdit({ bookable: true })}><Plus className="h-4 w-4 mr-1" /> Add staff</Button>
      } />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {staff?.map((s) => (
          <div key={s.id} className="rounded-2xl border bg-card p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center font-display text-lg">
                  {s.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-medium">{s.name}</h3>
                  {s.role && <p className="text-xs text-muted-foreground">{s.role}</p>}
                </div>
              </div>
              <div className="flex gap-1">
                <button className="p-2 rounded-lg hover:bg-muted" onClick={() => setEdit(s)}><Pencil className="h-3.5 w-3.5" /></button>
                <button className="p-2 rounded-lg hover:bg-muted" onClick={() => del(s.id)}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            {s.bio && <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{s.bio}</p>}
            {!s.bookable && <span className="inline-block mt-3 text-xs px-2 py-0.5 rounded-full bg-muted">Not bookable</span>}
          </div>
        ))}
        {staff?.length === 0 && <div className="col-span-full rounded-2xl border border-dashed p-12 text-center text-muted-foreground">No staff yet.</div>}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit staff" : "Add staff"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={edit?.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="mt-1.5" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Role</Label><Input value={edit?.role ?? ""} onChange={(e) => setEdit({ ...edit, role: e.target.value })} className="mt-1.5" placeholder="Stylist" /></div>
              <div><Label>Email</Label><Input type="email" value={edit?.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} className="mt-1.5" /></div>
            </div>
            <div><Label>Bio</Label><Textarea value={edit?.bio ?? ""} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} className="mt-1.5" /></div>
            <div className="flex items-center justify-between"><Label>Bookable online</Label><Switch checked={edit?.bookable ?? true} onCheckedChange={(v) => setEdit({ ...edit, bookable: v })} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
