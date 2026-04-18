import Store from "electron-store";
import type { Project, ProjectId, Rule, AppSettings } from "@shared/types";

interface ProjectsStoreSchema {
  projects: Project[];
  rules: Rule[];
  overrides: Record<string, ProjectId>;
}

interface TrackingStoreSchema {
  days: Record<string, Record<string, number>>;
}

const projectsStore = new Store<ProjectsStoreSchema>({
  name: "projects",
  defaults: {
    projects: [],
    rules: [],
    overrides: {},
  },
});

const trackingStore = new Store<TrackingStoreSchema>({
  name: "tracking",
  defaults: { days: {} },
});

const settingsStore = new Store<AppSettings>({
  name: "settings",
  defaults: {
    trackingIntervalMs: 1000,
    idle: { enabled: true, timeoutMinutes: 5 },
  },
});

export function loadSettings(): AppSettings {
  return settingsStore.store;
}

export function saveSettings(settings: AppSettings): void {
  settingsStore.store = settings;
}

export function loadProjects(): Project[] {
  return projectsStore.get("projects");
}

export function saveProjects(projects: Project[]): void {
  projectsStore.set("projects", projects);
}

export function loadRules(): Rule[] {
  return projectsStore.get("rules");
}

export function saveRules(rules: Rule[]): void {
  projectsStore.set("rules", rules);
}

export function loadOverrides(): Record<string, ProjectId> {
  return projectsStore.get("overrides");
}

export function saveOverrides(overrides: Record<string, ProjectId>): void {
  projectsStore.set("overrides", overrides);
}

export function loadTracking(): Record<string, Record<string, number>> {
  return trackingStore.get("days");
}

export function saveTracking(days: Record<string, Record<string, number>>): void {
  trackingStore.set("days", days);
}

export function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getDateRangeBounds(range: "today" | "week" | "month" | "all"): { start: string; end: string } {
  const now = new Date();
  const end = formatDateKey(now);

  if (range === "today") return { start: end, end };

  if (range === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    return { start: formatDateKey(start), end };
  }

  if (range === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: formatDateKey(start), end };
  }

  return { start: "0000-00-00", end };
}

export function getTrackingForRange(
  days: Record<string, Record<string, number>>,
  start: string,
  end: string,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const [day, entries] of Object.entries(days)) {
    if (day >= start && day <= end) result[day] = entries;
  }
  return result;
}
