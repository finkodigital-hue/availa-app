import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  FileSignature,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  GripVertical,
  UserRoundPlus,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { SignaturePad } from "@/components/signature-pad";
import { toast } from "sonner";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import {
  deleteConsultationTemplate,
  getConsultationWorkspace,
  recordPatchTestOutcome,
  saveConsultationTemplate,
  signConsultationSubmission,
  startConsultationSubmission,
  withdrawConsultationConsent,
  type ConsultationQuestion,
  type ConsultationTemplateInput,
} from "@/lib/consultations.functions";

export const Route = createFileRoute("/_authenticated/consultations")({
  component: ConsultationsPage,
});

const DEFAULT_CONSENT =
  "I explicitly consent to this salon securely processing the health, allergy and patch-test information in this form for the purpose of assessing whether my requested salon services can be provided safely. I understand that I can withdraw this consent at any time by contacting the salon.";

const STARTER_QUESTIONS: Record<"consultation" | "patch_test", ConsultationQuestion[]> = {
  consultation: [
    { id: "allergies", label: "Do you have any allergies or known sensitivities relevant to this service?", type: "yes_no", required: true },
    { id: "allergy_details", label: "If yes, please provide details", type: "long_text", required: false },
    { id: "previous_reaction", label: "Have you previously reacted to a hair or beauty product?", type: "yes_no", required: true },
    { id: "anything_else", label: "Is there anything else the salon should know to provide this service safely?", type: "long_text", required: false },
  ],
  patch_test: [
    { id: "previous_reaction", label: "Have you previously reacted to hair colour, tint, adhesive or another salon product?", type: "yes_no", required: true },
    { id: "reaction_details", label: "If yes, please provide details", type: "long_text", required: false },
    { id: "skin_condition", label: "Do you currently have irritation, broken skin or a skin condition near the test area?", type: "yes_no", required: true },
  ],
};

type Editor = ConsultationTemplateInput;

function newEditor(kind: "consultation" | "patch_test" = "consultation"): Editor {
  return {
    name: kind === "patch_test" ? "Patch test consent" : "New client consultation",
    description:
      kind === "patch_test"
        ? "Complete before a colour, tint or adhesive service."
        : "A short safety consultation for salon clients.",
    kind,
    questions: STARTER_QUESTIONS[kind].map((question) => ({ ...question })),
    consentText: DEFAULT_CONSENT,
    validityDays: kind === "patch_test" ? 180 : 365,
    active: true,
    serviceIds: [],
  };
}

function relationOne(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function ConsultationsPage() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [startingForm, setStartingForm] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["consultation-workspace"],
    queryFn: async () => {
      const headers = await getServerFnAuthHeaders();
      return getConsultationWorkspace({ headers });
    },
  });

  const templates = query.data?.templates ?? [];
  const services = query.data?.services ?? [];
  const records = query.data?.submissions ?? [];
  const pendingCount = records.filter((record: any) => record.status === "pending").length;
  const currentCount = records.filter((record: any) => record.status === "signed" && (!record.expires_at || new Date(record.expires_at) > new Date())).length;

  if (query.isError) {
    return (
      <div className="page-wrap max-w-7xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
        <PageHeader eyebrow="Client safety" title="Consultations" subtitle="Replace paper consultation and patch-test files with secure, signed online records." />
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-6 dark:bg-amber-950/20">
          <div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" /><div><h2 className="font-semibold">Database update required</h2><p className="text-sm text-muted-foreground mt-1">Apply the consultation-forms migration before this page can load salon forms and client records.</p></div></div>
        </div>
      </div>
    );
  }

  const openTemplate = (template: any) => {
    setEditor({
      id: template.id,
      name: template.name,
      description: template.description ?? "",
      kind: template.kind,
      questions: Array.isArray(template.questions) ? template.questions : [],
      consentText: template.consent_text,
      validityDays: template.validity_days,
      active: template.active,
      serviceIds: (template.consultation_template_services ?? []).map((link: any) => link.service_id),
    });
  };

  const save = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      const headers = await getServerFnAuthHeaders();
      await saveConsultationTemplate({ data: editor, headers });
      toast.success(editor.id ? "Consultation form updated" : "Consultation form created");
      setEditor(null);
      await query.refetch();
    } catch (error: any) {
      toast.error(error.message ?? "The consultation form could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (template: any) => {
    try {
      const headers = await getServerFnAuthHeaders();
      await deleteConsultationTemplate({ data: { id: template.id }, headers });
      toast.success("Form deleted · signed records were preserved");
      await query.refetch();
    } catch (error: any) {
      toast.error(error.message ?? "The form could not be deleted");
    }
  };

  const startSigning = async (details: { templateId: string; customerName: string; customerEmail: string; customerPhone: string }) => {
    setSaving(true);
    try {
      const headers = await getServerFnAuthHeaders();
      const started = await startConsultationSubmission({ data: details, headers });
      const refreshed = await query.refetch();
      const record = refreshed.data?.submissions.find((item: any) => item.id === started.id);
      if (!record) throw new Error("The new client form could not be opened. Refresh and try again.");
      setStartingForm(false);
      setSelectedRecord(record);
      toast.success("Client form ready to sign");
    } catch (error: any) {
      toast.error(error.message ?? "The client form could not be started");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-wrap max-w-7xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="Client safety"
        title="Consultations"
        subtitle="Enter the client’s details, hand them this device to sign, and keep the completed record securely."
        action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEditor(newEditor())}><Plus className="h-4 w-4" />New form</Button><Button onClick={() => setStartingForm(true)} disabled={!templates.some((template: any) => template.active)}><UserRoundPlus className="h-4 w-4" />Get customer signature</Button></div>}
      />

      <button type="button" onClick={() => setStartingForm(true)} disabled={!templates.some((template: any) => template.active)} className="mb-7 w-full rounded-2xl border bg-card p-5 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60">
        <div className="flex items-center gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><FileSignature className="h-6 w-6" /></div><div className="min-w-0 flex-1"><div className="font-semibold">Start a form for a customer</div><p className="mt-1 text-sm text-muted-foreground">Add their name and contact details, then let them complete and sign it here in the salon.</p></div><ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" /></div>
      </button>

      <div className="grid gap-3 sm:grid-cols-3 mb-7">
        <SummaryCard icon={FileSignature} label="Form templates" value={templates.length} />
        <SummaryCard icon={Clock3} label="Waiting for client" value={pendingCount} tone="amber" />
        <SummaryCard icon={CheckCircle2} label="Current signed records" value={currentCount} tone="green" />
      </div>

      <div className="rounded-xl border border-amber-300/50 bg-amber-50/70 px-4 py-3 text-sm text-amber-950 mb-7 flex gap-3 dark:bg-amber-950/20 dark:text-amber-100">
        <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">Built for UK data-protection safeguards</div>
          <p className="mt-0.5 opacity-80">Only collect information genuinely needed for the service. Have your final form wording, privacy notice and retention policy reviewed by a qualified UK professional before launch.</p>
        </div>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Form templates</TabsTrigger>
          <TabsTrigger value="records">Client records {records.length > 0 && <Badge variant="secondary" className="ml-2">{records.length}</Badge>}</TabsTrigger>
        </TabsList>
        <TabsContent value="templates" className="mt-5">
          {query.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-48 rounded-2xl" />)}</div>
          ) : templates.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="Create your first consultation" description="Start with a salon consultation or patch-test form, then choose which services require it." action={<Button onClick={() => setEditor(newEditor())}><Plus className="h-4 w-4 mr-1" />Create form</Button>} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {templates.map((template: any) => (
                <div key={template.id} className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{template.kind === "patch_test" ? "Patch test" : "Consultation"}</Badge>
                        {!template.active && <Badge variant="secondary">Paused</Badge>}
                      </div>
                      <h2 className="font-display text-xl mt-3">{template.name}</h2>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{template.description || "No description"}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openTemplate(template)} aria-label={`Edit ${template.name}`}><Pencil className="h-4 w-4" /></Button>
                      <ConfirmDialog
                        trigger={<Button variant="ghost" size="icon" aria-label={`Delete ${template.name}`}><Trash2 className="h-4 w-4" /></Button>}
                        title="Delete this form?"
                        description="The template will be removed, but every previously signed snapshot stays preserved."
                        confirmLabel="Delete form"
                        onConfirm={() => remove(template)}
                      />
                    </div>
                  </div>
                  <div className="mt-5 pt-4 border-t flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                    <span>{template.questions?.length ?? 0} questions</span>
                    <span>{template.consultation_template_services?.length ?? 0} services</span>
                    <span>Valid {template.validity_days} days</span>
                    <span>Version {template.version}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="records" className="mt-5">
          <RecordsTable records={records} onOpen={setSelectedRecord} loading={query.isLoading} />
        </TabsContent>
      </Tabs>

      <TemplateEditor editor={editor} services={services} saving={saving} onChange={setEditor} onSave={save} onClose={() => setEditor(null)} />
      <StartSigningDialog open={startingForm} templates={templates} saving={saving} onStart={startSigning} onClose={() => setStartingForm(false)} />
      <RecordDialog record={selectedRecord} onClose={() => setSelectedRecord(null)} onSaved={async () => { const refreshed = await query.refetch(); setSelectedRecord(refreshed.data?.submissions.find((record: any) => record.id === selectedRecord?.id) ?? null); }} />
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone?: "amber" | "green" }) {
  const color = tone === "green" ? "bg-emerald-100 text-emerald-700" : tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-secondary text-foreground";
  return <div className="rounded-xl border bg-card px-4 py-4 flex items-center gap-3"><div className={`h-10 w-10 rounded-xl grid place-items-center ${color}`}><Icon className="h-5 w-5" /></div><div><div className="text-2xl font-semibold leading-none">{value}</div><div className="text-xs text-muted-foreground mt-1">{label}</div></div></div>;
}

function StartSigningDialog({ open, templates, saving, onStart, onClose }: { open: boolean; templates: any[]; saving: boolean; onStart: (details: { templateId: string; customerName: string; customerEmail: string; customerPhone: string }) => Promise<void>; onClose: () => void }) {
  const activeTemplates = useMemo(() => templates.filter((template) => template.active), [templates]);
  const [templateId, setTemplateId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  useEffect(() => {
    if (!open) return;
    setTemplateId(activeTemplates[0]?.id ?? "");
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
  }, [open, activeTemplates]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-display text-2xl">Get customer signature</DialogTitle><DialogDescription>Enter the customer’s details, then hand them this device to complete and sign the form.</DialogDescription></DialogHeader>
        <div className="space-y-4 py-2">
          <div><Label>Form</Label><Select value={templateId} onValueChange={setTemplateId}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose a form" /></SelectTrigger><SelectContent>{activeTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Customer’s full name</Label><Input className="mt-1.5" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Full name" autoComplete="name" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Phone <span className="font-normal text-muted-foreground">(optional)</span></Label><Input className="mt-1.5" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Phone number" autoComplete="tel" /></div>
            <div><Label>Email <span className="font-normal text-muted-foreground">(optional)</span></Label><Input className="mt-1.5" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="Email address" autoComplete="email" /></div>
          </div>
          <div className="rounded-xl bg-secondary/40 px-4 py-3 text-sm text-muted-foreground"><ShieldCheck className="mr-2 inline h-4 w-4" />Nothing is signed until the customer reviews the form and draws their own signature.</div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => onStart({ templateId, customerName, customerEmail, customerPhone })} disabled={saving || !templateId || !customerName.trim()}>{saving ? "Preparing…" : "Continue to signature"}<ChevronRight className="h-4 w-4" /></Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateEditor({ editor, services, saving, onChange, onSave, onClose }: { editor: Editor | null; services: any[]; saving: boolean; onChange: (value: Editor | null) => void; onSave: () => void; onClose: () => void }) {
  const groupedServices = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const service of services) {
      const category = service.category?.trim() || "Other services";
      groups.set(category, [...(groups.get(category) ?? []), service]);
    }
    return Array.from(groups.entries());
  }, [services]);
  if (!editor) return null;
  const update = (patch: Partial<Editor>) => onChange({ ...editor, ...patch });
  const updateQuestion = (index: number, patch: Partial<ConsultationQuestion>) => update({ questions: editor.questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question) });
  const addQuestion = () => update({ questions: [...editor.questions, { id: `q_${crypto.randomUUID().replaceAll("-", "")}`, label: "", type: "yes_no", required: true }] });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{editor.id ? "Edit consultation form" : "Create consultation form"}</DialogTitle>
          <DialogDescription>The signed version is frozen for the client. Future edits create a new version without changing old records.</DialogDescription>
        </DialogHeader>
        <div className="space-y-7 py-2">
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Form name</Label><Input className="mt-1.5" value={editor.name} onChange={(event) => update({ name: event.target.value })} placeholder="New client consultation" /></div>
            <div className="sm:col-span-2"><Label>Short introduction</Label><Textarea className="mt-1.5" value={editor.description ?? ""} onChange={(event) => update({ description: event.target.value })} /></div>
            <div><Label>Form type</Label><Select value={editor.kind} onValueChange={(kind: "consultation" | "patch_test") => update({ kind })}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="consultation">Salon consultation</SelectItem><SelectItem value="patch_test">Patch test</SelectItem></SelectContent></Select></div>
            <div><Label>Valid for</Label><div className="mt-1.5 flex items-center gap-2"><Input type="number" min={1} max={3650} value={editor.validityDays} onChange={(event) => update({ validityDays: Number(event.target.value) })} /><span className="text-sm text-muted-foreground">days</span></div></div>
          </section>

          <section>
            <div className="flex items-center justify-between"><div><h3 className="font-semibold">Questions</h3><p className="text-xs text-muted-foreground mt-0.5">Only ask for information needed to provide the selected services safely.</p></div><Button variant="outline" size="sm" onClick={addQuestion}><Plus className="h-4 w-4" />Question</Button></div>
            <div className="mt-3 space-y-3">
              {editor.questions.map((question, index) => (
                <div key={question.id} className="rounded-xl border bg-secondary/20 p-3">
                    <div className="flex items-start gap-2"><GripVertical className="h-4 w-4 mt-3 text-muted-foreground shrink-0" /><div className="grid gap-3 sm:grid-cols-[1fr_150px] flex-1"><Input value={question.label} onChange={(event) => updateQuestion(index, { label: event.target.value })} placeholder="Question" /><Select value={question.type} onValueChange={(type: any) => updateQuestion(index, { type, options: type === "select" ? ["Option 1"] : undefined })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes_no">Yes or no</SelectItem><SelectItem value="text">Short answer</SelectItem><SelectItem value="long_text">Long answer</SelectItem><SelectItem value="date">Date</SelectItem><SelectItem value="select">Choose option</SelectItem></SelectContent></Select></div><Button variant="ghost" size="icon" aria-label={`Remove question ${index + 1}`} onClick={() => update({ questions: editor.questions.filter((_, questionIndex) => questionIndex !== index) })}><X className="h-4 w-4" /></Button></div>
                  {question.type === "select" && <Input className="mt-3 ml-6 w-[calc(100%-1.5rem)]" value={(question.options ?? []).join(", ")} onChange={(event) => updateQuestion(index, { options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Options separated by commas" />}
                  <label className="mt-3 ml-6 flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={question.required} onCheckedChange={(checked) => updateQuestion(index, { required: checked === true })} />Required</label>
                </div>
              ))}
            </div>
          </section>

          <section><h3 className="font-semibold">Explicit health-data consent</h3><p className="text-xs text-muted-foreground mt-0.5 mb-2">Keep this separate from marketing permission. The client must actively agree before signing.</p><Textarea rows={5} value={editor.consentText} onChange={(event) => update({ consentText: event.target.value })} /></section>

          <section><h3 className="font-semibold">Services requiring this form</h3><div className="mt-3 rounded-xl border divide-y max-h-56 overflow-y-auto">{groupedServices.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Add services first, then return to assign this form.</p> : groupedServices.map(([category, rows]) => <div key={category} className="p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{category}</div><div className="grid gap-2 sm:grid-cols-2">{rows.map((service) => <label key={service.id} className="flex items-center gap-2 text-sm"><Checkbox checked={editor.serviceIds.includes(service.id)} onCheckedChange={(checked) => update({ serviceIds: checked ? [...editor.serviceIds, service.id] : editor.serviceIds.filter((id) => id !== service.id) })} />{service.name}</label>)}</div></div>)}</div></section>

          <label className="rounded-xl border p-4 flex items-center justify-between gap-4"><div><div className="font-medium">Form active</div><p className="text-xs text-muted-foreground">Paused forms are not requested for new bookings.</p></div><Switch checked={editor.active} onCheckedChange={(active) => update({ active })} /></label>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save form"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordsTable({ records, onOpen, loading }: { records: any[]; onOpen: (record: any) => void; loading: boolean }) {
  if (loading) return <Skeleton className="h-72 rounded-2xl" />;
  if (!records.length) return <EmptyState icon={FileSignature} title="No client forms yet" description="Use Get customer signature to enter their details and open a form for them to sign in the salon." />;
  return <div className="rounded-2xl border bg-card overflow-hidden"><div className="hidden sm:grid grid-cols-[1.3fr_1fr_1fr_150px_30px] gap-4 px-5 py-3 border-b text-[10px] uppercase tracking-wider text-muted-foreground"><span>Client</span><span>Form</span><span>Appointment</span><span>Status</span><span /></div>{records.map((record) => { const customer = relationOne(record.customers); const booking = relationOne(record.bookings); const template = relationOne(record.consultation_templates); const name = template?.name ?? record.template_snapshot?.name ?? "Deleted form"; return <button key={record.id} onClick={() => onOpen(record)} className="w-full text-left grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr_150px_30px] sm:items-center px-5 py-4 border-b last:border-0 hover:bg-secondary/30"><div><div className="font-medium">{customer?.name ?? "Customer"}</div><div className="text-xs text-muted-foreground">{customer?.email ?? "No email"}</div></div><div className="text-sm">{name}</div><div className="text-sm text-muted-foreground">{booking?.starts_at ? new Date(booking.starts_at).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "—"}</div><StatusBadge status={record.status} /><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>; })}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = { pending: { label: "Waiting", className: "bg-amber-100 text-amber-800" }, signed: { label: "Signed", className: "bg-emerald-100 text-emerald-800" }, expired: { label: "Expired", className: "bg-orange-100 text-orange-800" }, withdrawn: { label: "Withdrawn", className: "bg-red-100 text-red-800" } };
  const item = config[status] ?? { label: status, className: "bg-secondary" };
  return <Badge className={`border-0 w-fit ${item.className}`}>{item.label}</Badge>;
}

function RecordDialog({ record, onClose, onSaved }: { record: any | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [outcome, setOutcome] = useState("passed");
  const [testedAt, setTestedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [testedBy, setTestedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [signerName, setSignerName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setOutcome(record?.patch_test_outcome ?? "passed");
    setTestedAt(record?.patch_tested_at ? new Date(record.patch_tested_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setTestedBy(record?.patch_tested_by ?? "");
    setNotes(record?.staff_notes ?? "");
    setAnswers(record?.answers ?? {});
    setSignerName(record?.signer_name ?? relationOne(record?.customers)?.name ?? "");
    setSignatureData(null);
    setConsented(false);
  }, [record?.id, record?.status, record?.answers, record?.signer_name, record?.patch_test_outcome, record?.patch_tested_at, record?.patch_tested_by, record?.staff_notes, record?.customers]);
  if (!record) return null;
  const snapshot = record.template_snapshot;
  const template = relationOne(record.consultation_templates);
  const content = snapshot ?? template;
  const questions = (content?.questions ?? []) as ConsultationQuestion[];
  const formName = snapshot?.name ?? template?.name ?? "Consultation form";
  const isPatchTest = (snapshot?.kind ?? template?.kind) === "patch_test";
  const customer = relationOne(record.customers);
  const pending = record.status === "pending";
  const patchTestReady = !isPatchTest || Boolean(record.patch_test_outcome && record.patch_tested_at && record.patch_tested_by);
  const requiredComplete = questions.every((question) => !question.required || answers[question.id] === true || answers[question.id] === false || String(answers[question.id] ?? "").trim());

  const saveOutcome = async () => {
    setSaving(true);
    try {
      const headers = await getServerFnAuthHeaders();
      await recordPatchTestOutcome({ data: { id: record.id, outcome: outcome as "passed" | "failed" | "retest_required", testedAt, testedBy, notes }, headers });
      toast.success("Patch-test details saved · the client can now review and sign");
      await onSaved();
    } catch (error: any) {
      toast.error(error.message ?? "Could not save the patch-test details");
    } finally {
      setSaving(false);
    }
  };

  const sign = async () => {
    setSaving(true);
    try {
      const headers = await getServerFnAuthHeaders();
      await signConsultationSubmission({ data: { id: record.id, answers, signerName, signatureData: signatureData ?? "", explicitHealthConsent: consented }, headers });
      toast.success("Signed salon record saved securely");
      await onSaved();
    } catch (error: any) {
      toast.error(error.message ?? "The signed record could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    const headers = await getServerFnAuthHeaders();
    await withdrawConsultationConsent({ data: { id: record.id, reason: "Withdrawn at the client’s request in the salon" }, headers });
    toast.success("Consent marked as withdrawn");
    await onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2"><StatusBadge status={record.status} />{record.evidence_hash && <span className="text-[10px] text-muted-foreground">Verified record</span>}</div>
          <DialogTitle className="font-display text-2xl mt-2">{formName}</DialogTitle>
          <DialogDescription>{customer?.name} · {record.signed_at ? `Signed ${new Date(record.signed_at).toLocaleString()}` : "Complete with the client in the salon"}</DialogDescription>
        </DialogHeader>

        {isPatchTest && pending && (
          <section className="space-y-4 rounded-2xl border p-4">
            <div><h3 className="font-semibold">1. Record the completed skin test</h3><p className="text-xs text-muted-foreground mt-1">Staff complete this section before handing the device to the client.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Result</Label><Select value={outcome} onValueChange={setOutcome}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="passed">Passed</SelectItem><SelectItem value="failed">Reaction — failed</SelectItem><SelectItem value="retest_required">Retest required</SelectItem></SelectContent></Select></div>
              <div><Label>Test date</Label><Input className="mt-1.5" type="date" value={testedAt} onChange={(event) => setTestedAt(event.target.value)} /></div>
              <div className="sm:col-span-2"><Label>Test completed by</Label><Input className="mt-1.5" value={testedBy} onChange={(event) => setTestedBy(event.target.value)} placeholder="Staff member’s name" /></div>
              <div className="sm:col-span-2"><Label>Private staff notes</Label><Textarea className="mt-1.5" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
            </div>
            <Button variant="outline" onClick={saveOutcome} disabled={saving || !testedBy.trim()}>{saving ? "Saving…" : record.patch_test_outcome ? "Update test details" : "Save test details"}</Button>
          </section>
        )}

        {pending ? (
          <section className={`space-y-5 ${isPatchTest ? "border-t pt-5" : ""}`}>
            <div><h3 className="font-semibold">Customer form</h3><p className="text-xs text-muted-foreground mt-1">The customer answers the questions, reviews the consent wording and signs below on this device.</p></div>
            {questions.map((question) => <QuestionField key={question.id} question={question} value={answers[question.id]} onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} />)}
            <div className="rounded-xl border bg-secondary/30 p-4"><div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /><div><div className="text-sm font-semibold">Explicit consent to process health information</div><p className="text-xs text-muted-foreground mt-2 leading-relaxed">{content?.consent_text}</p><label className="mt-4 flex items-start gap-2 text-sm font-medium"><Checkbox checked={consented} onCheckedChange={(checked) => setConsented(checked === true)} className="mt-0.5" />I explicitly consent to the processing described above.</label></div></div></div>
            <div><Label>Client’s full name</Label><Input className="mt-1.5" value={signerName} onChange={(event) => setSignerName(event.target.value)} autoComplete="name" /></div>
            <div><Label>Client’s signature</Label><p className="text-xs text-muted-foreground mt-1 mb-2">The client should draw their own signature below.</p><SignaturePad key={`${record.id}-${record.patch_tested_at ?? "new"}`} onChange={setSignatureData} /></div>
            {!patchTestReady && <p className="text-xs text-amber-700">Save the completed skin-test details before collecting the client’s signature.</p>}
            {!requiredComplete && <p className="text-xs text-muted-foreground">Answer every question marked with an asterisk before signing.</p>}
            <Button onClick={sign} disabled={saving || !patchTestReady || !requiredComplete || !signerName.trim() || !signatureData || !consented}>{saving ? "Saving signed record…" : "Sign and lock record"}</Button>
          </section>
        ) : snapshot ? (
          <div className="space-y-5">
            {isPatchTest && <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">Skin-test result</div><div className="font-semibold mt-1">{record.patch_test_outcome === "passed" ? "Passed" : record.patch_test_outcome === "failed" ? "Reaction — failed" : "Retest required"}</div><div className="text-xs text-muted-foreground mt-1">{record.patch_tested_at ? new Date(record.patch_tested_at).toLocaleDateString() : ""}{record.patch_tested_by ? ` · Completed by ${record.patch_tested_by}` : ""}</div>{record.staff_notes && <p className="text-sm mt-3 whitespace-pre-wrap">{record.staff_notes}</p>}</div>}
            <div className="rounded-xl border divide-y">{questions.map((question) => <div key={question.id} className="p-4"><div className="text-xs text-muted-foreground">{question.label}</div><div className="mt-1 text-sm font-medium whitespace-pre-wrap">{typeof record.answers?.[question.id] === "boolean" ? (record.answers[question.id] ? "Yes" : "No") : record.answers?.[question.id] || "Not answered"}</div></div>)}</div>
            <div className="rounded-xl bg-secondary/40 p-4"><div className="text-xs font-semibold">Explicit consent statement accepted</div><p className="text-xs text-muted-foreground mt-2">{snapshot.consent_text}</p></div>
            {record.signature_data && <div><div className="text-xs text-muted-foreground mb-2">Signed by {record.signer_name}</div><div className="rounded-xl border bg-white p-3"><img src={record.signature_data} alt={`Signature of ${record.signer_name}`} className="h-24 max-w-full object-contain" /></div></div>}
            <p className="text-[10px] text-muted-foreground">This signed version is locked and cannot be edited.</p>
          </div>
        ) : null}

        <DialogFooter className="items-center">
          {record.status === "signed" && <ConfirmDialog trigger={<Button variant="ghost" className="text-destructive mr-auto">Withdraw consent</Button>} title="Mark consent as withdrawn?" description="Use this when the client asks the salon to withdraw consent. The signed evidence remains preserved but is clearly marked withdrawn." confirmLabel="Withdraw consent" onConfirm={withdraw} />}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionField({ question, value, onChange }: { question: ConsultationQuestion; value: unknown; onChange: (value: string | boolean) => void }) {
  return <div><Label>{question.label}{question.required && <span className="text-destructive ml-1">*</span>}</Label>{question.type === "yes_no" ? <div className="grid grid-cols-2 gap-2 mt-2"><Button type="button" variant={value === true ? "default" : "outline"} onClick={() => onChange(true)}>Yes</Button><Button type="button" variant={value === false ? "default" : "outline"} onClick={() => onChange(false)}>No</Button></div> : question.type === "long_text" ? <Textarea className="mt-2" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} /> : question.type === "select" ? <Select value={String(value ?? "")} onValueChange={onChange}><SelectTrigger className="mt-2"><SelectValue placeholder="Choose an answer" /></SelectTrigger><SelectContent>{question.options?.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select> : <Input className="mt-2" type={question.type === "date" ? "date" : "text"} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />}</div>;
}
