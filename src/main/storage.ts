import Store from "electron-store";
import type { Project, ProjectId, Rule } from "@shared/types";

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
