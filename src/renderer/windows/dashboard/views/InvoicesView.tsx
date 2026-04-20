import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import type {
  Client,
  GenerateInvoiceInput,
  Invoice,
  InvoiceGrouping,
  InvoicePreview,
  InvoiceRoundingMode,
  InvoiceSettings,
} from "@shared/types";
import { Card } from "@renderer/components/ui/card";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { Separator } from "@renderer/components/ui/separator";
import { ClientEditor } from "@renderer/components/invoice/ClientEditor";
import { CompanyDetailsForm } from "@renderer/components/invoice/CompanyDetailsForm";
import { toast } from "sonner";

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function firstOfMonthKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function formatCurrency(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

function formatHours(hours: number): string {
  return hours.toFixed(2);
}

export function InvoicesView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);

  const [clientEditorOpen, setClientEditorOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>();

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(firstOfMonthKey());
  const [endDate, setEndDate] = useState<string>(todayKey());
  const [grouping, setGrouping] = useState<InvoiceGrouping>("project");
  const [rounding, setRounding] = useState<InvoiceRoundingMode>("15min");
  const [vatPercent, setVatPercent] = useState<number>(21);
  const [notes, setNotes] = useState<string>("");

  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadAll = useCallback(async () => {
    const [c, inv, set] = await Promise.all([
      window.electronAPI.listClients(),
      window.electronAPI.listInvoices(),
      window.electronAPI.getInvoiceSettings(),
    ]);
    setClients(c);
    setInvoices(inv);
    setSettings(set);
    if (!selectedClientId && c.length > 0) {
      setSelectedClientId(c[0].id);
    }
    setVatPercent(set.defaultVatPercent);
    setGrouping(set.defaultGrouping);
    setRounding(set.defaultRounding);
  }, [selectedClientId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId),
    [clients, selectedClientId],
  );

  const generatePreview = async () => {
    if (!selectedClientId) {
      toast.error("Pick a client");
      return;
    }
    setGenerating(true);
    try {
      const input: GenerateInvoiceInput = {
        clientId: selectedClientId,
        startDate,
        endDate,
        grouping,
        rounding,
        vatPercent,
        notes: notes.trim() || undefined,
      };
      const result = await window.electronAPI.generateInvoicePreview(input);
      setPreview(result);
      for (const warning of result.warnings) {
        toast.warning(warning);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate preview");
    } finally {
      setGenerating(false);
    }
  };

  const saveInvoice = async () => {
    if (!preview) return;
    const saved = await window.electronAPI.saveInvoice(preview.invoice);
    toast.success(`Invoice ${saved.number} saved`);
    setPreview(null);
    loadAll();
  };

  const exportPdf = async (invoice: Invoice) => {
    const res = await window.electronAPI.exportInvoicePdf(invoice);
    if (res.success) toast.success(`PDF saved to ${res.filePath}`);
  };

  const exportJson = async (invoice: Invoice) => {
    const res = await window.electronAPI.exportInvoiceJson(invoice);
    if (res.success) toast.success(`JSON saved to ${res.filePath}`);
  };

  const deleteInvoice = async (invoice: Invoice) => {
    await window.electronAPI.deleteInvoice(invoice.id);
    toast.success(`Deleted ${invoice.number}`);
    loadAll();
  };

  return (
    <div className="p-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn tracked time into client-ready invoices.
        </p>
      </header>

      <div className="space-y-6">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Clients</h2>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingClient(undefined);
                setClientEditorOpen(true);
              }}
            >
              <Plus className="h-3 w-3" />
              New client
            </Button>
          </div>

          {clients.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No clients yet. Create one to start invoicing.
            </div>
          ) : (
            <div className="space-y-1.5">
              {clients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => {
                    setEditingClient(client);
                    setClientEditorOpen(true);
                  }}
                  className="flex w-full items-center justify-between rounded-md border border-border bg-card/50 px-3 py-2 text-left transition hover:bg-accent/40"
                >
                  <div>
                    <div className="text-sm font-medium">{client.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {client.email ?? "No email"} ·{" "}
                      {typeof client.defaultHourlyRateCents === "number"
                        ? formatCurrency(client.defaultHourlyRateCents, client.currency)
                        : "No default rate"}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {client.currency}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Generate invoice</h2>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <Field label="Client">
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Start date">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="End date">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
            <Field label="VAT %">
              <Input
                type="number"
                min={0}
                max={99}
                step="0.1"
                value={vatPercent}
                onChange={(e) => setVatPercent(Number(e.target.value))}
              />
            </Field>
            <Field label="Group by">
              <Select
                value={grouping}
                onValueChange={(v) => setGrouping(v as InvoiceGrouping)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="project-day">Project per day</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Rounding">
              <Select
                value={rounding}
                onValueChange={(v) => setRounding(v as InvoiceRoundingMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No rounding</SelectItem>
                  <SelectItem value="15min">Up to 15 min</SelectItem>
                  <SelectItem value="30min">Up to 30 min</SelectItem>
                  <SelectItem value="60min">Up to 60 min</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Notes" className="col-span-2">
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes shown on the invoice"
              />
            </Field>
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={generatePreview} disabled={generating || !selectedClientId}>
              <RefreshCw className={generating ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
              {preview ? "Refresh preview" : "Generate preview"}
            </Button>
          </div>
        </Card>

        {preview && selectedClient && (
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Preview · {preview.invoice.number}</h3>
                <p className="text-xs text-muted-foreground">
                  {preview.invoice.startDate} → {preview.invoice.endDate}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportPdf(preview.invoice)}>
                  <Download className="h-3 w-3" />
                  PDF
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportJson(preview.invoice)}>
                  <Download className="h-3 w-3" />
                  JSON
                </Button>
                <Button size="sm" onClick={saveInvoice}>
                  Save invoice
                </Button>
              </div>
            </div>

            {preview.invoice.lines.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No billable hours for this period.
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">Hours</th>
                      <th className="px-3 py-2 text-right font-medium">Rate</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.invoice.lines.map((line, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">{line.description}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatHours(line.hours)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatCurrency(line.rateCents, preview.invoice.currency)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatCurrency(line.amountCents, preview.invoice.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border bg-muted/20">
                    <tr>
                      <td colSpan={3} className="px-3 py-1.5 text-right text-muted-foreground">
                        Subtotal
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                        {formatCurrency(
                          preview.invoice.subtotalCents,
                          preview.invoice.currency,
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="px-3 py-1.5 text-right text-muted-foreground">
                        VAT {preview.invoice.vatPercent}%
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                        {formatCurrency(preview.invoice.vatCents, preview.invoice.currency)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="px-3 py-1.5 text-right font-semibold">
                        Total
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                        {formatCurrency(preview.invoice.totalCents, preview.invoice.currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        )}

        <Separator />

        {settings && <CompanyDetailsForm settings={settings} onSaved={setSettings} />}

        {invoices.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Saved invoices</h2>
            <div className="space-y-1.5">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card/50 px-3 py-2 text-xs"
                >
                  <div>
                    <div className="text-sm font-medium">{inv.number}</div>
                    <div className="text-muted-foreground">
                      {inv.clientName} · {inv.issueDate} ·{" "}
                      {formatCurrency(inv.totalCents, inv.currency)}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => exportPdf(inv)}>
                      <Download className="h-3 w-3" />
                      PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => exportJson(inv)}>
                      <Download className="h-3 w-3" />
                      JSON
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteInvoice(inv)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <ClientEditor
        open={clientEditorOpen}
        onOpenChange={setClientEditorOpen}
        client={editingClient}
        onSaved={loadAll}
      />
    </div>
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
