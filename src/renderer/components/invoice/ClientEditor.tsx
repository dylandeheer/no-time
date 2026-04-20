import { useEffect, useState } from "react";
import type { Client } from "@shared/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client;
  onSaved?: () => void;
}

interface FormState {
  name: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  vatNumber: string;
  currency: string;
  defaultHourlyRateEuros: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  postalCode: "",
  city: "",
  country: "",
  vatNumber: "",
  currency: "EUR",
  defaultHourlyRateEuros: "",
};

function clientToForm(client?: Client): FormState {
  if (!client) return { ...EMPTY_FORM };
  return {
    name: client.name,
    email: client.email ?? "",
    addressLine1: client.addressLine1 ?? "",
    addressLine2: client.addressLine2 ?? "",
    postalCode: client.postalCode ?? "",
    city: client.city ?? "",
    country: client.country ?? "",
    vatNumber: client.vatNumber ?? "",
    currency: client.currency ?? "EUR",
    defaultHourlyRateEuros:
      typeof client.defaultHourlyRateCents === "number"
        ? (client.defaultHourlyRateCents / 100).toString()
        : "",
  };
}

function parseRateCents(input: string): number | undefined {
  if (!input.trim()) return undefined;
  const value = Number(input.replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 100);
}

export function ClientEditor({ open, onOpenChange, client, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => clientToForm(client));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(clientToForm(client));
  }, [open, client]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        addressLine1: form.addressLine1.trim() || undefined,
        addressLine2: form.addressLine2.trim() || undefined,
        city: form.city.trim() || undefined,
        postalCode: form.postalCode.trim() || undefined,
        country: form.country.trim() || undefined,
        vatNumber: form.vatNumber.trim() || undefined,
        currency: form.currency.trim() || "EUR",
        defaultHourlyRateCents: parseRateCents(form.defaultHourlyRateEuros),
      };
      if (client) {
        await window.electronAPI.updateClient({ id: client.id, ...payload });
        toast.success("Client updated");
      } else {
        await window.electronAPI.createClient(payload);
        toast.success("Client created");
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save client");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!client) return;
    setSaving(true);
    try {
      await window.electronAPI.deleteClient(client.id);
      toast.success("Client deleted");
      onOpenChange(false);
      onSaved?.();
    } catch {
      toast.error("Failed to delete client");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{client ? "Edit client" : "New client"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <Field label="Name" className="col-span-2">
            <Input value={form.name} onChange={(e) => setField("name", e.target.value)} autoFocus />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={(e) => setField("email", e.target.value)} />
          </Field>
          <Field label="VAT number">
            <Input value={form.vatNumber} onChange={(e) => setField("vatNumber", e.target.value)} />
          </Field>
          <Field label="Address line 1" className="col-span-2">
            <Input
              value={form.addressLine1}
              onChange={(e) => setField("addressLine1", e.target.value)}
            />
          </Field>
          <Field label="Address line 2" className="col-span-2">
            <Input
              value={form.addressLine2}
              onChange={(e) => setField("addressLine2", e.target.value)}
            />
          </Field>
          <Field label="Postal code">
            <Input value={form.postalCode} onChange={(e) => setField("postalCode", e.target.value)} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(e) => setField("city", e.target.value)} />
          </Field>
          <Field label="Country">
            <Input value={form.country} onChange={(e) => setField("country", e.target.value)} />
          </Field>
          <Field label="Currency">
            <Input value={form.currency} onChange={(e) => setField("currency", e.target.value)} />
          </Field>
          <Field label="Default hourly rate" className="col-span-2">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.defaultHourlyRateEuros}
              onChange={(e) => setField("defaultHourlyRateEuros", e.target.value)}
              placeholder="e.g. 85"
            />
          </Field>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {client ? (
            <Button
              variant="outline"
              size="sm"
              onClick={remove}
              disabled={saving}
              className="text-destructive hover:text-destructive"
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>
              {client ? "Save" : "Create"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
