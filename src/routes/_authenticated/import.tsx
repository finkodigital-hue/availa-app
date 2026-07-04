import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import Papa from "papaparse";
import { Upload, FileText, X } from "lucide-react";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

type Row = Record<string, string>;

function ImportPage() {
  useMyBusiness();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);

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

  const reset = () => {
    setFileName(null);
    setRows([]);
    setColumns([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const preview = rows.slice(0, 100);

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader
        eyebrow="Step 1 of 3"
        title="Import customers"
        subtitle="Upload a CSV to preview your data. Nothing is saved yet — mapping and import come next."
      />

      {!fileName ? (
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
      ) : (
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

          <div className="flex flex-wrap gap-2">
            {columns.map((c) => (
              <Badge key={c} variant="secondary">{c}</Badge>
            ))}
          </div>

          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    {columns.map((c) => (
                      <th key={c} className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {columns.map((c) => (
                        <td key={c} className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                          {row[c] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > preview.length && (
              <div className="px-4 py-2.5 text-xs text-muted-foreground border-t bg-muted/30">
                Showing first {preview.length} of {rows.length} rows
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>Choose another file</Button>
            <Button disabled title="Coming in step 2">Continue to mapping</Button>
          </div>
        </div>
      )}
    </div>
  );
}
