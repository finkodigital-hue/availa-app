import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Plus, Pencil, Trash2, Users, Upload, Loader2, Image as ImageIcon, Crown, Search, MoreHorizontal, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StaffHoursEditor } from "@/components/staff-hours-editor";
import { StaffServicesEditor } from "@/components/staff-services-editor";
import { TimeOffEditor } from "@/components/time-off-editor";
import { compressImage, signedUrl } from "@/lib/image";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
});

type Staff = { id: string; name: string; email: string | null; phone: string | null; role: string | null; bio: string | null; photo_url: string | null; bookable: boolean; active: boolean };

const AVATAR_TINTS = [
  "bg-rose-100 text-rose-900",
  "bg-amber-100 text-amber-900",
  "bg-emerald-100 text-emerald-900",
  "bg-sky-100 text-sky-900",
  "bg-violet-100 text-violet-900",
];

function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" /> Disabled
    </span>
  );
}

function VisibilityPill({ active, bookable }: { active: boolean; bookable: boolean }) {
  const visible = active && bookable;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${visible ? "bg-emerald-50 text-emerald-800" : "bg-[color:var(--cream)] text-muted-foreground"}`}>
      {visible ? "Shown" : "Hidden"}
    </span>
  );
}

function StaffPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Staff> | null>(null);
  const [editTab, setEditTab] = useState("profile");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "disabled">("all");
  const [role, setRole] = useState("all");

  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("*").eq("business_id", bid!).order("name");
      if (error) throw error;
      return data as Staff[];
    },
  });

  const { data: serviceLinks } = useQuery({
    queryKey: ["staff-service-counts", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data, error } = await supabase.from("service_staff").select("staff_id").eq("business_id", bid!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [reassign, setReassign] = useState<{ staff: Staff; futureCount: number; disableAfter?: boolean } | null>(null);

  // Free plan is limited to one staff member (see plan-settings.tsx +
  // the enforce_staff_plan_limit DB trigger, which is the real backstop —
  // this is just so the owner sees why "Add staff" is disabled instead of
  // hitting a raw error from the trigger).
  const atFreeLimit = (biz?.plan ?? "free") === "free" && (staff?.length ?? 0) >= 1;

  const serviceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of serviceLinks ?? []) counts.set(link.staff_id, (counts.get(link.staff_id) ?? 0) + 1);
    return counts;
  }, [serviceLinks]);

  const roles = useMemo(
    () => Array.from(new Set((staff ?? []).map((member) => member.role || "Team member"))).sort(),
    [staff],
  );

  const visibleStaff = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (staff ?? []).filter((member) => {
      if (status === "active" && !member.active) return false;
      if (status === "disabled" && member.active) return false;
      if (role !== "all" && (member.role || "Team member") !== role) return false;
      if (!term) return true;
      return [member.name, member.role, member.email].some((value) => value?.toLowerCase().includes(term));
    });
  }, [role, search, staff, status]);

  const openEditor = (member: Partial<Staff>) => {
    setEdit(member);
    setEditTab("profile");
  };

  const del = async (s: Staff) => {
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", s.id)
      .gte("starts_at", new Date().toISOString())
      .neq("status", "cancelled");
    if ((count ?? 0) > 0) {
      // Show reassign flow instead of failing
      setReassign({ staff: s, futureCount: count ?? 0, disableAfter: true });
      return;
    }
    const { error } = await supabase.from("staff").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Staff removed");
    qc.invalidateQueries({ queryKey: ["staff"] });
  };


  const toggleActive = async (s: Staff, v: boolean) => {
    // Free plan: re-enabling a disabled staff member is the same "more than
    // one staff member" case the Add-staff button already blocks above, but
    // this path (toggling an existing row) isn't covered by the INSERT-only
    // DB trigger, so it needs its own client-side check. The trigger added in
    // 20260808120000_fix_staff_plan_limit_on_reactivate.sql is the real
    // backstop; this is just so the owner sees a clear message instead of a
    // raw Postgres error.
    if (v && (biz?.plan ?? "free") === "free") {
      const activeOthers = (staff ?? []).filter((x) => x.id !== s.id && x.active).length;
      if (activeOthers >= 1) {
        toast.error("The free plan is limited to one staff member. Upgrade to Studio to enable more.");
        return;
      }
    }
    const { error } = await supabase.from("staff").update({ active: v }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success(v ? "Staff enabled" : "Staff disabled");
    qc.invalidateQueries({ queryKey: ["staff"] });
  };

  return (
    <div className="min-w-0 max-w-full overflow-hidden p-5 sm:p-8 xl:p-10" data-premium-page="staff">
      <div className={edit ? "min-[1400px]:grid min-[1400px]:grid-cols-[minmax(620px,1fr)_430px] min-[1400px]:gap-6" : ""}>
        <main className="min-w-0">
          <PageHeader
            eyebrow="Team"
            title="Staff"
            subtitle="The people who take bookings. Customers can choose between them on your booking page."
            action={
              <Button
                onClick={() => openEditor({ bookable: true, active: true })}
                className="shadow-glow"
                disabled={atFreeLimit}
                title={atFreeLimit ? "Free plan is limited to one staff member" : undefined}
              >
                <Plus className="h-4 w-4 mr-1" /> Add staff
              </Button>
            }
          />

          {atFreeLimit && (
            <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Crown className="h-4 w-4 text-[color:var(--gold-deep)]" />
                The free plan is limited to one staff member.
              </div>
              <Link to="/settings" search={{ tab: "plan" } as any} className="text-sm font-medium text-primary hover:underline">
                Upgrade to Studio
              </Link>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : staff?.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No team members yet"
              description="Add yourself or a colleague to start taking bookings."
              action={<Button onClick={() => openEditor({ bookable: true, active: true })}><Plus className="h-4 w-4 mr-1" /> Add first member</Button>}
            />
          ) : (
            <section className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_170px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff..." className="h-11 pl-10" />
                </div>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Filter staff by role"
                >
                  <option value="all">All roles</option>
                  {roles.map((staffRole) => <option key={staffRole} value={staffRole}>{staffRole}</option>)}
                </select>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Filter staff by status"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <div className="overflow-hidden rounded-2xl border bg-card">
                <div className="hidden min-h-11 items-center gap-3 border-b bg-secondary/25 px-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:grid md:grid-cols-[minmax(180px,1.35fr)_minmax(105px,.8fr)_92px_120px_68px_36px]">
                  <span>Name</span><span>Role</span><span>Status</span><span>Booking page</span><span>Services</span><span />
                </div>
                <div className="divide-y">
                  {visibleStaff.map((s, i) => (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEditor(s)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openEditor(s); }}
                      className={`grid min-h-[72px] cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-secondary/25 focus-visible:bg-secondary/40 md:grid-cols-[minmax(180px,1.35fr)_minmax(105px,.8fr)_92px_120px_68px_36px] ${edit?.id === s.id ? "bg-[color:var(--cream)]" : ""}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <StaffAvatar staff={s} tint={AVATAR_TINTS[i % AVATAR_TINTS.length]} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{s.name}</div>
                          <div className="truncate text-xs text-muted-foreground md:hidden">{s.role || "Team member"}</div>
                        </div>
                      </div>
                      <div className="hidden truncate text-sm text-muted-foreground md:block">{s.role || "Team member"}</div>
                      <div className="hidden md:block"><StatusPill active={s.active} /></div>
                      <div className="hidden md:block"><VisibilityPill active={s.active} bookable={s.bookable} /></div>
                      <div className="hidden text-sm tabular-nums text-muted-foreground md:block">{serviceCounts.get(s.id) ?? 0}</div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button onClick={(e) => e.stopPropagation()} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary" aria-label={`Actions for ${s.name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openEditor(s)}><Pencil className="mr-2 h-4 w-4" /> Edit details</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => toggleActive(s, !s.active)}>{s.active ? "Disable staff" : "Enable staff"}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              </div>
              {visibleStaff.length === 0 && <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No staff match that search.</div>}
              <p className="text-xs text-muted-foreground">Showing {visibleStaff.length} of {staff?.length ?? 0} staff</p>
            </section>
          )}
        </main>

        {edit && (
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[430px] overflow-y-auto border-l bg-background shadow-[0_18px_55px_rgba(35,31,26,0.14)] min-[1400px]:sticky min-[1400px]:top-6 min-[1400px]:z-auto min-[1400px]:h-fit min-[1400px]:max-h-[calc(100vh-3rem)] min-[1400px]:overflow-y-auto min-[1400px]:rounded-2xl min-[1400px]:border" aria-label={edit.id ? `Edit ${edit.name}` : "Add staff"}>
            <div className="flex items-start justify-between gap-4 border-b px-5 py-5">
              <div>
                <p className="font-display text-xl">{edit.id ? "Edit staff" : "Add staff"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{edit.id ? "Manage their profile and booking settings." : "Create a profile for your new team member."}</p>
              </div>
              <button onClick={() => setEdit(null)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close staff editor"><X className="h-4 w-4" /></button>
            </div>

            {edit.id && (
              <div className="flex items-center gap-3 border-b px-5 py-4">
                <StaffAvatar staff={edit as Staff} tint={AVATAR_TINTS[(staff?.findIndex((s) => s.id === edit.id) ?? 0) % AVATAR_TINTS.length]} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-lg">{edit.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{edit.role || "Team member"}</div>
                </div>
                <StatusPill active={edit.active ?? true} />
              </div>
            )}

            {edit.id ? (
              <Tabs value={editTab} onValueChange={setEditTab}>
                <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b bg-transparent px-4 py-0">
                  <TabsTrigger value="profile" className="rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-[color:var(--gold-deep)] data-[state=active]:bg-transparent data-[state=active]:shadow-none">Profile</TabsTrigger>
                  <TabsTrigger value="hours" className="rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-[color:var(--gold-deep)] data-[state=active]:bg-transparent data-[state=active]:shadow-none">Hours</TabsTrigger>
                  <TabsTrigger value="services" className="rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-[color:var(--gold-deep)] data-[state=active]:bg-transparent data-[state=active]:shadow-none">Services</TabsTrigger>
                  <TabsTrigger value="timeoff" className="rounded-none border-b-2 border-transparent px-3 py-3 data-[state=active]:border-[color:var(--gold-deep)] data-[state=active]:bg-transparent data-[state=active]:shadow-none">Time off</TabsTrigger>
                </TabsList>
                <TabsContent value="profile" className="m-0 p-5"><StaffProfileForm edit={edit} setEdit={setEdit} businessId={bid} onSaved={() => { qc.invalidateQueries({ queryKey: ["staff"] }); qc.invalidateQueries({ queryKey: ["staff-service-counts"] }); }} footerContent={<ReassignBookingsCard staff={edit as Staff} onOpen={(futureCount) => setReassign({ staff: edit as Staff, futureCount })} />} /></TabsContent>
                <TabsContent value="hours" className="m-0 p-5">{bid && <StaffHoursEditor staffId={edit.id} businessId={bid} />}</TabsContent>
                <TabsContent value="services" className="m-0 p-5">{bid && <StaffServicesEditor staffId={edit.id} businessId={bid} />}</TabsContent>
                <TabsContent value="timeoff" className="m-0 p-5">{bid && <TimeOffEditor businessId={bid} staffId={edit.id} />}</TabsContent>
              </Tabs>
            ) : (
              <div className="p-5"><StaffProfileForm edit={edit} setEdit={setEdit} businessId={bid} onSaved={() => { qc.invalidateQueries({ queryKey: ["staff"] }); setEdit(null); }} /></div>
            )}

            {edit.id && (
              <div className="border-t px-5 py-4">
                <ConfirmDialog
                  trigger={<button className="inline-flex items-center gap-2 text-xs font-medium text-destructive hover:underline"><Trash2 className="h-3.5 w-3.5" /> Delete staff</button>}
                  title="Remove this team member?"
                  description="If they have future bookings, you can reassign them before the account is disabled."
                  confirmLabel="Remove"
                  onConfirm={async () => { await del(edit as Staff); setEdit(null); }}
                />
              </div>
            )}
          </aside>
        )}
      </div>

      <ReassignDialog
        info={reassign}
        allStaff={staff ?? []}
        onClose={() => setReassign(null)}
        onDone={() => { setReassign(null); qc.invalidateQueries({ queryKey: ["staff"] }); qc.invalidateQueries({ queryKey: ["staff-future-bookings-count"] }); qc.invalidateQueries({ queryKey: ["calendar"] }); }}
      />
    </div>
  );
}

function ReassignDialog({ info, allStaff, onClose, onDone }: {
  info: { staff: Staff; futureCount: number; disableAfter?: boolean } | null;
  allStaff: Staff[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTarget(""); }, [info?.staff?.id]);

  const candidates = allStaff.filter((s) => s.id !== info?.staff?.id && s.active);

  const submit = async (alsoDelete: boolean) => {
    if (!info) return;
    setBusy(true);
    try {
      if (target) {
        const { error } = await supabase.rpc("reassign_staff_bookings", {
          _from_staff: info.staff.id, _to_staff: target, _only_future: true,
        });
        if (error) throw error;
      }
      if (alsoDelete) {
        // Disable rather than hard-delete — preserves historic booking joins.
        const { error } = await supabase.from("staff").update({ active: false, bookable: false }).eq("id", info.staff.id);
        if (error) throw error;
        toast.success(target ? "Bookings reassigned · staff disabled" : "Staff disabled");
      } else {
        toast.success(`Reassigned ${info.futureCount} booking${info.futureCount === 1 ? "" : "s"}`);
      }
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Could not reassign");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!info} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Reassign upcoming bookings</DialogTitle>
          <DialogDescription>
            {info?.staff?.name} has <b>{info?.futureCount}</b> upcoming booking{info?.futureCount === 1 ? "" : "s"}.
            {info?.disableAfter
              ? " Pick a teammate to take them over, then disable the account to preserve history."
              : " Pick the teammate who should take them over."}
          </DialogDescription>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other active staff to reassign to. Add a new team member first, or disable this one without reassigning.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {candidates.map((s) => (
              <button
                key={s.id}
                onClick={() => setTarget(s.id)}
                className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-3 transition-colors ${
                  target === s.id ? "bg-secondary border-foreground/40" : "bg-card hover:bg-secondary/40"
                }`}
              >
                <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-xs font-medium">
                  {s.name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.name}</div>
                  {s.role && <div className="text-[11px] text-muted-foreground truncate">{s.role}</div>}
                </div>
                {target === s.id && <Badge>Selected</Badge>}
              </button>
            ))}
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          {info?.disableAfter ? (
            <>
              <Button variant="outline" onClick={() => submit(false)} disabled={busy || !target}>Reassign only</Button>
              <Button onClick={() => submit(true)} disabled={busy || (!target && candidates.length > 0)}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {target ? "Reassign & disable" : "Just disable"}
              </Button>
            </>
          ) : (
            <Button onClick={() => submit(false)} disabled={busy || !target}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reassign bookings
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassignBookingsCard({ staff, onOpen }: { staff: Staff; onOpen: (futureCount: number) => void }) {
  const { data: futureCount = 0, isLoading } = useQuery({
    queryKey: ["staff-future-bookings-count", staff.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("staff_id", staff.id)
        .gte("starts_at", new Date().toISOString())
        .neq("status", "cancelled");
      if (error) throw error;
      return count ?? 0;
    },
  });

  return (
    <div className="rounded-xl border bg-secondary/25 p-3.5">
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background"><Users className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Reassign bookings</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Transfer this person's future bookings to another staff member without disabling them.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-2 h-8" disabled={isLoading || futureCount === 0} onClick={() => onOpen(futureCount)}>
            {isLoading ? "Checking bookings…" : futureCount > 0 ? `Reassign ${futureCount} booking${futureCount === 1 ? "" : "s"}` : "No upcoming bookings"}
          </Button>
        </div>
      </div>
    </div>
  );
}


function StaffAvatar({ staff, tint, size = "md" }: { staff: Staff; tint: string; size?: "sm" | "md" }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!staff.photo_url) return setUrl(null);
    signedUrl(staff.photo_url).then(setUrl).catch(() => setUrl(null));
  }, [staff.photo_url]);
  const sizing = size === "sm" ? "h-10 w-10" : "h-12 w-12";
  if (url) return <img src={url} alt={staff.name} className={`${sizing} shrink-0 rounded-full object-cover`} />;
  return (
    <div className={`${sizing} shrink-0 rounded-full ${tint} grid place-items-center font-display text-lg`}>
      {staff.name.charAt(0).toUpperCase()}
    </div>
  );
}

function StaffProfileForm({ edit, setEdit, businessId, onSaved, footerContent }: {
  edit: Partial<Staff> | null;
  setEdit: (e: Partial<Staff> | null) => void;
  businessId: string | undefined;
  onSaved: () => void;
  footerContent?: ReactNode;
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
        <label className={`inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs ${edit?.id ? "cursor-pointer hover:bg-secondary/40" : "cursor-not-allowed opacity-55"}`}>
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {photoPreview ? "Change photo" : "Upload photo"}
          <input type="file" accept="image/*" className="hidden" onChange={onPhoto} disabled={uploading || !edit?.id} />
        </label>
        {!edit?.id && <span className="text-[11px] text-muted-foreground">Save first to add a photo.</span>}
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
      {footerContent}
      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {edit?.id ? "Save changes" : "Add staff"}
        </Button>
      </div>
    </div>
  );
}
