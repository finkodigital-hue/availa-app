import { useRef, useState, type ReactNode } from "react";
import { FileText, Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Dropzone({
  fileName,
  parsing,
  onFile,
  onRemove,
  icon,
  label,
  hint,
}: {
  fileName: string | null;
  parsing: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
  icon: ReactNode;
  label: string;
  hint: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (fileName) {
    return (
      <div className="rounded-xl border bg-card p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{fileName}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${
        dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
      }`}
    >
      <div className="flex items-center justify-center gap-2 mb-1">
        {parsing ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : icon}
        <span className="text-sm font-medium">{parsing ? "Reading file…" : label}</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function StepShell({
  index,
  icon,
  title,
  subtitle,
  done,
  children,
}: {
  index: number;
  icon: ReactNode;
  title: string;
  subtitle: string;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="p-4 sm:p-5 flex items-start gap-3 border-b bg-muted/20">
        <div
          className={`h-7 w-7 shrink-0 rounded-full grid place-items-center text-xs font-semibold ${
            done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {index}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-medium">
            {icon}
            {title}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

export function UploadIcon() {
  return <Upload className="h-4 w-4 text-muted-foreground" />;
}
