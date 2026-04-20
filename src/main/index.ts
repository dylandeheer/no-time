import { app, BrowserWindow, Tray, ipcMain, nativeImage, dialog, globalShortcut, screen, powerMonitor } from "electron";
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
  todayKey,
  getDateRangeBounds,
  getTrackingForRange,
} from "./storage.js";
import { activityKey, parseActivityKey } from "@shared/types";
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
} from "@shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let widget: BrowserWindow | null = null;
let dashboard: BrowserWindow | null = null;
let tray: Tray | null = null;

let projects: Project[] = [];
let rules: Rule[] = [];
let overrides: Record<string, ProjectId> = {};
let trackingDays: Record<string, Record<string, number>> = {};
let currentActivity: CurrentActivity | null = null;

const cache = new MatchCache();
let trackingDirty = false;
let isPaused = false;

let settings: AppSettings;
let trackingIntervalId: ReturnType<typeof setInterval> | null = null;
let trackingTickInFlight = false;

function buildTrackingState(): TrackingState {
  const today = todayKey();
  const todayData = trackingDays[today] ?? {};

  const activities: Record<string, Activity> = {};
  let totalTodaySeconds = 0;

  for (const [key, time] of Object.entries(todayData)) {
    const parsed = parseActivityKey(key);
    if (!parsed) continue;

    const match = cache.get(parsed.app, parsed.title, { rules, overrides });
    activities[key] = {
      app: parsed.app,
      title: parsed.title,
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

    const match = cache.get(parsed.app, parsed.title, { rules, overrides });
    activities[key] = {
      app: parsed.app,
      title: parsed.title,
      totalTime,
      projectId: match.projectId,
      assignedBy: match.assignedBy,
    };
    totalSeconds += totalTime;
  }

  return { activities, totalSeconds, dateRange: range, startDate: start, endDate: end };
}

async function trackLoop(): Promise<void> {
  const activeWinModule = await import("active-win");
  const activeWindow = activeWinModule.default;

  const intervalSeconds = Math.round(settings.trackingIntervalMs / 1000);

  trackingIntervalId = setInterval(async () => {
    if (trackingTickInFlight) return;
    trackingTickInFlight = true;
    try {
      if (isPaused) {
        broadcast();
        return;
      }

      const idleSeconds = powerMonitor.getSystemIdleTime();
      const isIdle =
        settings.idle.enabled && idleSeconds >= settings.idle.timeoutMinutes * 60;

      if (isIdle) {
        const idleKey = activityKey("Idle", "Idle");
        const today = todayKey();
        if (!trackingDays[today]) trackingDays[today] = {};
        trackingDays[today][idleKey] = (trackingDays[today][idleKey] ?? 0) + intervalSeconds;
        trackingDirty = true;
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

      const today = todayKey();
      if (!trackingDays[today]) trackingDays[today] = {};
      trackingDays[today][key] = (trackingDays[today][key] ?? 0) + intervalSeconds;
      trackingDirty = true;

      const match = cache.get(app, title, { rules, overrides });
      currentActivity = { app, title, projectId: match.projectId };

      broadcast();
    } catch (err) {
      console.error("Tracking error:", err);
    } finally {
      trackingTickInFlight = false;
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
      updated = {
        ...r,
        type: input.type ?? r.type,
        pattern: input.pattern !== undefined ? input.pattern.trim() : r.pattern,
        priority: input.priority ?? r.priority,
      };
      return updated;
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

          const match = cache.get(parsed.app, parsed.title, { rules, overrides });
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
      settings = {
        ...settings,
        ...partial,
        idle: { ...settings.idle, ...(partial.idle ?? {}) },
      };
      saveSettings(settings);
      if (partial.trackingIntervalMs && partial.trackingIntervalMs !== prevInterval && trackingIntervalId) {
        clearInterval(trackingIntervalId);
        trackingIntervalId = null;
        await trackLoop();
      }
      return settings;
    },
  );

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
  settings = loadSettings();

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

  powerMonitor.on("resume", () => {
    broadcast();
  });

  await trackLoop();
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  if (trackingDirty) saveTracking(trackingDays);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
