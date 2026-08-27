import { Plus, Trash2, AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type FAQ = { q: string; a: string };

export type PageContentSettings = {
  welcome_message: string | null;
  booking_instructions: string | null;
  cancellation_policy: string | null;
  terms: string | null;
  faq: FAQ[];
  show_prices: boolean;
  show_staff: boolean;
  show_durations: boolean;
  emergency_active: boolean;
  emergency_message: string | null;
};

export function PageContentEditor({
  value,
  onChange,
}: {
  value: PageContentSettings;
  onChange: (value: PageContentSettings) => void;
}) {
  const f = value;
  const faq = value.faq;
  const updateFields = onChange;

  const updateFaq = (nextFaq: FAQ[]) => updateFields({ ...f, faq: nextFaq });

  return (
    <div className="space-y-6 font-sans text-foreground">
      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Welcome message
        </Label>
        <Textarea
          value={f.welcome_message ?? ""}
          onChange={(e) => updateFields({ ...f, welcome_message: e.target.value })}
          placeholder="A warm one-liner shown at the top of your booking page."
          className="mt-1.5"
        />
      </div>
      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Booking instructions
        </Label>
        <Textarea
          value={f.booking_instructions ?? ""}
          onChange={(e) => updateFields({ ...f, booking_instructions: e.target.value })}
          placeholder="What customers should know before booking."
          className="mt-1.5"
          rows={3}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Cancellation policy
          </Label>
          <Textarea
            value={f.cancellation_policy ?? ""}
            onChange={(e) => updateFields({ ...f, cancellation_policy: e.target.value })}
            className="mt-1.5"
            rows={4}
          />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Terms &amp; conditions
          </Label>
          <Textarea
            value={f.terms ?? ""}
            onChange={(e) => updateFields({ ...f, terms: e.target.value })}
            className="mt-1.5"
            rows={4}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">FAQ</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => updateFaq([...faq, { q: "", a: "" }])}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add question
          </Button>
        </div>
        <div className="space-y-2">
          {faq.length === 0 && <p className="text-xs text-muted-foreground">No FAQ entries yet.</p>}
          {faq.map((item, i) => (
            <div key={i} className="rounded-xl border bg-background p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Input
                  placeholder="Question"
                  value={item.q}
                  onChange={(e) => {
                    const c = [...faq];
                    c[i] = { ...item, q: e.target.value };
                    updateFaq(c);
                  }}
                  className="h-9"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => updateFaq(faq.filter((_, j) => j !== i))}
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                placeholder="Answer"
                value={item.a}
                onChange={(e) => {
                  const c = [...faq];
                  c[i] = { ...item, a: e.target.value };
                  updateFaq(c);
                }}
                rows={2}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-background p-4 space-y-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Display options
        </div>
        <Toggle
          label="Show service prices"
          value={!!f.show_prices}
          onChange={(v) => updateFields({ ...f, show_prices: v })}
        />
        <Toggle
          label="Show staff members on booking page"
          value={!!f.show_staff}
          onChange={(v) => updateFields({ ...f, show_staff: v })}
        />
        <Toggle
          label="Show service durations"
          value={!!f.show_durations}
          onChange={(v) => updateFields({ ...f, show_durations: v })}
        />
      </div>

      <div className="rounded-xl border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-400 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium">Emergency closure</div>
            <p className="text-xs text-muted-foreground">
              A high-visibility banner shown on top of your booking page.
            </p>
          </div>
          <Switch
            checked={!!f.emergency_active}
            onCheckedChange={(v) => updateFields({ ...f, emergency_active: v })}
          />
        </div>
        <Textarea
          value={f.emergency_message ?? ""}
          onChange={(e) => updateFields({ ...f, emergency_message: e.target.value })}
          placeholder="e.g. Closed Wednesday for staff training - rebooking online."
          rows={2}
          disabled={!f.emergency_active}
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
