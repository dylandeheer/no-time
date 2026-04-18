import { app, BrowserWindow, Tray, ipcMain, nativeImage } from "electron";
import path from "node:path";
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
  todayKey,
  getDateRangeBounds,
  getTrackingForRange,
} from "./storage.js";
import { activityKey } from "@shared/types";
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

function buildTrackingState(): TrackingState {
  const today = todayKey();
  const todayData = trackingDays[today] ?? {};

  const activities: Record<string, Activity> = {};
  let totalTodaySeconds = 0;

  for (const [key, time] of Object.entries(todayData)) {
    const [appName, title] = key.split("::");
    if (!appName || title === undefined) continue;

    const match = cache.get(appName, title, { rules, overrides });
    activities[key] = {
      app: appName,
      title,
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
    const [appName, title] = key.split("::");
    if (!appName || title === undefined) continue;

    const match = cache.get(appName, title, { rules, overrides });
    activities[key] = {
      app: appName,
      title,
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

  setInterval(async () => {
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

      const today = todayKey();
      if (!trackingDays[today]) trackingDays[today] = {};
      trackingDays[today][key] = (trackingDays[today][key] ?? 0) + 1;
      trackingDirty = true;

      const match = cache.get(app, title, { rules, overrides });
      currentActivity = { app, title, projectId: match.projectId };

      broadcast();
    } catch (err) {
      console.error("Tracking error:", err);
    }
  }, 1000);

  setInterval(() => {
    if (trackingDirty) {
      saveTracking(trackingDays);
      trackingDirty = false;
    }
  }, 30000);
}

function makeWidget(): void {
  widget = new BrowserWindow({
    width: 320,
    height: 200,
    show: false,
    frame: false,
    alwaysOnTop: true,
    fullscreenable: false,
    useContentSize: true,
    resizable: false,
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

  try {
    const iconPath = path.join(process.cwd(), "assets/iconTemplate.png");
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

    const bounds = tray.getBounds();
    widget.setPosition(
      Math.round(bounds.x - 320 / 2 + bounds.width / 2),
      Math.round(bounds.y + bounds.height),
    );
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
    icon: path.join(process.cwd(), "assets/icon.png"),
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
}

app.whenReady().then(async () => {
  projects = loadProjects();
  rules = loadRules();
  overrides = loadOverrides();
  trackingDays = loadTracking();

  if (process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(
      path.join(process.cwd(), "assets/icon.png"),
    );
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }

  registerIpc();
  makeWidget();
  makeDashboard();
  await trackLoop();
});

app.on("before-quit", () => {
  if (trackingDirty) saveTracking(trackingDays);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
