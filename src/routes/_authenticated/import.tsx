import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Upload, FileText, X, CheckCircle2, Loader2, Users, Scissors } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

type Row = Record<string, string>;
type Entity = "customers" | "services";

const NONE = "__none__";
const COMBINE_FIRST_LAST = "__combine_first_last__";

type CustomerMapping = {
  name: string;
  email: string;
  phone: string;
  notes: string;
  firstName?: string;
  lastName?: string;
};

type ServiceMapping = {
  name: string;
  duration: string;
  price: string;
  description: string;
};

function findColumn(columns: string[], predicate: (lower: string) => boolean): string | undefined {
  return columns.find((c) => predicate(c.toLowerCase()));
}

function guessCustomerMapping(columns: string[]): CustomerMapping {
  const nameCol = findColumn(columns, (l) => l.includes("name") || l.includes("client") || l.includes("customer"));
  const firstName = findColumn(columns, (l) => l.includes("first") && l.includes("name"))
    ?? findColumn(columns, (l) => l === "first" || l === "firstname" || l === "fname");
  const lastName = findColumn(columns, (l) => l.includes("last") && l.includes("name"))
    ?? findColumn(columns, (l) => l === "last" || l === "lastname" || l === "lname" || l === "surname");
  let name = NONE;
  if (nameCol && !(firstName && lastName && nameCol === firstName)) name = nameCol;
  else if (firstName && lastName) name = COMBINE_FIRST_LAST;
  else if (nameCol) name = nameCol;
  return {
    name,
    email: findColumn(columns, (l) => l.includes("email")) ?? NONE,
    phone: findColumn(columns, (l) => l.includes("phone") || l.includes("mobile") || l.includes("tel") || l.includes("cell")) ?? NONE,
    notes: findColumn(columns, (l) => l.includes("note")) ?? NONE,
    firstName,
    lastName,
  };
}

function guessServiceMapping(columns: string[]): ServiceMapping {
  return {
    name: findColumn(columns, (l) => l.includes("name") || l.includes("service")) ?? NONE,
    duration: findColumn(columns, (l) => l.includes("duration") || l.includes("time") || l.includes("length")) ?? NONE,
    price: findColumn(columns, (l) => l.includes("price") || l.includes("cost") || l.includes("amount")) ?? NONE,
    description: findColumn(columns, (l) => l.includes("description") || l.includes("notes")) ?? NONE,
  };
}

function mapCustomerRow(row: Row, mapping: CustomerMapping) {
  let name = "";
  if (mapping.name === COMBINE_FIRST_LAST) {
    const f = (mapping.firstName ? row[mapping.firstName] : "") ?? "";
    const l = (mapping.lastName ? row[mapping.lastName] : "") ?? "";
    name = `${f} ${l}`.trim();
  } else if (mapping.name !== NONE) {
    name = (row[mapping.name] ?? "").trim();
  }
  return {
    name,
    email: mapping.email !== NONE ? (row[mapping.email] ?? "").trim() : "",
    phone: mapping.phone !== NONE ? (row[mapping.phone] ?? "").trim() : "",
    notes: mapping.notes !== NONE ? (row[mapping.notes] ?? "").trim() : "",
  };
}

export function parseDurationMinutes(raw: string): number {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return 60;
  // H:MM
  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon) return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);
  // Bare integer
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  // Hours + minutes: 1h 30m, 1h30, 1h30m, 1 h 30 min, 2h, 90m
  const hm = s.match(/^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?\s*$/);
  if (hm && (hm[1] || hm[2])) {
    const h = hm[1] ? parseInt(hm[1], 10) : 0;
    const m = hm[2] ? parseInt(hm[2], 10) : 0;
    if (h > 0 || m > 0) return h * 60 + m;
  }
  // "45 minutes" already covered; fallback try to strip trailing text
  const numMatch = s.match(/^(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const n = parseFloat(numMatch[1]);
    if (!isNaN(n)) return Math.round(n);
  }
  return 60;
}

export function parsePriceCents(raw: string): number {
  let s = (raw ?? "").trim();
  if (!s) return 0;
  // Strip currency symbols and whitespace
  s = s.replace(/[£$€\s]/g, "");
  // Comma as decimal separator if trailing ,dd/,d and no dot present
  if (!s.includes(".") && /,\d{1,2}$/.test(s)) {
    s = s.replace(/,(\d{1,2})$/, ".$1");
  }
  // Remaining commas are thousands separators
  s = s.replace(/,/g, "");
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}

function mapServiceRow(row: Row, mapping: ServiceMapping) {
  const name = mapping.name !== NONE ? (row[mapping.name] ?? "").trim() : "";
  const durationRaw = mapping.duration !== NONE ? (row[mapping.duration] ?? "").trim() : "";
  const priceRaw = mapping.price !== NONE ? (row[mapping.price] ?? "").trim() : "";
  const description = mapping.description !== NONE ? (row[mapping.description] ?? "").trim() : "";
  return {
    name,
    duration_minutes: parseDurationMinutes(durationRaw),
    price_cents: parsePriceCents(priceRaw),
    description,
  };
}

function ImportPage() {
  const { data: biz } = useMyBusiness();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [entity, setEntity] = useState<Entity>("customers");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [custMap, setCustMap] = useState<CustomerMapping>({ name: NONE, email: NONE, phone: NONE, notes: NONE });
  const [svcMap, setSvcMap] = useState<ServiceMapping>({ name: NONE, duration: NONE, price: NONE, description: NONE });
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; dupes: number; noName: number } | null>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please select a .csv file");
      return;
    }
    setParsing(true);
    setFileName(file.name);
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = (results.data as Row[]).filter((r) => Object.values(r).some((v) => v != null && String(v).trim() !== ""));
        setRows(data);
        setColumns(results.meta.fields ?? []);
        setParsing(false);
        toast.success(`Parsed ${data.length} rows`);
      },
      error: (err) => {
        setParsing(false);
        toast.error(`Parse failed: ${err.message}`);
      },
    });
  }, []);

  useEffect(() => {
    if (columns.length > 0) {
      setCustMap(guessCustomerMapping(columns));
      setSvcMap(guessServiceMapping(columns));
    }
  }, [columns]);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setColumns([]);
    setCustMap({ name: NONE, email: NONE, phone: NONE, notes: NONE });
    setSvcMap({ name: NONE, duration: NONE, price: NONE, description: NONE });
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const mappedCustomers = useMemo(() => rows.map((r) => mapCustomerRow(r, custMap)), [rows, custMap]);
  const mappedServices = useMemo(() => rows.map((r) => mapServiceRow(r, svcMap)), [rows, svcMap]);
  const noNameCount = entity === "customers"
    ? mappedCustomers.filter((r) => !r.name).length
    : mappedServices.filter((r) => !r.name).length;
  const namedCount = rows.length - noNameCount;

  const nameOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    if (custMap.firstName && custMap.lastName) {
      opts.push({ value: COMBINE_FIRST_LAST, label: `${custMap.firstName} + ${custMap.lastName} (combined)` });
    }
    for (const c of columns) opts.push({ value: c, label: c });
    return opts;
  }, [columns, custMap.firstName, custMap.lastName]);

  const currency = biz?.currency ?? "USD";

  const runImport = async () => {
    if (!biz?.id) { toast.error("Business not loaded yet"); return; }
    setImporting(true);
    try {
      if (entity === "customers") {
        const named = mappedCustomers.filter((r) => r.name);
        const { data: existing, error: fetchErr } = await supabase
          .from("customers").select("email").eq("business_id", biz.id).not("email", "is", null);
        if (fetchErr) throw fetchErr;
        const existingEmails = new Set(
          (existing ?? []).map((c) => (c.email ?? "").trim().toLowerCase()).filter(Boolean),
        );
        const seen = new Set<string>();
        let dupes = 0;
        const toInsert: any[] = [];
        for (const r of named) {
          const emailLower = r.email ? r.email.toLowerCase() : "";
          if (emailLower) {
            if (existingEmails.has(emailLower) || seen.has(emailLower)) { dupes++; continue; }
            seen.add(emailLower);
          }
          toInsert.push({
            business_id: biz.id,
            name: r.name,
            email: r.email || null,
            phone: r.phone || null,
            notes: r.notes || null,
          });
        }
        let imported = 0;
        const CHUNK = 500;
        for (let i = 0; i < toInsert.length; i += CHUNK) {
          const chunk = toInsert.slice(i, i + CHUNK);
          const { error } = await supabase.from("customers").insert(chunk);
          if (error) throw error;
          imported += chunk.length;
        }
        setResult({ imported, dupes, noName: mappedCustomers.length - named.length });
        await qc.invalidateQueries({ queryKey: ["customers"] });
        toast.success(`Imported ${imported} customers`);
      } else {
        const named = mappedServices.filter((r) => r.name);
        const { data: existing, error: fetchErr } = await supabase
          .from("services").select("name").eq("business_id", biz.id);
        if (fetchErr) throw fetchErr;
        const existingNames = new Set(
          (existing ?? []).map((s) => (s.name ?? "").trim().toLowerCase()).filter(Boolean),
        );
        const seen = new Set<string>();
        let dupes = 0;
        const toInsert: any[] = [];
        for (const r of named) {
          const key = r.name.toLowerCase();
          if (existingNames.has(key) || seen.has(key)) { dupes++; continue; }
          seen.add(key);
          toInsert.push({
            business_id: biz.id,
            name: r.name,
            duration_minutes: r.duration_minutes,
            price_cents: r.price_cents,
            description: r.description || null,
            active: true,
          });
        }
        let imported = 0;
        const CHUNK = 500;
        for (let i = 0; i < toInsert.length; i += CHUNK) {
          const chunk = toInsert.slice(i, i + CHUNK);
          const { error } = await supabase.from("services").insert(chunk);
          if (error) throw error;
          imported += chunk.length;
        }
        setResult({ imported, dupes, noName: mappedServices.length - named.length });
        await qc.invalidateQueries({ queryKey: ["services"] });
        toast.success(`Imported ${imported} services`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Import failed: ${msg}`);
    } finally {
      setImporting(false);
    }
  };

  const canImport = !!biz?.id && namedCount > 0 && (
    entity === "customers" ? custMap.name !== NONE : svcMap.name !== NONE
  );

  const colOpts = columns.map((c) => ({ value: c, label: c }));

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader
        eyebrow="Import"
        title="Import from CSV"
        subtitle="Upload a spreadsheet to bulk-add customers or services. Duplicates are skipped automatically."
      />

      {!result && (
        <div className="mb-5 rounded-2xl border bg-card p-4">
          <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">What are you importing?</Label>
          <div className="grid grid-cols-2 gap-2">
            <EntityCard active={entity === "customers"} onClick={() => { setEntity("customers"); setResult(null); }}
              icon={<Users className="h-4 w-4" />} label="Customers" hint="Name, email, phone, notes" />
            <EntityCard active={entity === "services"} onClick={() => { setEntity("services"); setResult(null); }}
              icon={<Scissors className="h-4 w-4" />} label="Services" hint="Name, duration, price, description" />
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-2xl border bg-card p-8 text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
          <h3 className="text-xl font-medium">Import complete</h3>
          <p className="text-muted-foreground">
            Imported <span className="font-semibold text-foreground">{result.imported}</span>
            {" · "}Skipped <span className="font-semibold text-foreground">{result.dupes}</span> duplicates
            {" · "}Skipped <span className="font-semibold text-foreground">{result.noName}</span> with no name
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button variant="outline" onClick={reset}>Import another file</Button>
            <Button asChild>
              <Link to={entity === "customers" ? "/customers" : "/services"}>
                View {entity === "customers" ? "customers" : "services"}
              </Link>
            </Button>
          </div>
        </div>
      )}

      {!result && !fileName && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className={`rounded-2xl border-2 border-dashed p-12 text-center bg-card transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-1">Drop your CSV here</h3>
          <p className="text-sm text-muted-foreground mb-5">
            or click to browse. We'll read the header row as column names.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={parsing}>
            {parsing ? "Parsing…" : "Select CSV file"}
          </Button>
        </div>
      )}

      {!result && fileName && (
        <div className="space-y-5">
          <div className="rounded-2xl border bg-card p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="font-medium truncate">{fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {rows.length} rows · {columns.length} columns
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="h-4 w-4 mr-1" /> Remove
            </Button>
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <h3 className="font-medium mb-1">Map your columns</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Choose which CSV column feeds each field. Name is required.
            </p>
            {entity === "customers" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldMap label="Name" required value={custMap.name}
                  onChange={(v) => setCustMap((m) => ({ ...m, name: v }))} options={nameOptions} allowNone={false} />
                <FieldMap label="Email" value={custMap.email}
                  onChange={(v) => setCustMap((m) => ({ ...m, email: v }))} options={colOpts} />
                <FieldMap label="Phone" value={custMap.phone}
                  onChange={(v) => setCustMap((m) => ({ ...m, phone: v }))} options={colOpts} />
                <FieldMap label="Notes" value={custMap.notes}
                  onChange={(v) => setCustMap((m) => ({ ...m, notes: v }))} options={colOpts} />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldMap label="Name" required value={svcMap.name}
                  onChange={(v) => setSvcMap((m) => ({ ...m, name: v }))} options={colOpts} allowNone={false} />
                <FieldMap label="Duration" value={svcMap.duration}
                  onChange={(v) => setSvcMap((m) => ({ ...m, duration: v }))} options={colOpts} />
                <FieldMap label="Price" value={svcMap.price}
                  onChange={(v) => setSvcMap((m) => ({ ...m, price: v }))} options={colOpts} />
                <FieldMap label="Description" value={svcMap.description}
                  onChange={(v) => setSvcMap((m) => ({ ...m, description: v }))} options={colOpts} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="secondary">{rows.length} total rows</Badge>
            {noNameCount > 0 ? (
              <Badge variant="destructive">{noNameCount} without a name — will be skipped</Badge>
            ) : (
              <Badge variant="secondary">All rows have a name</Badge>
            )}
          </div>

          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              {entity === "customers" ? (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <Th>Name</Th><Th>Email</Th><Th>Phone</Th><Th>Notes</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedCustomers.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className={`px-4 py-2 whitespace-nowrap ${row.name ? "" : "text-destructive italic"}`}>
                          {row.name || "(no name — will be skipped)"}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{row.email}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{row.phone}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground max-w-xs truncate">{row.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <Th>Name</Th><Th>Duration</Th><Th>Price</Th><Th>Description</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedServices.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className={`px-4 py-2 whitespace-nowrap ${row.name ? "" : "text-destructive italic"}`}>
                          {row.name || "(no name — will be skipped)"}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{row.duration_minutes} min</td>
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{fmtMoney(row.price_cents, currency)}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground max-w-xs truncate">{row.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {rows.length > 10 && (
              <div className="px-4 py-2.5 text-xs text-muted-foreground border-t bg-muted/30">
                Showing first 10 of {rows.length} rows
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset} disabled={importing}>Choose another file</Button>
            <Button onClick={runImport} disabled={!canImport || importing}>
              {importing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {importing ? "Importing…" : `Import ${namedCount} ${entity === "customers" ? "customers" : "services"}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{children}</th>;
}

function EntityCard({ active, onClick, icon, label, hint }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-3 transition-colors ${
        active ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "border-border hover:bg-muted/40"
      }`}
    >
      <div className="flex items-center gap-2 font-medium">{icon} {label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
    </button>
  );
}

function FieldMap({
  label, required, value, onChange, options, allowNone = true,
}: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; allowNone?: boolean;
}) {
  return (
    <div>
      <Label className="mb-1.5 block">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a column…" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>— none —</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
