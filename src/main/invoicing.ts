import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type {
  Client,
  CompanyDetails,
  GenerateInvoiceInput,
  Invoice,
  InvoiceLine,
  InvoicePreview,
  InvoiceRoundingMode,
  InvoiceSettings,
  Project,
} from "@shared/types";
import {
  CALENDAR_APP_NAME,
  MANUAL_APP_NAME,
  parseActivityKey,
  parseCalendarEventKey,
} from "@shared/types";

interface CategorizeContext {
  projects: Project[];
  overrides: Record<string, string>;
  manualEntries: Record<string, { projectId: string | null }>;
  calendarEvents: Record<string, { calendarId: string }>;
  rules: {
    type: "keyword" | "app" | "calendar";
    projectId: string;
    pattern: string;
    priority: number;
    calendarId?: string;
  }[];
}

function projectIdForKey(key: string, ctx: CategorizeContext): string | null {
  const parsed = parseActivityKey(key);
  if (!parsed) return null;

  if (parsed.app === MANUAL_APP_NAME) {
    const manual = ctx.manualEntries[parsed.title];
    return manual ? manual.projectId : null;
  }

  if (parsed.app === CALENDAR_APP_NAME) {
    const override = ctx.overrides[key];
    if (override) return override;
    const eventId = parseCalendarEventKey(key);
    const event = eventId ? ctx.calendarEvents[eventId] : undefined;
    if (!event) return null;
    const sorted = [...ctx.rules]
      .filter((r) => r.type === "calendar")
      .sort((a, b) => a.priority - b.priority);
    for (const rule of sorted) {
      const hasCal = Boolean(rule.calendarId);
      const hasKw = rule.pattern.length > 0;
      if (!hasCal && !hasKw) continue;
      if (hasCal && rule.calendarId !== event.calendarId) continue;
      return rule.projectId;
    }
    return null;
  }

  const override = ctx.overrides[key];
  if (override) return override;

  const appLower = parsed.app.toLowerCase();
  const titleLower = parsed.title.toLowerCase();
  const sorted = [...ctx.rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    if (rule.type === "calendar") continue;
    const pattern = rule.pattern.toLowerCase();
    if (!pattern) continue;
    if (rule.type === "app" && appLower === pattern) return rule.projectId;
    if (
      rule.type === "keyword" &&
      (titleLower.includes(pattern) || appLower.includes(pattern))
    ) {
      return rule.projectId;
    }
  }
  return null;
}

function roundSeconds(seconds: number, mode: InvoiceRoundingMode): number {
  if (mode === "none") return seconds;
  const bucket =
    mode === "15min" ? 900 : mode === "30min" ? 1800 : mode === "60min" ? 3600 : 0;
  if (bucket === 0) return seconds;
  return Math.ceil(seconds / bucket) * bucket;
}

export interface AggregateInvoiceDeps {
  client: Client;
  projects: Project[];
  trackingDays: Record<string, Record<string, number>>;
  ctx: CategorizeContext;
  startDate: string;
  endDate: string;
  grouping: "project" | "project-day";
  rounding: InvoiceRoundingMode;
}

export function aggregateInvoiceLines(deps: AggregateInvoiceDeps): {
  lines: InvoiceLine[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const projectById = new Map(deps.projects.map((p) => [p.id, p]));

  const clientProjectIds = new Set(
    deps.projects.filter((p) => p.clientId === deps.client.id).map((p) => p.id),
  );

  interface Bucket {
    key: string;
    description: string;
    projectId: string;
    day?: string;
    seconds: number;
  }
  const buckets = new Map<string, Bucket>();

  for (const [day, entries] of Object.entries(deps.trackingDays)) {
    if (day < deps.startDate || day > deps.endDate) continue;
    for (const [activityKey, seconds] of Object.entries(entries)) {
      if (seconds <= 0) continue;
      const projectId = projectIdForKey(activityKey, deps.ctx);
      if (!projectId || !clientProjectIds.has(projectId)) continue;
      const project = projectById.get(projectId);
      if (!project || !project.billable) continue;
      const bucketKey =
        deps.grouping === "project" ? projectId : `${projectId}::${day}`;
      const description =
        deps.grouping === "project"
          ? project.name
          : `${project.name} — ${day}`;
      const existing = buckets.get(bucketKey);
      if (existing) {
        existing.seconds += seconds;
      } else {
        buckets.set(bucketKey, {
          key: bucketKey,
          description,
          projectId,
          day: deps.grouping === "project-day" ? day : undefined,
          seconds,
        });
      }
    }
  }

  const lines: InvoiceLine[] = [];
  for (const bucket of buckets.values()) {
    const project = projectById.get(bucket.projectId);
    if (!project) continue;
    const rate =
      project.hourlyRateCents ?? deps.client.defaultHourlyRateCents ?? 0;
    if (!rate) {
      warnings.push(
        `No hourly rate for "${project.name}" — add one on the project or client.`,
      );
    }
    const billableSeconds = roundSeconds(bucket.seconds, deps.rounding);
    const hours = billableSeconds / 3600;
    lines.push({
      description: bucket.description,
      seconds: bucket.seconds,
      billableSeconds,
      hours,
      rateCents: rate,
      amountCents: Math.round(hours * rate),
    });
  }

  lines.sort((a, b) => a.description.localeCompare(b.description));
  return { lines, warnings };
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const d = new Date(dateKey);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface BuildInvoiceDeps extends AggregateInvoiceDeps {
  invoiceSettings: InvoiceSettings;
  input: GenerateInvoiceInput;
  invoiceNumber: string;
}

export function buildInvoice(deps: BuildInvoiceDeps): InvoicePreview {
  const { lines, warnings } = aggregateInvoiceLines(deps);
  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const vatPercent = deps.input.vatPercent ?? deps.invoiceSettings.defaultVatPercent;
  const vatCents = Math.round((subtotalCents * vatPercent) / 100);
  const totalCents = subtotalCents + vatCents;

  const issueDate = deps.input.issueDate ?? deps.endDate;
  const dueDate = deps.input.dueDate ?? addDaysToDateKey(issueDate, 30);

  const invoice: Invoice = {
    id: `inv_${Date.now()}`,
    number: deps.invoiceNumber,
    clientId: deps.client.id,
    clientName: deps.client.name,
    startDate: deps.startDate,
    endDate: deps.endDate,
    issueDate,
    dueDate,
    currency: deps.client.currency,
    grouping: deps.grouping,
    rounding: deps.rounding,
    vatPercent,
    notes: deps.input.notes,
    lines,
    subtotalCents,
    vatCents,
    totalCents,
    company: deps.invoiceSettings.company,
    createdAt: Date.now(),
  };

  if (lines.length === 0) {
    warnings.push("No billable time found in the selected range for this client.");
  }

  return { invoice, warnings };
}

export function formatCurrency(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export async function renderInvoicePdf(invoice: Invoice): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margin = 40;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = height - margin;
  const drawText = (
    text: string,
    opts: { size?: number; bold?: boolean; x?: number; color?: [number, number, number] } = {},
  ) => {
    page.drawText(text, {
      x: opts.x ?? margin,
      y,
      size: opts.size ?? 10,
      font: opts.bold ? fontBold : font,
      color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.1),
    });
  };
  const lineBreak = (n = 14) => {
    y -= n;
  };

  drawText("INVOICE", { size: 26, bold: true });
  lineBreak(30);
  drawText(`#${invoice.number}`, { size: 14, bold: true });
  lineBreak(24);

  const companyLines = companyBlock(invoice.company);
  const clientLines = clientBlock(invoice);

  const blockY = y;
  let fromY = blockY;
  for (const line of companyLines) {
    page.drawText(line, { x: margin, y: fromY, size: 10, font });
    fromY -= 14;
  }
  let toY = blockY;
  const toX = width / 2 + 20;
  page.drawText("Bill to", {
    x: toX,
    y: toY,
    size: 8,
    font: fontBold,
    color: rgb(0.4, 0.4, 0.4),
  });
  toY -= 14;
  for (const line of clientLines) {
    page.drawText(line, { x: toX, y: toY, size: 10, font });
    toY -= 14;
  }

  y = Math.min(fromY, toY) - 10;
  lineBreak(18);

  drawText(`Issue date:  ${invoice.issueDate}`);
  lineBreak();
  drawText(`Due date:    ${invoice.dueDate}`);
  lineBreak();
  drawText(`Period:      ${invoice.startDate} — ${invoice.endDate}`);
  lineBreak(22);

  drawText("Description", { bold: true });
  page.drawText("Hours", { x: width - margin - 190, y, size: 10, font: fontBold });
  page.drawText("Rate", { x: width - margin - 130, y, size: 10, font: fontBold });
  page.drawText("Amount", { x: width - margin - 60, y, size: 10, font: fontBold });
  lineBreak(6);
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  lineBreak(14);

  for (const line of invoice.lines) {
    const hoursLabel = line.hours.toFixed(2);
    drawText(line.description);
    page.drawText(hoursLabel, { x: width - margin - 190, y, size: 10, font });
    page.drawText(formatCurrency(line.rateCents, invoice.currency), {
      x: width - margin - 130,
      y,
      size: 10,
      font,
    });
    page.drawText(formatCurrency(line.amountCents, invoice.currency), {
      x: width - margin - 60,
      y,
      size: 10,
      font,
    });
    lineBreak();
  }

  lineBreak(10);
  page.drawLine({
    start: { x: width / 2, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  lineBreak(14);

  const drawTotalRow = (label: string, value: string, bold = false) => {
    page.drawText(label, { x: width / 2 + 10, y, size: 10, font: bold ? fontBold : font });
    page.drawText(value, { x: width - margin - 60, y, size: 10, font: bold ? fontBold : font });
    lineBreak();
  };
  drawTotalRow("Subtotal", formatCurrency(invoice.subtotalCents, invoice.currency));
  drawTotalRow(
    `VAT ${invoice.vatPercent}%`,
    formatCurrency(invoice.vatCents, invoice.currency),
  );
  drawTotalRow("Total", formatCurrency(invoice.totalCents, invoice.currency), true);

  if (invoice.notes) {
    lineBreak(24);
    drawText("Notes", { bold: true });
    lineBreak();
    const lines = wrap(invoice.notes, 90);
    for (const line of lines) {
      drawText(line);
      lineBreak();
    }
  }

  return pdf.save();
}

function companyBlock(company: CompanyDetails): string[] {
  const lines: string[] = [];
  if (company.name) lines.push(company.name);
  if (company.addressLine1) lines.push(company.addressLine1);
  if (company.addressLine2) lines.push(company.addressLine2);
  const cityLine = [company.postalCode, company.city].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  if (company.country) lines.push(company.country);
  if (company.email) lines.push(company.email);
  if (company.vatNumber) lines.push(`VAT: ${company.vatNumber}`);
  if (company.iban) lines.push(`IBAN: ${company.iban}`);
  return lines;
}

function clientBlock(invoice: Invoice): string[] {
  return [invoice.clientName];
}

function wrap(text: string, maxLen: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxLen) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function renderExactOnlineJson(invoice: Invoice): string {
  const payload = {
    schemaVersion: 1,
    source: "no-time",
    invoice: {
      number: invoice.number,
      currency: invoice.currency,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      client: {
        name: invoice.clientName,
      },
      lines: invoice.lines.map((line) => ({
        description: line.description,
        quantity: Number(line.hours.toFixed(4)),
        unit: "hour",
        unitPriceCents: line.rateCents,
        amountCents: line.amountCents,
      })),
      subtotalCents: invoice.subtotalCents,
      vatPercent: invoice.vatPercent,
      vatCents: invoice.vatCents,
      totalCents: invoice.totalCents,
      notes: invoice.notes ?? null,
      company: invoice.company,
    },
  };
  return JSON.stringify(payload, null, 2);
}
