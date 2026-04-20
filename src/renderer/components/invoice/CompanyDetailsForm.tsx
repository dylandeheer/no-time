import { useEffect, useState } from "react";
import type { InvoiceSettings } from "@shared/types";
import { Card } from "@renderer/components/ui/card";
import { Input } from "@renderer/components/ui/input";
import { Button } from "@renderer/components/ui/button";
import { toast } from "sonner";

interface Props {
  settings: InvoiceSettings;
  onSaved?: (next: InvoiceSettings) => void;
}

export function CompanyDetailsForm({ settings, onSaved }: Props) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const setCompanyField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, company: { ...prev.company, [key]: value } }));
  };

  const setSettingField = <K extends keyof InvoiceSettings>(
    key: K,
    value: InvoiceSettings[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const next = await window.electronAPI.updateInvoiceSettings({
        company: form.company,
        defaultVatPercent: Number(form.defaultVatPercent) || 0,
        numberPrefix: form.numberPrefix,
        nextNumber: Math.max(1, Math.round(Number(form.nextNumber) || 1)),
        defaultGrouping: form.defaultGrouping,
        defaultRounding: form.defaultRounding,
      });
      toast.success("Invoice settings saved");
      onSaved?.(next);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold">Invoice settings</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Your company block and invoice defaults.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Company name" className="col-span-2">
          <Input
            value={form.company.name}
            onChange={(e) => setCompanyField("name", e.target.value)}
          />
        </Field>
        <Field label="Email">
          <Input
            value={form.company.email ?? ""}
            onChange={(e) => setCompanyField("email", e.target.value)}
          />
        </Field>
        <Field label="VAT number">
          <Input
            value={form.company.vatNumber ?? ""}
            onChange={(e) => setCompanyField("vatNumber", e.target.value)}
          />
        </Field>
        <Field label="Address line 1" className="col-span-2">
          <Input
            value={form.company.addressLine1 ?? ""}
            onChange={(e) => setCompanyField("addressLine1", e.target.value)}
          />
        </Field>
        <Field label="Postal code">
          <Input
            value={form.company.postalCode ?? ""}
            onChange={(e) => setCompanyField("postalCode", e.target.value)}
          />
        </Field>
        <Field label="City">
          <Input
            value={form.company.city ?? ""}
            onChange={(e) => setCompanyField("city", e.target.value)}
          />
        </Field>
        <Field label="Country">
          <Input
            value={form.company.country ?? ""}
            onChange={(e) => setCompanyField("country", e.target.value)}
          />
        </Field>
        <Field label="IBAN">
          <Input
            value={form.company.iban ?? ""}
            onChange={(e) => setCompanyField("iban", e.target.value)}
          />
        </Field>
        <Field label="Default VAT %">
          <Input
            type="number"
            min={0}
            max={99}
            step="0.1"
            value={form.defaultVatPercent}
            onChange={(e) => setSettingField("defaultVatPercent", Number(e.target.value))}
          />
        </Field>
        <Field label="Invoice number prefix">
          <Input
            value={form.numberPrefix}
            onChange={(e) => setSettingField("numberPrefix", e.target.value)}
          />
        </Field>
        <Field label="Next invoice number">
          <Input
            type="number"
            min={1}
            value={form.nextNumber}
            onChange={(e) => setSettingField("nextNumber", Number(e.target.value))}
          />
        </Field>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={saving}>
          Save settings
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`space-y-1 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
