import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, ChevronRight } from "lucide-react";
import { ConsultationCustomerPicker } from "@/components/consultation-customer-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
export function StartSigningDialog({
  open,
  templates,
  saving,
  onStart,
  onClose,
}: {
  open: boolean;
  templates: any[];
  saving: boolean;
  onStart: (details: {
    templateId: string;
    customerId?: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const activeTemplates = useMemo(
    () => templates.filter((template) => template.active),
    [templates],
  );
  const [templateId, setTemplateId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [detailsConfirmed, setDetailsConfirmed] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTemplateId(activeTemplates[0]?.id ?? "");
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setCustomerId(undefined);
    setDetailsConfirmed(false);
  }, [open, activeTemplates]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Get customer signature
          </DialogTitle>
          <DialogDescription>
            Enter the customer’s details, then hand them this device to complete
            and sign the form.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <ConsultationCustomerPicker
            onSelect={(customer) => {
              setCustomerId(customer.id);
              setCustomerName(customer.name);
              setCustomerEmail(customer.email ?? "");
              setCustomerPhone(customer.phone ?? "");
              setDetailsConfirmed(false);
            }}
          />
          {customerId && (
            <div className="space-y-2 rounded-xl border bg-secondary/30 p-3">
              <p className="text-sm">
                Saved contact details selected. Health answers, consent and
                signatures are never copied.
              </p>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={detailsConfirmed}
                  onCheckedChange={(checked) =>
                    setDetailsConfirmed(checked === true)
                  }
                />
                <span>
                  I have checked this is the correct customer and their contact
                  details are current.
                </span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCustomerId(undefined);
                  setDetailsConfirmed(false);
                  setCustomerName("");
                  setCustomerEmail("");
                  setCustomerPhone("");
                }}
              >
                Enter a different customer
              </Button>
              <p className="text-xs text-muted-foreground">
                If saved details have changed, update the customer profile
                first.
              </p>
            </div>
          )}
          <div>
            <Label>Form</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Choose a form" />
              </SelectTrigger>
              <SelectContent>
                {activeTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Customer’s full name</Label>
            <Input
              className="mt-1.5"
              value={customerName}
              readOnly={!!customerId}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Full name"
              autoComplete="name"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>
                Phone{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                className="mt-1.5"
                value={customerPhone}
                readOnly={!!customerId}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="Phone number"
                autoComplete="tel"
              />
            </div>
            <div>
              <Label>
                Email{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                className="mt-1.5"
                type="email"
                value={customerEmail}
                readOnly={!!customerId}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="Email address"
                autoComplete="email"
              />
            </div>
          </div>
          <div className="rounded-xl bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
            <ShieldCheck className="mr-2 inline h-4 w-4" />
            Nothing is signed until the customer reviews the form and draws
            their own signature.
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onStart({
                templateId,
                customerId,
                customerName,
                customerEmail,
                customerPhone,
              })
            }
            disabled={
              saving ||
              !templateId ||
              !customerName.trim() ||
              (!!customerId && !detailsConfirmed)
            }
          >
            {saving ? "Preparing…" : "Continue to signature"}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
