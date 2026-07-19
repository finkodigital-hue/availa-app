import { useState } from "react";
import { Settings2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { FieldSpec } from "@/lib/import/schema";
import type { FieldMapping } from "@/lib/import/mapping";

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
}: {
  fields: FieldSpec[];
  headers: string[];
  mapping: FieldMapping;
  onChange: (next: FieldMapping) => void;
  problem: string | null;
}) {
  const [open, setOpen] = useState(!!problem);

  return (
    <div className="rounded-lg border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm"
      >
        <span className="flex items-center gap-1.5">
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          Column matching
          {problem && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {problem && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}
          <p className="text-xs text-muted-foreground">
            We matched your file's columns to what Bookzenvo needs automatically. If a field looks
            wrong or is missing, pick the right column for it below.
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
                  onValueChange={(v) => onChange({ ...mapping, [f.key]: v === NONE ? null : v })}
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
