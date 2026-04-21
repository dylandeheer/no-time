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
  loadSessionsByDay,
  saveSessionsByDay,
  migrateTrackingToSessionsIfNeeded,
  todayKey,
  getDateRangeBounds,
} from "./storage.js";
import { scheduleReviewNotification } from "./notifications.js";
import {
  getAuthStatus as calendarAuthStatus,
  listCalendars as calendarListCalendars,
  listEvents as calendarListEvents,
} from "./calendar.js";
import {
  applyCalendarOverlay,
  dayKeyForMs,
  derivedFlatMap,
  derivedFlatMapForDay,
  makeMatchFn,
  sessionDurationSeconds,
  upsertTick,
} from "./sessions.js";
import { LLMSupervisor, llmSidecarAvailable } from "./llm.js";
import { SuggestionsEngine } from "./suggestions.js";
import {
  CALENDAR_APP_NAME,
  MANUAL_APP_NAME,
  activityKey,
  parseActivityKey,
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
  Session,
} from "@shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let widget: BrowserWindow | null = null;
let dashboard: BrowserWindow | null = null;
let tray: Tray | null = null;

let projects: Project[] = [];
let rules: Rule[] = [];
let overrides: Record<string, ProjectId> = {};
let sessionsByDay: Record<string, Session[]> = {};
let manualEntries: Record<ManualEntryId, ManualEntry> = {};
let calendarEvents: Record<string, CalendarEvent> = {};
let calendarPollIntervalId: ReturnType<typeof setInterval> | null = null;
let calendarPolling = false;
let suggestionsByKey: Record<string, Suggestion> = {};
let dismissedSuggestions: Record<string, number> = {};
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

function shouldHideActivity(app: string, seconds: number): boolean {
  if (app === MANUAL_APP_NAME || app === CALENDAR_APP_NAME) return false;
  return seconds < settings.minActivitySeconds;
}

interface AggregatedEntry {
  key: string;
  app: string;
  title: string;
  seconds: number;
  projectId: ProjectId | null;
  assignedBy: Activity["assignedBy"];
}

function aggregateDay(date: string): {
  entries: Map<string, AggregatedEntry>;
  totalSeconds: number;
} {
  const sessions = sessionsByDay[date] ?? [];
  const matchFor = makeMatchFn({ rules, overrides, manualEntries, calendarEvents });
  const resolved = applyCalendarOverlay(sessions, date, calendarEvents, matchFor);

  const entries = new Map<string, AggregatedEntry>();
  let totalSeconds = 0;

  for (const { session, match } of resolved) {
    const seconds = sessionDurationSeconds(session);
    totalSeconds += seconds;

    let key: string;
    if (session.source === "manual" && session.manualEntryId) {
      key = `Manual entry::${session.manualEntryId}`;
    } else if (session.source === "calendar" && session.calendarEventId) {
      key = `Calendar::${session.calendarEventId}`;
    } else if (session.source === "idle") {
      key = "Idle::Idle";
    } else {
      key = `${session.app}::${session.title}`;
    }

    const existing = entries.get(key);
    if (existing) {
      existing.seconds += seconds;
    } else {
      entries.set(key, {
        key,
        app: session.app,
        title: session.title,
        seconds,
        projectId: match.projectId,
        assignedBy: match.assignedBy,
      });
    }
  }

  return { entries, totalSeconds };
}

function buildTrackingState(): TrackingState {
  const today = todayKey();
  const { entries, totalSeconds } = aggregateDay(today);

  const activities: Record<string, Activity> = {};

  for (const [key, entry] of entries) {
    if (shouldHideActivity(entry.app, entry.seconds)) continue;
    activities[key] = {
      key,
      app: entry.app,
      title: displayTitleFor(entry.app, entry.title),
      time: entry.seconds,
      projectId: entry.projectId,
      assignedBy: entry.assignedBy,
      lastSeen: 0,
    };
  }

  return {
    activities,
    projects,
    rules,
    currentActivity,
    totalTodaySeconds: totalSeconds,
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

  interface Accum {
    app: string;
    title: string;
    totalSeconds: number;
    projectId: ProjectId | null;
    assignedBy: Activity["assignedBy"];
  }
  const aggregated = new Map<string, Accum>();
  let totalSeconds = 0;

  for (const day of Object.keys(sessionsByDay)) {
    if (day < start || day > end) continue;
    const dayAgg = aggregateDay(day);
    totalSeconds += dayAgg.totalSeconds;
    for (const [key, entry] of dayAgg.entries) {
      const existing = aggregated.get(key);
      if (existing) {
        existing.totalSeconds += entry.seconds;
      } else {
        aggregated.set(key, {
          app: entry.app,
          title: entry.title,
          totalSeconds: entry.seconds,
          projectId: entry.projectId,
          assignedBy: entry.assignedBy,
        });
      }
    }
  }

  const activities: Record<string, HistoricalActivity> = {};
  for (const [key, accum] of aggregated) {
    if (shouldHideActivity(accum.app, accum.totalSeconds)) continue;
    activities[key] = {
      key,
      app: accum.app,
      title: displayTitleFor(accum.app, accum.title),
      totalTime: accum.totalSeconds,
      projectId: accum.projectId,
      assignedBy: accum.assignedBy,
    };
  }

  return { activities, totalSeconds, dateRange: range, startDate: start, endDate: end };
}

function buildDayReviewState(date: string): DayReviewState {
  const { entries: aggEntries, totalSeconds } = aggregateDay(date);

  const entries: DayReviewEntry[] = [];

  for (const [key, entry] of aggEntries) {
    if (shouldHideActivity(entry.app, entry.seconds)) continue;

    const manualId = key.startsWith("Manual entry::")
      ? key.slice("Manual entry::".length)
      : undefined;
    const calendarEventId = key.startsWith("Calendar::")
      ? key.slice("Calendar::".length)
      : undefined;
    const manualEntry = manualId ? manualEntries[manualId] : undefined;
    const calendarEvent = calendarEventId ? calendarEvents[calendarEventId] : undefined;

    let kind: DayReviewEntry["kind"] = "activity";
    let title = entry.title;
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
      entry.projectId === null && entry.assignedBy === "none"
        ? suggestionsByKey[key]
        : undefined;

    entries.push({
      key,
      kind,
      app: entry.app,
      title,
      description,
      seconds: entry.seconds,
      projectId: entry.projectId,
      assignedBy: entry.assignedBy,
      manualEntryId: manualId,
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
    const enabled = new Set(settings.calendar.enabledCalendarIds);
    const kept: Record<string, CalendarEvent> = {};
    for (const [id, cached] of Object.entries(calendarEvents)) {
      const endKey = cached.end.slice(0, 10);
      const startKey = cached.start.slice(0, 10);
      const outsideRange = endKey < start || startKey > end;
      const calendarAllowed =
        enabled.size === 0 || enabled.has(cached.calendarId);
      if (outsideRange && calendarAllowed) kept[id] = cached;
    }
    for (const event of fetched) {
      if (enabled.size > 0 && !enabled.has(event.calendarId)) continue;
      if (event.isAllDay && !settings.calendar.includeAllDay) continue;
      kept[event.id] = event;
    }
    calendarEvents = kept;
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

function emitLlmActivity(): void {
  const running =
    (suggestionsEngine?.isRunning() ?? false) ||
    llmSupervisor?.getState().status === "loading" ||
    llmSupervisor?.getState().status === "downloading";
  const pendingCount = Object.keys(suggestionsByKey).length;
  dashboard?.webContents.send("llm-activity", { running, pendingCount });
}

function ensureLlmSupervisor(): LLMSupervisor {
  if (!llmSupervisor) {
    llmSupervisor = new LLMSupervisor(settings.suggestions.modelId);
    llmSupervisor.onState((state) => {
      dashboard?.webContents.send("llm-state", state);
      emitLlmActivity();
    });
  }
  return llmSupervisor;
}

function ensureSuggestionsEngine(): SuggestionsEngine {
  if (!suggestionsEngine) {
    const llm = ensureLlmSupervisor();
    suggestionsEngine = new SuggestionsEngine({
      llm,
      getTrackingDays: () => derivedFlatMap(sessionsByDay),
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
        emitLlmActivity();
        broadcast();
      },
      onRunningChanged: () => {
        emitLlmActivity();
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
  calendarEvents = {};
  saveCalendarEvents(calendarEvents);
  cache.invalidate();
}

function upsertManualSession(entry: ManualEntry): void {
  const sessions = sessionsByDay[entry.date] ? [...sessionsByDay[entry.date]] : [];
  const idx = sessions.findIndex((s) => s.manualEntryId === entry.id);
  const start = idx >= 0 ? sessions[idx].start : Date.now();
  const end = start + entry.seconds * 1000;
  const session: Session = {
    id: idx >= 0 ? sessions[idx].id : nanoid(12),
    start,
    end,
    app: "Manual entry",
    title: entry.description,
    source: "manual",
    manualEntryId: entry.id,
  };
  if (idx >= 0) sessions[idx] = session;
  else sessions.push(session);
  sessionsByDay[entry.date] = sessions;
}

function removeManualSession(id: ManualEntryId, date: string): void {
  const sessions = sessionsByDay[date];
  if (!sessions) return;
  const next = sessions.filter((s) => s.manualEntryId !== id);
  if (next.length === 0) delete sessionsByDay[date];
  else sessionsByDay[date] = next;
}

function recordTick(args: {
  app: string;
  title: string;
  source: "app" | "idle";
  now: number;
  minDurationMs: number;
}): void {
  const day = dayKeyForMs(args.now);
  const existing = sessionsByDay[day] ?? [];
  sessionsByDay[day] = upsertTick(existing, {
    app: args.app,
    title: args.title,
    source: args.source,
    now: args.now,
    minDurationMs: args.minDurationMs,
  });
  trackingDirty = true;
}

async function trackLoop(): Promise<void> {
  const activeWinModule = await import("active-win");
  const activeWindow = activeWinModule.default;

  const intervalMs = settings.trackingIntervalMs;

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
      const now = Date.now();

      if (key !== lastActivityKey) {
        lastActivityKey = key;
        lastActivityChangeTime = now;
        isIdle = false;
      }

      if (settings.idle.enabled && !isIdle) {
        const elapsed = now - lastActivityChangeTime;
        if (elapsed > settings.idle.timeoutMinutes * 60 * 1000) {
          isIdle = true;
        }
      }

      if (isIdle) {
        recordTick({ app: "Idle", title: "Idle", source: "idle", now, minDurationMs: intervalMs });
        broadcast();
        return;
      }

      recordTick({ app, title, source: "app", now, minDurationMs: intervalMs });

      const match = cache.get(app, title, { rules, overrides, manualEntries, calendarEvents });
      currentActivity = { app, title, projectId: match.projectId };

      broadcast();
    } catch (err) {
      console.error("Tracking error:", err);
    }
  }, settings.trackingIntervalMs);

  setInterval(() => {
    if (trackingDirty) {
      saveSessionsByDay(sessionsByDay);
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
    suggestionsEngine?.scheduleRun();
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
    suggestionsEngine?.scheduleRun();
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
    suggestionsEngine?.scheduleRun();
    return updated;
  });

  ipcMain.handle("delete-rule", (_e, { id }: { id: RuleId }): void => {
    rules = rules.filter((r) => r.id !== id);
    saveRules(rules);
    cache.invalidate();
    broadcast();
    suggestionsEngine?.scheduleRun();
  });

  ipcMain.handle(
    "create-project-from-activity",
    (_e, input: CreateProjectFromActivityInput): Project => {
      const project: Project = {
        id: nanoid(10),
        name: input.name.trim(),
        color: input.color,
        createdAt: Date.now(),
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
      const rangeDays: Record<string, Record<string, number>> = {};
      for (const day of Object.keys(sessionsByDay)) {
        if (day < start || day > end) continue;
        rangeDays[day] = derivedFlatMapForDay(sessionsByDay[day]);
      }

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
      if (partial.minActivitySeconds !== undefined) {
        broadcast();
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

  ipcMain.handle("llm-activity", (): { running: boolean; pendingCount: number } => {
    const running =
      (suggestionsEngine?.isRunning() ?? false) ||
      llmSupervisor?.getState().status === "loading" ||
      llmSupervisor?.getState().status === "downloading";
    return { running, pendingCount: Object.keys(suggestionsByKey).length };
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
      const seconds = Math.max(0, Math.round(input.seconds));
      const entry: ManualEntry = {
        id,
        date: input.date,
        description: input.description.trim(),
        seconds,
        projectId: input.projectId,
        createdAt: Date.now(),
      };
      manualEntries = { ...manualEntries, [id]: entry };
      saveManualEntries(manualEntries);

      upsertManualSession(entry);
      saveSessionsByDay(sessionsByDay);

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

      upsertManualSession(updated);
      saveSessionsByDay(sessionsByDay);

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

    removeManualSession(id, existing.date);
    saveSessionsByDay(sessionsByDay);

    cache.invalidate();
    broadcast();
  });

  ipcMain.handle("clear-today-data", (): void => {
    const today = todayKey();
    delete sessionsByDay[today];
    saveSessionsByDay(sessionsByDay);
    cache.invalidate();
    broadcast();
  });

  ipcMain.handle("clear-all-data", (): void => {
    sessionsByDay = {};
    saveSessionsByDay(sessionsByDay);
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
  manualEntries = loadManualEntries();
  calendarEvents = loadCalendarEvents();
  suggestionsByKey = loadSuggestions();
  dismissedSuggestions = loadDismissedSuggestions();
  settings = loadSettings();

  const legacyTracking = loadTracking();
  sessionsByDay = migrateTrackingToSessionsIfNeeded(
    legacyTracking,
    manualEntries,
    calendarEvents,
  );
  if (Object.keys(sessionsByDay).length === 0) {
    sessionsByDay = loadSessionsByDay();
  }

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
  if (trackingDirty) saveSessionsByDay(sessionsByDay);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
