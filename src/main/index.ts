import { app, BrowserWindow, Tray, ipcMain, nativeImage, dialog, globalShortcut, screen } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { MatchCache } from "./matching.js";
import {
  loadProjects,
  saveProjects,
  loadRules,
  saveRules,
  loadOverrides,
  saveOverrides,
  loadTracking,
  saveTracking,
  loadSettings,
  saveSettings,
  loadManualEntries,
  saveManualEntries,
  loadCalendarEvents,
  saveCalendarEvents,
  loadSuggestions,
  saveSuggestions,
  loadDismissedSuggestions,
  saveDismissedSuggestions,
  loadClients,
  saveClients,
  loadInvoices,
  saveInvoices,
  loadInvoiceSettings,
  saveInvoiceSettings,
  todayKey,
  getDateRangeBounds,
  getTrackingForRange,
} from "./storage.js";
import { scheduleReviewNotification } from "./notifications.js";
import {
  getAuthStatus as calendarAuthStatus,
  listCalendars as calendarListCalendars,
  listEvents as calendarListEvents,
  mergeCalendarEvents,
} from "./calendar.js";
import { LLMSupervisor, llmSidecarAvailable } from "./llm.js";
import { SuggestionsEngine } from "./suggestions.js";
import { buildInvoice, renderInvoicePdf, renderExactOnlineJson } from "./invoicing.js";
import {
  CALENDAR_APP_NAME,
  MANUAL_APP_NAME,
  activityKey,
  manualEntryKey,
  parseActivityKey,
  parseCalendarEventKey,
  parseManualEntryKey,
} from "@shared/types";
import type {
  Project,
  Rule,
  ProjectId,
  RuleId,
  Activity,
  TrackingState,
  CurrentActivity,
  CreateProjectInput,
  CreateRuleInput,
  UpdateRuleInput,
  CreateProjectFromActivityInput,
  AssignActivityInput,
  DateRange,
  HistoricalActivity,
  HistoricalState,
  AppSettings,
  ManualEntry,
  ManualEntryId,
  CreateManualEntryInput,
  UpdateManualEntryInput,
  DayReviewEntry,
  DayReviewProjectGroup,
  DayReviewState,
  CalendarAuthStatus,
  CalendarEvent,
  CalendarInfo,
  LlmState,
  Suggestion,
  Client,
  ClientId,
  CreateClientInput,
  UpdateClientInput,
  Invoice,
  InvoiceId,
  InvoiceSettings,
  GenerateInvoiceInput,
  InvoicePreview,
  UpdateProjectBillingInput,
} from "@shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let widget: BrowserWindow | null = null;
let dashboard: BrowserWindow | null = null;
let tray: Tray | null = null;

let projects: Project[] = [];
let rules: Rule[] = [];
let overrides: Record<string, ProjectId> = {};
let trackingDays: Record<string, Record<string, number>> = {};
let manualEntries: Record<ManualEntryId, ManualEntry> = {};
let calendarEvents: Record<string, CalendarEvent> = {};
let calendarPollIntervalId: ReturnType<typeof setInterval> | null = null;
let calendarPolling = false;
let suggestionsByKey: Record<string, Suggestion> = {};
let dismissedSuggestions: Record<string, number> = {};
let clients: Record<ClientId, Client> = {};
let invoices: Record<InvoiceId, Invoice> = {};
let invoiceSettings: InvoiceSettings;
let llmSupervisor: LLMSupervisor | null = null;
let suggestionsEngine: SuggestionsEngine | null = null;
let suggestionSweepTimer: ReturnType<typeof setInterval> | null = null;
let currentActivity: CurrentActivity | null = null;

const cache = new MatchCache();
let trackingDirty = false;
let isPaused = false;

let settings: AppSettings;
let lastActivityKey = "";
let lastActivityChangeTime = Date.now();
let isIdle = false;
let trackingIntervalId: ReturnType<typeof setInterval> | null = null;

function displayTitleFor(app: string, title: string): string {
  if (app === MANUAL_APP_NAME) {
    const entry = manualEntries[title];
    if (entry) return entry.description || "(untitled)";
  }
  if (app === CALENDAR_APP_NAME) {
    const event = calendarEvents[title];
    if (event) return event.title || "(untitled meeting)";
  }
  return title;
}

function buildTrackingState(): TrackingState {
  const today = todayKey();
  const todayData = trackingDays[today] ?? {};

  const activities: Record<string, Activity> = {};
  let totalTodaySeconds = 0;

  for (const [key, time] of Object.entries(todayData)) {
    const parsed = parseActivityKey(key);
    if (!parsed) continue;

    const match = cache.get(parsed.app, parsed.title, { rules, overrides, manualEntries, calendarEvents });
    activities[key] = {
      app: parsed.app,
      title: displayTitleFor(parsed.app, parsed.title),
      time,
      projectId: match.projectId,
      assignedBy: match.assignedBy,
      lastSeen: 0,
    };
    totalTodaySeconds += time;
  }

  return {
    activities,
    projects,
    rules,
    currentActivity,
    totalTodaySeconds,
    isPaused,
  };
}

function broadcast(): void {
  const state = buildTrackingState();
  dashboard?.webContents.send("tracking-update", state);
  widget?.webContents.send("tracking-update", state);
}

function buildHistoricalState(range: DateRange): HistoricalState {
  const { start, end } = getDateRangeBounds(range);
  const rangeDays = getTrackingForRange(trackingDays, start, end);

  const aggregated = new Map<string, number>();
  for (const dayEntries of Object.values(rangeDays)) {
    for (const [key, time] of Object.entries(dayEntries)) {
      aggregated.set(key, (aggregated.get(key) ?? 0) + time);
    }
  }

  const activities: Record<string, HistoricalActivity> = {};
  let totalSeconds = 0;

  for (const [key, totalTime] of aggregated) {
    const parsed = parseActivityKey(key);
    if (!parsed) continue;

    const match = cache.get(parsed.app, parsed.title, { rules, overrides, manualEntries, calendarEvents });
    activities[key] = {
      app: parsed.app,
      title: displayTitleFor(parsed.app, parsed.title),
      totalTime,
      projectId: match.projectId,
      assignedBy: match.assignedBy,
    };
    totalSeconds += totalTime;
  }

  return { activities, totalSeconds, dateRange: range, startDate: start, endDate: end };
}

function buildDayReviewState(date: string): DayReviewState {
  const dayData = trackingDays[date] ?? {};

  const entries: DayReviewEntry[] = [];
  let totalSeconds = 0;

  for (const [key, seconds] of Object.entries(dayData)) {
    const parsed = parseActivityKey(key);
    if (!parsed) continue;

    const match = cache.get(parsed.app, parsed.title, { rules, overrides, manualEntries, calendarEvents });
    const manualId = parseManualEntryKey(key);
    const manualEntry = manualId ? manualEntries[manualId] : undefined;
    const calendarEventId = parseCalendarEventKey(key);
    const calendarEvent = calendarEventId ? calendarEvents[calendarEventId] : undefined;

    let kind: DayReviewEntry["kind"] = "activity";
    let title = parsed.title;
    let description: string | undefined;
    if (manualEntry) {
      kind = "manual";
      title = manualEntry.description;
      description = manualEntry.description;
    } else if (calendarEvent) {
      kind = "calendar";
      title = calendarEvent.title;
    }

    const suggestion =
      match.projectId === null && match.assignedBy === "none"
        ? suggestionsByKey[key]
        : undefined;

    entries.push({
      key,
      kind,
      app: parsed.app,
      title,
      description,
      seconds,
      projectId: match.projectId,
      assignedBy: match.assignedBy,
      manualEntryId: manualId ?? undefined,
      calendarEvent: calendarEvent
        ? {
            eventId: calendarEvent.id,
            calendarId: calendarEvent.calendarId,
            calendarTitle: calendarEvent.calendarTitle,
            start: calendarEvent.start,
            end: calendarEvent.end,
            location: calendarEvent.location ?? undefined,
          }
        : undefined,
      suggestion,
    });
    totalSeconds += seconds;
  }

  const byProject = new Map<string | null, DayReviewEntry[]>();
  for (const entry of entries) {
    const bucket = byProject.get(entry.projectId) ?? [];
    bucket.push(entry);
    byProject.set(entry.projectId, bucket);
  }

  const groups: DayReviewProjectGroup[] = [];
  for (const project of projects) {
    const bucket = byProject.get(project.id);
    if (!bucket || bucket.length === 0) continue;
    bucket.sort((a, b) => b.seconds - a.seconds);
    groups.push({
      project,
      entries: bucket,
      totalSeconds: bucket.reduce((s, e) => s + e.seconds, 0),
    });
  }
  groups.sort((a, b) => b.totalSeconds - a.totalSeconds);

  const unassigned = (byProject.get(null) ?? []).sort((a, b) => b.seconds - a.seconds);

  return {
    date,
    totalSeconds,
    reviewedAt: settings.reviewedDays[date] ?? null,
    groups,
    unassigned,
  };
}

const CALENDAR_LOOKBACK_DAYS = 7;
const CALENDAR_POLL_INTERVAL_MS = 5 * 60 * 1000;

function calendarFetchRange(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - CALENDAR_LOOKBACK_DAYS);
  const fmt = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { start: fmt(start), end: fmt(today) };
}

async function runCalendarSync(): Promise<void> {
  if (calendarPolling) return;
  if (!settings.calendar.enabled) return;

  calendarPolling = true;
  try {
    const status = await calendarAuthStatus();
    if (status !== "authorized") return;

    const { start, end } = calendarFetchRange();
    const fetched = await calendarListEvents(start, end, settings.calendar.enabledCalendarIds);
    const merged = mergeCalendarEvents(
      trackingDays,
      calendarEvents,
      fetched,
      start,
      end,
      settings.calendar,
    );
    trackingDays = merged.trackingDays;
    calendarEvents = merged.events;
    saveTracking(trackingDays);
    saveCalendarEvents(calendarEvents);
    cache.invalidate();
    broadcast();
  } catch (err) {
    console.warn("Calendar sync failed:", err);
  } finally {
    calendarPolling = false;
  }
}

function startCalendarPolling(): void {
  stopCalendarPolling();
  if (!settings.calendar.enabled) return;
  void runCalendarSync();
  calendarPollIntervalId = setInterval(() => {
    void runCalendarSync();
  }, CALENDAR_POLL_INTERVAL_MS);
}

function stopCalendarPolling(): void {
  if (calendarPollIntervalId) {
    clearInterval(calendarPollIntervalId);
    calendarPollIntervalId = null;
  }
}

const SUGGESTION_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

function ensureLlmSupervisor(): LLMSupervisor {
  if (!llmSupervisor) {
    llmSupervisor = new LLMSupervisor(settings.suggestions.modelId);
    llmSupervisor.onState((state) => {
      dashboard?.webContents.send("llm-state", state);
    });
  }
  return llmSupervisor;
}

function ensureSuggestionsEngine(): SuggestionsEngine {
  if (!suggestionsEngine) {
    const llm = ensureLlmSupervisor();
    suggestionsEngine = new SuggestionsEngine({
      llm,
      getTrackingDays: () => trackingDays,
      getSettings: () => settings.suggestions,
      getProjects: () => projects,
      getOverrides: () => overrides,
      getAssignedBy: (key) => {
        const parsed = parseActivityKey(key);
        if (!parsed) return "none";
        const match = cache.get(parsed.app, parsed.title, {
          rules,
          overrides,
          manualEntries,
          calendarEvents,
        });
        return match.assignedBy;
      },
      getSuggestions: () => suggestionsByKey,
      setSuggestions: (next) => {
        suggestionsByKey = next;
        saveSuggestions(suggestionsByKey);
      },
      getDismissed: () => dismissedSuggestions,
      setDismissed: (next) => {
        dismissedSuggestions = next;
        saveDismissedSuggestions(dismissedSuggestions);
      },
      onSuggestionsChanged: () => {
        broadcast();
      },
    });
  }
  return suggestionsEngine;
}

function startSuggestions(): void {
  if (!settings.suggestions.enabled) return;
  if (!llmSidecarAvailable()) return;
  const supervisor = ensureLlmSupervisor();
  supervisor.setModelId(settings.suggestions.modelId);
  supervisor.start();
  ensureSuggestionsEngine();
  scheduleSuggestionSweep();
  suggestionsEngine?.scheduleRun();
}

function stopSuggestions(): void {
  if (suggestionSweepTimer) {
    clearInterval(suggestionSweepTimer);
    suggestionSweepTimer = null;
  }
  llmSupervisor?.stop();
}

function scheduleSuggestionSweep(): void {
  if (suggestionSweepTimer) return;
  suggestionSweepTimer = setInterval(() => {
    suggestionsEngine?.scheduleRun();
  }, SUGGESTION_SWEEP_INTERVAL_MS);
}

function clearAllCalendarEntries(): void {
  for (const day of Object.keys(trackingDays)) {
    const entries = trackingDays[day];
    for (const key of Object.keys(entries)) {
      if (parseCalendarEventKey(key) !== null) {
        delete entries[key];
      }
    }
    if (Object.keys(entries).length === 0) delete trackingDays[day];
  }
  calendarEvents = {};
  saveTracking(trackingDays);
  saveCalendarEvents(calendarEvents);
  cache.invalidate();
}

async function trackLoop(): Promise<void> {
  const activeWinModule = await import("active-win");
  const activeWindow = activeWinModule.default;

  const intervalSeconds = Math.round(settings.trackingIntervalMs / 1000);

  trackingIntervalId = setInterval(async () => {
    try {
      if (isPaused) {
        broadcast();
        return;
      }

      const win = await activeWindow();
      if (!win || !win.owner || !win.title) {
        currentActivity = null;
        return;
      }

      const app = win.owner.name;
      const title = win.title;
      const key = activityKey(app, title);

      // Idle detection
      if (key !== lastActivityKey) {
        lastActivityKey = key;
        lastActivityChangeTime = Date.now();
        isIdle = false;
      }

      if (settings.idle.enabled && !isIdle) {
        const elapsed = Date.now() - lastActivityChangeTime;
        if (elapsed > settings.idle.timeoutMinutes * 60 * 1000) {
          isIdle = true;
        }
      }

      if (isIdle) {
        const idleKey = activityKey("Idle", "Idle");
        const today = todayKey();
        if (!trackingDays[today]) trackingDays[today] = {};
        trackingDays[today][idleKey] = (trackingDays[today][idleKey] ?? 0) + intervalSeconds;
        trackingDirty = true;
        broadcast();
        return;
      }

      const today = todayKey();
      if (!trackingDays[today]) trackingDays[today] = {};
      trackingDays[today][key] = (trackingDays[today][key] ?? 0) + intervalSeconds;
      trackingDirty = true;

      const match = cache.get(app, title, { rules, overrides, manualEntries, calendarEvents });
      currentActivity = { app, title, projectId: match.projectId };

      broadcast();
    } catch (err) {
      console.error("Tracking error:", err);
    }
  }, settings.trackingIntervalMs);

  setInterval(() => {
    if (trackingDirty) {
      saveTracking(trackingDays);
      trackingDirty = false;
    }
  }, 30000);
}

function makeWidget(): void {
  const savedPos = settings.widgetPosition;
  const display = screen.getPrimaryDisplay();
  const { width: screenW } = display.workAreaSize;
  const defaultX = screenW - 320 - 40;
  const defaultY = 40;

  widget = new BrowserWindow({
    width: 320,
    height: 200,
    x: savedPos?.x ?? defaultX,
    y: savedPos?.y ?? defaultY,
    show: false,
    frame: false,
    alwaysOnTop: true,
    fullscreenable: false,
    useContentSize: true,
    resizable: false,
    movable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "../preload/index.cjs"),
    },
  });

  const widgetUrl =
    process.env.ELECTRON_RENDERER_URL
      ? `${process.env.ELECTRON_RENDERER_URL}/windows/widget/index.html`
      : `file://${path.join(__dirname, "../renderer/windows/widget/index.html")}`;

  widget.loadURL(widgetUrl);

  widget.on("moved", () => {
    if (!widget) return;
    const [x, y] = widget.getPosition();
    settings.widgetPosition = { x, y };
    saveSettings(settings);
  });

  try {
    const iconBasePath = app.isPackaged ? process.resourcesPath : app.getAppPath();
    const iconPath = path.join(iconBasePath, "assets/iconTemplate.png");
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setIgnoreDoubleClickEvents(true);

    tray.on("click", () => {
      if (!widget) return;
      if (widget.isVisible()) widget.hide();
      else {
        widget.show();
        widget.focus();
      }
    });
  } catch (err) {
    console.error("Tray setup failed:", err);
  }

  widget.on("closed", () => {
    widget = null;
  });
}

function focusReviewToday(): void {
  widget?.hide();
  const date = todayKey();
  const wasExisting = dashboard !== null;
  if (!dashboard) makeDashboard();
  else {
    if (dashboard.isMinimized()) dashboard.restore();
    dashboard.show();
    dashboard.focus();
  }
  if (!dashboard) return;

  if (wasExisting) {
    dashboard.webContents.send("focus-review", date);
  } else {
    dashboard.once("ready-to-show", () => {
      dashboard?.webContents.send("focus-review", date);
    });
  }
}

function makeDashboard(): void {
  dashboard = new BrowserWindow({
    width: 1200,
    height: 760,
    show: false,
    backgroundColor: "#0a0a0b",
    titleBarStyle: "hiddenInset",
    icon: path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), "assets/icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "../preload/index.cjs"),
    },
  });

  const dashboardUrl =
    process.env.ELECTRON_RENDERER_URL
      ? `${process.env.ELECTRON_RENDERER_URL}/windows/dashboard/index.html`
      : `file://${path.join(__dirname, "../renderer/windows/dashboard/index.html")}`;

  dashboard.loadURL(dashboardUrl);

  dashboard.once("ready-to-show", () => {
    dashboard?.show();
  });

  dashboard.on("closed", () => {
    dashboard = null;
  });
}

function registerIpc(): void {
  ipcMain.handle("get-state", () => buildTrackingState());

  ipcMain.handle("toggle-pause", (): boolean => {
    isPaused = !isPaused;
    broadcast();
    return isPaused;
  });

  ipcMain.handle("get-historical-state", (_e, range: DateRange): HistoricalState => {
    return buildHistoricalState(range);
  });

  ipcMain.handle("open-dashboard", () => {
    widget?.hide();
    if (!dashboard) makeDashboard();
    else dashboard.show();
  });

  ipcMain.handle("create-project", (_e, input: CreateProjectInput): Project => {
    const project: Project = {
      id: nanoid(10),
      name: input.name.trim(),
      color: input.color,
      createdAt: Date.now(),
      clientId: input.clientId,
      hourlyRateCents: input.hourlyRateCents,
      billable: input.billable ?? true,
    };
    projects = [...projects, project];
    saveProjects(projects);

    if (input.autoRulePattern && input.autoRulePattern.trim()) {
      const rule: Rule = {
        id: nanoid(10),
        projectId: project.id,
        type: "keyword",
        pattern: input.autoRulePattern.trim(),
        priority: 100,
      };
      rules = [...rules, rule];
      saveRules(rules);
    }

    cache.invalidate();
    broadcast();
    return project;
  });

  ipcMain.handle("rename-project", (_e, { id, name }: { id: ProjectId; name: string }): void => {
    projects = projects.map((p) => (p.id === id ? { ...p, name: name.trim() } : p));
    saveProjects(projects);
    broadcast();
  });

  ipcMain.handle("set-project-color", (_e, { id, color }: { id: ProjectId; color: string }): void => {
    projects = projects.map((p) => (p.id === id ? { ...p, color } : p));
    saveProjects(projects);
    broadcast();
  });

  ipcMain.handle("delete-project", (_e, { id }: { id: ProjectId }): void => {
    projects = projects.filter((p) => p.id !== id);
    rules = rules.filter((r) => r.projectId !== id);
    overrides = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== id));
    saveProjects(projects);
    saveRules(rules);
    saveOverrides(overrides);
    cache.invalidate();
    broadcast();
  });

  ipcMain.handle("assign-activity", (_e, { activityKey: key, projectId }: AssignActivityInput): void => {
    overrides = { ...overrides, [key]: projectId };
    saveOverrides(overrides);
    suggestionsEngine?.clearSuggestionForKey(key);
    cache.invalidate();
    broadcast();
  });

  ipcMain.handle("unassign-activity", (_e, { activityKey: key }: { activityKey: string }): void => {
    const next = { ...overrides };
    delete next[key];
    overrides = next;
    saveOverrides(overrides);
    cache.invalidate();
    broadcast();
  });

  ipcMain.handle("create-rule", (_e, input: CreateRuleInput): Rule => {
    const rule: Rule = {
      id: nanoid(10),
      projectId: input.projectId,
      type: input.type,
      pattern: input.pattern.trim(),
      priority: input.priority ?? 100,
      calendarId: input.calendarId,
    };
    rules = [...rules, rule];
    saveRules(rules);
    cache.invalidate();
    broadcast();
    return rule;
  });

  ipcMain.handle("update-rule", (_e, input: UpdateRuleInput): Rule | null => {
    let updated: Rule | null = null;
    rules = rules.map((r) => {
      if (r.id !== input.id) return r;
      const next: Rule = {
        ...r,
        type: input.type ?? r.type,
        pattern: input.pattern !== undefined ? input.pattern.trim() : r.pattern,
        priority: input.priority ?? r.priority,
      };
      if (input.calendarId !== undefined) {
        next.calendarId = input.calendarId ?? undefined;
      }
      updated = next;
      return next;
    });
    saveRules(rules);
    cache.invalidate();
    broadcast();
    return updated;
  });

  ipcMain.handle("delete-rule", (_e, { id }: { id: RuleId }): void => {
    rules = rules.filter((r) => r.id !== id);
    saveRules(rules);
    cache.invalidate();
    broadcast();
  });

  ipcMain.handle(
    "create-project-from-activity",
    (_e, input: CreateProjectFromActivityInput): Project => {
      const project: Project = {
        id: nanoid(10),
        name: input.name.trim(),
        color: input.color,
        createdAt: Date.now(),
        billable: true,
      };
      projects = [...projects, project];
      saveProjects(projects);

      if (input.autoRulePattern && input.autoRulePattern.trim()) {
        const rule: Rule = {
          id: nanoid(10),
          projectId: project.id,
          type: "keyword",
          pattern: input.autoRulePattern.trim(),
          priority: 100,
        };
        rules = [...rules, rule];
        saveRules(rules);
      }

      overrides = { ...overrides, [input.activityKey]: project.id };
      saveOverrides(overrides);

      cache.invalidate();
      broadcast();
      return project;
    },
  );

  ipcMain.handle(
    "export-data",
    async (
      _e,
      { format, range }: { format: "csv" | "json"; range: DateRange },
    ): Promise<{ success: boolean; filePath?: string }> => {
      const ext = format === "csv" ? "csv" : "json";
      const result = await dialog.showSaveDialog({
        title: "Export Data",
        defaultPath: `no-time-export.${ext}`,
        filters: [
          format === "csv"
            ? { name: "CSV Files", extensions: ["csv"] }
            : { name: "JSON Files", extensions: ["json"] },
        ],
      });

      if (result.canceled || !result.filePath) return { success: false };

      const { start, end } = getDateRangeBounds(range);
      const rangeDays = getTrackingForRange(trackingDays, start, end);

      const projectMap = new Map(projects.map((p) => [p.id, p]));

      interface ActivityRow {
        date: string;
        app: string;
        title: string;
        projectName: string;
        seconds: number;
      }

      const rows: ActivityRow[] = [];
      for (const [day, entries] of Object.entries(rangeDays)) {
        for (const [key, seconds] of Object.entries(entries)) {
          const parsed = parseActivityKey(key);
          if (!parsed) continue;

          const match = cache.get(parsed.app, parsed.title, { rules, overrides, manualEntries, calendarEvents });
          const project = match.projectId ? projectMap.get(match.projectId) : undefined;
          rows.push({
            date: day,
            app: parsed.app,
            title: parsed.title,
            projectName: project?.name ?? "",
            seconds,
          });
        }
      }

      let content: string;
      if (format === "csv") {
        const csvEscape = (val: string): string => {
          if (val.includes(",") || val.includes('"') || val.includes("\n")) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        };
        const header = "date,app,title,project,seconds";
        const lines = rows.map(
          (r) =>
            `${csvEscape(r.date)},${csvEscape(r.app)},${csvEscape(r.title)},${csvEscape(r.projectName)},${r.seconds}`,
        );
        content = [header, ...lines].join("\n");
      } else {
        content = JSON.stringify(
          {
            exportDate: new Date().toISOString(),
            dateRange: range,
            startDate: start,
            endDate: end,
            projects,
            rules,
            activities: rows,
          },
          null,
          2,
        );
      }

      try {
        await fs.writeFile(result.filePath, content, "utf-8");
        return { success: true, filePath: result.filePath };
      } catch {
        return { success: false };
      }
    },
  );

  ipcMain.handle("get-settings", (): AppSettings => settings);

  ipcMain.handle(
    "update-settings",
    async (_e, partial: Partial<AppSettings>): Promise<AppSettings> => {
      const prevInterval = settings.trackingIntervalMs;
      const prevNotification = settings.reviewNotification;
      const prevCalendar = settings.calendar;
      const prevSuggestions = settings.suggestions;
      settings = {
        ...settings,
        ...partial,
        idle: { ...settings.idle, ...(partial.idle ?? {}) },
        reviewNotification: {
          ...settings.reviewNotification,
          ...(partial.reviewNotification ?? {}),
        },
        calendar: { ...settings.calendar, ...(partial.calendar ?? {}) },
        suggestions: { ...settings.suggestions, ...(partial.suggestions ?? {}) },
      };
      saveSettings(settings);
      if (partial.trackingIntervalMs && partial.trackingIntervalMs !== prevInterval && trackingIntervalId) {
        clearInterval(trackingIntervalId);
        trackLoop();
      }
      if (
        partial.reviewNotification &&
        (prevNotification.enabled !== settings.reviewNotification.enabled ||
          prevNotification.time !== settings.reviewNotification.time)
      ) {
        scheduleReviewNotification(settings.reviewNotification, focusReviewToday);
      }
      if (partial.calendar) {
        const calendarChanged =
          prevCalendar.enabled !== settings.calendar.enabled ||
          prevCalendar.includeAllDay !== settings.calendar.includeAllDay ||
          prevCalendar.enabledCalendarIds.join("|") !==
            settings.calendar.enabledCalendarIds.join("|");
        if (calendarChanged) {
          if (!settings.calendar.enabled) {
            stopCalendarPolling();
            clearAllCalendarEntries();
            broadcast();
          } else {
            startCalendarPolling();
          }
        }
      }
      if (partial.suggestions) {
        const suggestionsChanged =
          prevSuggestions.enabled !== settings.suggestions.enabled ||
          prevSuggestions.modelId !== settings.suggestions.modelId;
        if (suggestionsChanged) {
          if (settings.suggestions.enabled) {
            startSuggestions();
          } else {
            stopSuggestions();
            suggestionsByKey = {};
            saveSuggestions(suggestionsByKey);
            broadcast();
          }
        }
      }
      return settings;
    },
  );

  ipcMain.handle("get-review-state", (_e, date: string): DayReviewState => {
    return buildDayReviewState(date);
  });

  ipcMain.handle(
    "calendar-auth-status",
    async (_e, options?: { request?: boolean }): Promise<CalendarAuthStatus> => {
      try {
        return await calendarAuthStatus(options);
      } catch (err) {
        console.warn("calendar auth status failed:", err);
        return "unavailable";
      }
    },
  );

  ipcMain.handle("calendar-list", async (): Promise<CalendarInfo[]> => {
    try {
      return await calendarListCalendars();
    } catch (err) {
      console.warn("calendar list failed:", err);
      return [];
    }
  });

  ipcMain.handle("calendar-sync", async (): Promise<void> => {
    await runCalendarSync();
  });

  ipcMain.handle("llm-state", (): LlmState => {
    if (!llmSidecarAvailable()) {
      return {
        status: "unavailable",
        modelId: null,
        message: "LLM sidecar binary not found. Run `npm run build:sidecars`.",
      };
    }
    if (!settings.suggestions.enabled) {
      return { status: "disabled", modelId: null };
    }
    return ensureLlmSupervisor().getState();
  });

  ipcMain.handle("llm-restart", (): void => {
    if (!settings.suggestions.enabled) return;
    ensureLlmSupervisor().restart();
  });

  ipcMain.handle("get-suggestions", (): Record<string, Suggestion> => {
    return suggestionsByKey;
  });

  ipcMain.handle(
    "accept-suggestion",
    (_e, activityKey: string): Suggestion | null => {
      const accepted = suggestionsEngine?.acceptSuggestion(activityKey) ?? null;
      if (accepted) {
        overrides = { ...overrides, [activityKey]: accepted.projectId };
        saveOverrides(overrides);
        cache.invalidate();
        broadcast();
      }
      return accepted;
    },
  );

  ipcMain.handle("dismiss-suggestion", (_e, activityKey: string): void => {
    suggestionsEngine?.dismissSuggestion(activityKey);
  });

  ipcMain.handle(
    "clear-dismissed-suggestions",
    (): void => {
      dismissedSuggestions = {};
      saveDismissedSuggestions(dismissedSuggestions);
      suggestionsEngine?.scheduleRun();
      broadcast();
    },
  );

  ipcMain.handle("run-suggestion-sweep", (): void => {
    suggestionsEngine?.scheduleRun();
  });

  ipcMain.handle("list-clients", (): Client[] => Object.values(clients));

  ipcMain.handle("create-client", (_e, input: CreateClientInput): Client => {
    const id = nanoid(10);
    const client: Client = {
      id,
      name: input.name.trim(),
      email: input.email,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      postalCode: input.postalCode,
      country: input.country,
      vatNumber: input.vatNumber,
      currency: input.currency ?? "EUR",
      defaultHourlyRateCents: input.defaultHourlyRateCents,
      createdAt: Date.now(),
    };
    clients = { ...clients, [id]: client };
    saveClients(clients);
    broadcast();
    return client;
  });

  ipcMain.handle("update-client", (_e, input: UpdateClientInput): Client | null => {
    const existing = clients[input.id];
    if (!existing) return null;
    const updated: Client = {
      ...existing,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      email: input.email !== undefined ? input.email : existing.email,
      addressLine1:
        input.addressLine1 !== undefined ? input.addressLine1 : existing.addressLine1,
      addressLine2:
        input.addressLine2 !== undefined ? input.addressLine2 : existing.addressLine2,
      city: input.city !== undefined ? input.city : existing.city,
      postalCode:
        input.postalCode !== undefined ? input.postalCode : existing.postalCode,
      country: input.country !== undefined ? input.country : existing.country,
      vatNumber: input.vatNumber !== undefined ? input.vatNumber : existing.vatNumber,
      currency: input.currency !== undefined ? input.currency : existing.currency,
      defaultHourlyRateCents:
        input.defaultHourlyRateCents === null
          ? undefined
          : input.defaultHourlyRateCents ?? existing.defaultHourlyRateCents,
    };
    clients = { ...clients, [input.id]: updated };
    saveClients(clients);
    broadcast();
    return updated;
  });

  ipcMain.handle("delete-client", (_e, id: ClientId): void => {
    const { [id]: _removed, ...rest } = clients;
    clients = rest;
    saveClients(clients);
    projects = projects.map((p) =>
      p.clientId === id ? { ...p, clientId: undefined } : p,
    );
    saveProjects(projects);
    cache.invalidate();
    broadcast();
  });

  ipcMain.handle(
    "update-project-billing",
    (_e, input: UpdateProjectBillingInput): Project | null => {
      let updated: Project | null = null;
      projects = projects.map((p) => {
        if (p.id !== input.id) return p;
        const next: Project = { ...p };
        if (input.clientId !== undefined) {
          next.clientId = input.clientId === null ? undefined : input.clientId;
        }
        if (input.hourlyRateCents !== undefined) {
          next.hourlyRateCents =
            input.hourlyRateCents === null ? undefined : input.hourlyRateCents;
        }
        if (input.billable !== undefined) {
          next.billable = input.billable;
        }
        updated = next;
        return next;
      });
      saveProjects(projects);
      broadcast();
      return updated;
    },
  );

  ipcMain.handle(
    "get-invoice-settings",
    (): InvoiceSettings => invoiceSettings,
  );

  ipcMain.handle(
    "update-invoice-settings",
    (_e, partial: Partial<InvoiceSettings>): InvoiceSettings => {
      invoiceSettings = {
        ...invoiceSettings,
        ...partial,
        company: { ...invoiceSettings.company, ...(partial.company ?? {}) },
      };
      saveInvoiceSettings(invoiceSettings);
      return invoiceSettings;
    },
  );

  ipcMain.handle("list-invoices", (): Invoice[] =>
    Object.values(invoices).sort((a, b) => b.createdAt - a.createdAt),
  );

  ipcMain.handle(
    "generate-invoice-preview",
    (_e, input: GenerateInvoiceInput): InvoicePreview => {
      const client = clients[input.clientId];
      if (!client) {
        throw new Error("Client not found");
      }
      const grouping = input.grouping ?? invoiceSettings.defaultGrouping;
      const rounding = input.rounding ?? invoiceSettings.defaultRounding;
      const invoiceNumber =
        input.invoiceNumber?.trim() ||
        `${invoiceSettings.numberPrefix}${invoiceSettings.nextNumber
          .toString()
          .padStart(4, "0")}`;
      return buildInvoice({
        client,
        projects,
        trackingDays,
        ctx: {
          projects,
          overrides,
          manualEntries,
          calendarEvents,
          rules,
        },
        startDate: input.startDate,
        endDate: input.endDate,
        grouping,
        rounding,
        invoiceSettings,
        input,
        invoiceNumber,
      });
    },
  );

  ipcMain.handle(
    "save-invoice",
    (_e, invoice: Invoice): Invoice => {
      invoices = { ...invoices, [invoice.id]: invoice };
      saveInvoices(invoices);
      if (invoice.number.startsWith(invoiceSettings.numberPrefix)) {
        const suffix = invoice.number.slice(invoiceSettings.numberPrefix.length);
        const parsed = parseInt(suffix, 10);
        if (!Number.isNaN(parsed) && parsed >= invoiceSettings.nextNumber) {
          invoiceSettings = { ...invoiceSettings, nextNumber: parsed + 1 };
          saveInvoiceSettings(invoiceSettings);
        }
      }
      return invoice;
    },
  );

  ipcMain.handle(
    "delete-invoice",
    (_e, id: InvoiceId): void => {
      const { [id]: _removed, ...rest } = invoices;
      invoices = rest;
      saveInvoices(invoices);
    },
  );

  ipcMain.handle(
    "export-invoice-pdf",
    async (_e, invoice: Invoice): Promise<{ success: boolean; filePath?: string }> => {
      const result = await dialog.showSaveDialog({
        title: "Export Invoice PDF",
        defaultPath: `${invoice.number}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (result.canceled || !result.filePath) return { success: false };
      try {
        const bytes = await renderInvoicePdf(invoice);
        await fs.writeFile(result.filePath, bytes);
        return { success: true, filePath: result.filePath };
      } catch (err) {
        console.error("invoice pdf export failed", err);
        return { success: false };
      }
    },
  );

  ipcMain.handle(
    "export-invoice-json",
    async (_e, invoice: Invoice): Promise<{ success: boolean; filePath?: string }> => {
      const result = await dialog.showSaveDialog({
        title: "Export Invoice JSON (Exact Online)",
        defaultPath: `${invoice.number}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) return { success: false };
      try {
        const text = renderExactOnlineJson(invoice);
        await fs.writeFile(result.filePath, text, "utf-8");
        return { success: true, filePath: result.filePath };
      } catch (err) {
        console.error("invoice json export failed", err);
        return { success: false };
      }
    },
  );

  ipcMain.handle("mark-day-reviewed", (_e, date: string): AppSettings => {
    settings = {
      ...settings,
      reviewedDays: { ...settings.reviewedDays, [date]: Date.now() },
    };
    saveSettings(settings);
    return settings;
  });

  ipcMain.handle("unmark-day-reviewed", (_e, date: string): AppSettings => {
    const { [date]: _removed, ...rest } = settings.reviewedDays;
    settings = { ...settings, reviewedDays: rest };
    saveSettings(settings);
    return settings;
  });

  ipcMain.handle(
    "add-manual-entry",
    (_e, input: CreateManualEntryInput): ManualEntry => {
      const id = nanoid(10);
      const entry: ManualEntry = {
        id,
        date: input.date,
        description: input.description.trim(),
        seconds: Math.max(0, Math.round(input.seconds)),
        projectId: input.projectId,
        createdAt: Date.now(),
      };
      manualEntries = { ...manualEntries, [id]: entry };
      saveManualEntries(manualEntries);

      if (!trackingDays[input.date]) trackingDays[input.date] = {};
      trackingDays[input.date][manualEntryKey(id)] = entry.seconds;
      saveTracking(trackingDays);

      cache.invalidate();
      broadcast();
      return entry;
    },
  );

  ipcMain.handle(
    "update-manual-entry",
    (_e, input: UpdateManualEntryInput): ManualEntry | null => {
      const existing = manualEntries[input.id];
      if (!existing) return null;

      const updated: ManualEntry = {
        ...existing,
        description:
          input.description !== undefined ? input.description.trim() : existing.description,
        seconds:
          input.seconds !== undefined
            ? Math.max(0, Math.round(input.seconds))
            : existing.seconds,
        projectId: input.projectId !== undefined ? input.projectId : existing.projectId,
      };
      manualEntries = { ...manualEntries, [input.id]: updated };
      saveManualEntries(manualEntries);

      if (!trackingDays[existing.date]) trackingDays[existing.date] = {};
      trackingDays[existing.date][manualEntryKey(input.id)] = updated.seconds;
      saveTracking(trackingDays);

      cache.invalidate();
      broadcast();
      return updated;
    },
  );

  ipcMain.handle("delete-manual-entry", (_e, id: ManualEntryId): void => {
    const existing = manualEntries[id];
    if (!existing) return;

    const { [id]: _removed, ...rest } = manualEntries;
    manualEntries = rest;
    saveManualEntries(manualEntries);

    const dayData = trackingDays[existing.date];
    if (dayData) {
      const key = manualEntryKey(id);
      const { [key]: _removedSeconds, ...restDay } = dayData;
      trackingDays[existing.date] = restDay;
      saveTracking(trackingDays);
    }

    cache.invalidate();
    broadcast();
  });

  ipcMain.handle("clear-today-data", (): void => {
    const today = todayKey();
    delete trackingDays[today];
    saveTracking(trackingDays);
    cache.invalidate();
    broadcast();
  });

  ipcMain.handle("clear-all-data", (): void => {
    trackingDays = {};
    saveTracking(trackingDays);
    cache.invalidate();
    broadcast();
  });

  ipcMain.handle("get-data-directory", (): string => {
    return app.getPath("userData");
  });

  ipcMain.handle("get-app-version", (): string => {
    return app.getVersion();
  });
}

app.whenReady().then(async () => {
  projects = loadProjects();
  rules = loadRules();
  overrides = loadOverrides();
  trackingDays = loadTracking();
  manualEntries = loadManualEntries();
  calendarEvents = loadCalendarEvents();
  suggestionsByKey = loadSuggestions();
  dismissedSuggestions = loadDismissedSuggestions();
  clients = loadClients();
  invoices = loadInvoices();
  invoiceSettings = loadInvoiceSettings();
  settings = loadSettings();

  scheduleReviewNotification(settings.reviewNotification, focusReviewToday);
  startCalendarPolling();
  if (settings.suggestions.enabled && llmSidecarAvailable()) {
    startSuggestions();
  }

  if (process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(
      path.join(process.cwd(), "assets/icon.png"),
    );
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }

  registerIpc();
  makeWidget();
  makeDashboard();

  globalShortcut.register("CommandOrControl+Shift+T", () => {
    if (!widget) return;
    if (widget.isVisible()) widget.hide();
    else {
      widget.show();
      widget.focus();
    }
  });

  globalShortcut.register("CommandOrControl+Shift+P", () => {
    isPaused = !isPaused;
    broadcast();
  });

  if (app.isPackaged) {
    try {
      const { autoUpdater } = await import("electron-updater");
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on("update-available", () => {
        dashboard?.webContents.send("update-available");
      });
      autoUpdater.on("update-downloaded", () => {
        dashboard?.webContents.send("update-downloaded");
      });
      ipcMain.handle("install-update", () => {
        autoUpdater.quitAndInstall();
      });
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    } catch (err) {
      console.warn("Auto-update not available:", err);
    }
  } else {
    ipcMain.handle("install-update", () => {});
  }

  await trackLoop();
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  stopCalendarPolling();
  stopSuggestions();
  if (trackingDirty) saveTracking(trackingDays);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
