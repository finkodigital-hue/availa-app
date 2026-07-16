import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function ColorField({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: any;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="mt-1.5 flex items-center gap-3 rounded-xl border bg-background h-10 px-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 rounded cursor-pointer bg-transparent border-0"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 border-0 px-0 shadow-none focus-visible:ring-0 tabular-nums text-xs"
        />
      </div>
    </div>
  );
}
