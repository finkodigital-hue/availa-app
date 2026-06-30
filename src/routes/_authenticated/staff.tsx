import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ChangeEvent } from "react";
import { Plus, Pencil, Trash2, Users, Upload, Loader2, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StaffHoursEditor } from "@/components/staff-hours-editor";
import { StaffServicesEditor } from "@/components/staff-services-editor";
import { compressImage, signedUrl } from "@/lib/image";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
});

type Staff = { id: string; name: string; email: string | null; phone: string | null; role: string | null; bio: string | null; photo_url: string | null; bookable: boolean; active: boolean };

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

  const del = async (s: Staff) => {
    // If they have bookings, suggest disabling instead
    const { count } = await supabase.from("bookings").select("id", { count: "exact", head: true }).eq("staff_id", s.id);
    if ((count ?? 0) > 0) {
      toast.error("This staff member has bookings. Disable them instead to preserve history.");
      return;
    }
    const { error } = await supabase.from("staff").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Staff removed");
    qc.invalidateQueries({ queryKey: ["staff"] });
  };

  const toggleActive = async (s: Staff, v: boolean) => {
    const { error } = await supabase.from("staff").update({ active: v }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success(v ? "Staff enabled" : "Staff disabled");
    qc.invalidateQueries({ queryKey: ["staff"] });
  };

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader
        eyebrow="Team"
        title="Staff"
        subtitle="The people who take bookings. Customers can choose between them on your booking page."
        action={
          <Button onClick={() => setEdit({ bookable: true, active: true })} className="shadow-glow">
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
          description="Add yourself or a colleague to start taking bookings."
          action={
            <Button onClick={() => setEdit({ bookable: true, active: true })}>
              <Plus className="h-4 w-4 mr-1" /> Add first member
            </Button>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff?.map((s, i) => {
            const tint = AVATAR_TINTS[i % AVATAR_TINTS.length];
            return (
              <div key={s.id} className={`group rounded-2xl border bg-card p-5 card-hover animate-rise stagger-${(i % 6) + 1} ${!s.active ? "opacity-70" : ""}`}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <StaffAvatar staff={s} tint={tint} />
                    <div className="min-w-0">
                      <h3 className="font-medium truncate">{s.name}</h3>
                      {s.role && <p className="text-xs text-muted-foreground truncate">{s.role}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-2 rounded-lg hover:bg-secondary" onClick={() => setEdit(s)} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <ConfirmDialog
                      trigger={
                        <button className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive" aria-label="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      }
                      title="Remove this team member?"
                      description="If they have bookings, you'll need to disable them instead."
                      confirmLabel="Remove"
                      onConfirm={() => del(s)}
                    />
                  </div>
                </div>
                {s.bio && <p className="text-sm text-muted-foreground mt-3 line-clamp-2 text-pretty">{s.bio}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!s.active && <Badge variant="secondary">Disabled</Badge>}
                  {s.active && !s.bookable && <Badge variant="secondary">Hidden</Badge>}
                  <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Active</span>
                    <Switch checked={s.active} onCheckedChange={(v) => toggleActive(s, v)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{edit?.id ? edit.name ?? "Edit staff" : "Add staff"}</DialogTitle>
            <DialogDescription>{edit?.id ? "Profile, working hours and services." : "Add a new team member."}</DialogDescription>
          </DialogHeader>

          {!edit?.id ? (
            <StaffProfileForm
              edit={edit}
              setEdit={setEdit}
              businessId={bid}
              onSaved={() => { setEdit(null); qc.invalidateQueries({ queryKey: ["staff"] }); }}
            />
          ) : (
            <Tabs defaultValue="profile">
              <TabsList className="w-full">
                <TabsTrigger value="profile" className="flex-1">Profile</TabsTrigger>
                <TabsTrigger value="hours" className="flex-1">Hours</TabsTrigger>
                <TabsTrigger value="services" className="flex-1">Services</TabsTrigger>
              </TabsList>
              <TabsContent value="profile" className="mt-4">
                <StaffProfileForm
                  edit={edit}
                  setEdit={setEdit}
                  businessId={bid}
                  onSaved={() => qc.invalidateQueries({ queryKey: ["staff"] })}
                />
              </TabsContent>
              <TabsContent value="hours" className="mt-4">
                {bid && <StaffHoursEditor staffId={edit.id!} businessId={bid} />}
              </TabsContent>
              <TabsContent value="services" className="mt-4">
                {bid && <StaffServicesEditor staffId={edit.id!} businessId={bid} />}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StaffAvatar({ staff, tint }: { staff: Staff; tint: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!staff.photo_url) return setUrl(null);
    signedUrl(staff.photo_url).then(setUrl).catch(() => setUrl(null));
  }, [staff.photo_url]);
  if (url) return <img src={url} alt={staff.name} className="h-12 w-12 shrink-0 rounded-full object-cover" />;
  return (
    <div className={`h-12 w-12 shrink-0 rounded-full bg-gradient-to-br ${tint} grid place-items-center font-display text-lg`}>
      {staff.name.charAt(0).toUpperCase()}
    </div>
  );
}

function StaffProfileForm({ edit, setEdit, businessId, onSaved }: {
  edit: Partial<Staff> | null;
  setEdit: (e: Partial<Staff> | null) => void;
  businessId: string | undefined;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (edit?.photo_url) signedUrl(edit.photo_url).then(setPhotoPreview).catch(() => setPhotoPreview(null));
    else setPhotoPreview(null);
  }, [edit?.photo_url]);

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !businessId || !edit?.id) return toast.error("Save staff first to upload a photo");
    setUploading(true);
    try {
      const blob = await compressImage(file, 640, 0.85);
      const path = `${businessId}/staff/${edit.id}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("business-assets").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      await supabase.from("staff").update({ photo_url: path }).eq("id", edit.id);
      setEdit({ ...edit, photo_url: path });
      toast.success("Photo updated");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally { setUploading(false); }
  };

  const save = async () => {
    if (!edit || !businessId) return;
    if (!edit.name) return toast.error("Name is required");
    setSaving(true);
    try {
      const payload = {
        business_id: businessId, name: edit.name, email: edit.email ?? null,
        phone: edit.phone ?? null, role: edit.role ?? null, bio: edit.bio ?? null,
        bookable: edit.bookable ?? true, active: edit.active ?? true,
      };
      if (edit.id) {
        const { error } = await supabase.from("staff").update(payload).eq("id", edit.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("staff").insert(payload).select("id").single();
        if (error) throw error;
        setEdit({ ...edit, id: data.id });
      }
      toast.success(edit.id ? "Profile saved" : "Staff added");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-secondary grid place-items-center overflow-hidden shrink-0">
          {photoPreview ? <img src={photoPreview} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
        </div>
        <label className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs hover:bg-secondary/40 cursor-pointer">
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {photoPreview ? "Change photo" : "Upload photo"}
          <input type="file" accept="image/*" className="hidden" onChange={onPhoto} disabled={uploading || !edit?.id} />
        </label>
      </div>
      <div>
        <Label>Name</Label>
        <Input value={edit?.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="mt-1.5 h-10" placeholder="Jamie Lee" />
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
        <Label>Phone</Label>
        <Input value={edit?.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} className="mt-1.5 h-10" />
      </div>
      <div>
        <Label>Bio</Label>
        <Textarea value={edit?.bio ?? ""} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} className="mt-1.5" placeholder="A short intro for clients…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between rounded-xl bg-secondary/60 p-3">
          <div>
            <Label className="text-sm">Bookable</Label>
            <p className="text-[11px] text-muted-foreground">Show on booking page</p>
          </div>
          <Switch checked={edit?.bookable ?? true} onCheckedChange={(v) => setEdit({ ...edit, bookable: v })} />
        </div>
        <div className="flex items-center justify-between rounded-xl bg-secondary/60 p-3">
          <div>
            <Label className="text-sm">Active</Label>
            <p className="text-[11px] text-muted-foreground">Disable to hide everywhere</p>
          </div>
          <Switch checked={edit?.active ?? true} onCheckedChange={(v) => setEdit({ ...edit, active: v })} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => setEdit(null)}>Close</Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {edit?.id ? "Save changes" : "Add staff"}
        </Button>
      </DialogFooter>
    </div>
  );
}
