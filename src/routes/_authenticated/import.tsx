import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Upload, FileText, X, CheckCircle2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

type Row = Record<string, string>;

const NONE = "__none__";
const COMBINE_FIRST_LAST = "__combine_first_last__";

type Mapping = {
  name: string; // column header, or COMBINE_FIRST_LAST
  email: string; // column header, or NONE
  phone: string;
  notes: string;
  firstName?: string;
  lastName?: string;
};

function findColumn(columns: string[], predicate: (lower: string) => boolean): string | undefined {
  return columns.find((c) => predicate(c.toLowerCase()));
}

function guessMapping(columns: string[]): Mapping {
  const nameCol = findColumn(columns, (l) => l.includes("name") || l.includes("client") || l.includes("customer"));
  const firstName = findColumn(columns, (l) => l.includes("first") && l.includes("name"))
    ?? findColumn(columns, (l) => l === "first" || l === "firstname" || l === "fname");
  const lastName = findColumn(columns, (l) => l.includes("last") && l.includes("name"))
    ?? findColumn(columns, (l) => l === "last" || l === "lastname" || l === "lname" || l === "surname");

  let name = NONE;
  if (nameCol && !(firstName && lastName && nameCol === firstName)) {
    name = nameCol;
  } else if (firstName && lastName) {
    name = COMBINE_FIRST_LAST;
  } else if (nameCol) {
    name = nameCol;
  }

  return {
    name,
    email: findColumn(columns, (l) => l.includes("email")) ?? NONE,
    phone: findColumn(columns, (l) => l.includes("phone") || l.includes("mobile") || l.includes("tel") || l.includes("cell")) ?? NONE,
    notes: findColumn(columns, (l) => l.includes("note")) ?? NONE,
    firstName,
    lastName,
  };
}

function mapRow(row: Row, mapping: Mapping) {
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

function ImportPage() {
  const { data: biz } = useMyBusiness();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [mapping, setMapping] = useState<Mapping>({ name: NONE, email: NONE, phone: NONE, notes: NONE });
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
        const cols = results.meta.fields ?? [];
        setRows(data);
        setColumns(cols);
        setParsing(false);
        toast.success(`Parsed ${data.length} rows`);
      },
      error: (err) => {
        setParsing(false);
        toast.error(`Parse failed: ${err.message}`);
      },
    });
  }, []);

  // Auto-guess when columns change
  useEffect(() => {
    if (columns.length > 0) setMapping(guessMapping(columns));
  }, [columns]);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setColumns([]);
    setMapping({ name: NONE, email: NONE, phone: NONE, notes: NONE });
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const mapped = useMemo(() => rows.map((r) => mapRow(r, mapping)), [rows, mapping]);
  const skipped = useMemo(() => mapped.filter((r) => !r.name).length, [mapped]);
  const preview = mapped.slice(0, 10);

  const nameOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    if (mapping.firstName && mapping.lastName) {
      opts.push({ value: COMBINE_FIRST_LAST, label: `${mapping.firstName} + ${mapping.lastName} (combined)` });
    }
    for (const c of columns) opts.push({ value: c, label: c });
    return opts;
  }, [columns, mapping.firstName, mapping.lastName]);

  const runImport = async () => {
    if (!biz?.id) {
      toast.error("Business not loaded yet");
      return;
    }
    setImporting(true);
    try {
      // Build rows
      const noNameCount = mapped.filter((r) => !r.name).length;
      const named = mapped.filter((r) => r.name);

      // Fetch existing emails for this business
      const { data: existing, error: fetchErr } = await supabase
        .from("customers")
        .select("email")
        .eq("business_id", biz.id)
        .not("email", "is", null);
      if (fetchErr) throw fetchErr;
      const existingEmails = new Set(
        (existing ?? [])
          .map((c) => (c.email ?? "").trim().toLowerCase())
          .filter(Boolean),
      );

      // De-dupe within file + against existing
      const seenEmails = new Set<string>();
      let dupes = 0;
      const toInsert: {
        business_id: string;
        name: string;
        email: string | null;
        phone: string | null;
        notes: string | null;
      }[] = [];
      for (const r of named) {
        const emailLower = r.email ? r.email.toLowerCase() : "";
        if (emailLower) {
          if (existingEmails.has(emailLower) || seenEmails.has(emailLower)) {
            dupes++;
            continue;
          }
          seenEmails.add(emailLower);
        }
        toInsert.push({
          business_id: biz.id,
          name: r.name,
          email: r.email || null,
          phone: r.phone || null,
          notes: r.notes || null,
        });
      }

      // Batch insert in chunks of 500
      let imported = 0;
      const CHUNK = 500;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);
        const { error: insErr } = await supabase.from("customers").insert(chunk);
        if (insErr) throw insErr;
        imported += chunk.length;
      }

      setResult({ imported, dupes, noName: noNameCount });
      await qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`Imported ${imported} customers`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Import failed: ${msg}`);
    } finally {
      setImporting(false);
    }
  };

  const canImport = !!biz?.id && mapping.name !== NONE && mapped.some((r) => r.name);

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader
        eyebrow="Step 3 of 3"
        title="Import customers"
        subtitle="Match your CSV columns to Chairly customer fields, then import. Duplicates by email are skipped automatically."
      />

      {result ? (
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
            <Button asChild><Link to="/customers">View customers</Link></Button>
          </div>
        </div>
      ) : null}

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
              Choose which CSV column feeds each Chairly field. Name is required.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldMap
                label="Name"
                required
                value={mapping.name}
                onChange={(v) => setMapping((m) => ({ ...m, name: v }))}
                options={nameOptions}
                allowNone={false}
              />
              <FieldMap
                label="Email"
                value={mapping.email}
                onChange={(v) => setMapping((m) => ({ ...m, email: v }))}
                options={columns.map((c) => ({ value: c, label: c }))}
              />
              <FieldMap
                label="Phone"
                value={mapping.phone}
                onChange={(v) => setMapping((m) => ({ ...m, phone: v }))}
                options={columns.map((c) => ({ value: c, label: c }))}
              />
              <FieldMap
                label="Notes"
                value={mapping.notes}
                onChange={(v) => setMapping((m) => ({ ...m, notes: v }))}
                options={columns.map((c) => ({ value: c, label: c }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="secondary">{mapped.length} total rows</Badge>
            {skipped > 0 ? (
              <Badge variant="destructive">{skipped} without a name — will be skipped</Badge>
            ) : (
              <Badge variant="secondary">All rows have a name</Badge>
            )}
          </div>

          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">Name</th>
                    <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">Email</th>
                    <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">Phone</th>
                    <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
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
            </div>
            {mapped.length > preview.length && (
              <div className="px-4 py-2.5 text-xs text-muted-foreground border-t bg-muted/30">
                Showing first {preview.length} of {mapped.length} rows
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>Choose another file</Button>
            <Button disabled title="Coming in step 3">Continue to import</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldMap({
  label,
  required,
  value,
  onChange,
  options,
  allowNone = true,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allowNone?: boolean;
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
