import { useState } from "react";
import {
  Settings2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Sparkles,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { FieldSpec } from "@/lib/import/schema";
import type { FieldMapping, ImportSource } from "@/lib/import/mapping";

const NONE = "__not_in_file__";

// Lets the owner see (and fix) which of their file's columns we matched to
// each field Bookzenvo needs. Opens automatically when there's a real
// problem (a required field, or every name field, didn't auto-match);
// otherwise stays collapsed since most imports — especially Fresha's — need
// no adjustment at all.
export function ColumnMapper({
  fields,
  headers,
  mapping,
  onChange,
  problem,
  source,
}: {
  fields: FieldSpec[];
  headers: string[];
  mapping: FieldMapping;
  onChange: (next: FieldMapping) => void;
  problem: string | null;
  source: ImportSource | null;
}) {
  const [open, setOpen] = useState(!!problem);
  const mappedCount = fields.filter((field) => !!mapping[field.key]).length;

  return (
    <div className="rounded-lg border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          Column matching
          {problem && (
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          )}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline text-xs text-muted-foreground">
            {mappedCount} of {fields.length} fields matched
          </span>
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
      </button>
      <div className="mx-3 mb-3 rounded-lg border bg-background px-3 py-2.5 flex items-start gap-2.5">
        {problem ? (
          <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
        ) : source ? (
          <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        ) : (
          <CircleCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">
            {problem
              ? "A little help needed"
              : source
                ? `${source.name} export recognised`
                : "File understood"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {problem
              ? "Choose the missing column below before importing."
              : `Bookzenvo matched ${mappedCount} of ${fields.length} useful fields. You can review or change them before importing.`}
          </p>
        </div>
      </div>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {problem && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}
          <p className="text-xs text-muted-foreground">
            We matched your file's columns to what Bookzenvo needs
            automatically. If a field looks wrong or is missing, pick the right
            column for it below.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </label>
                <Select
                  value={mapping[f.key] ?? NONE}
                  onValueChange={(v) =>
                    onChange({ ...mapping, [f.key]: v === NONE ? null : v })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not in this file</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
