export type ProjectId = string;
export type RuleId = string;

export type RuleType = "keyword" | "app";

export interface Project {
  id: ProjectId;
  name: string;
  color: string;
  createdAt: number;
}

export interface Rule {
  id: RuleId;
  projectId: ProjectId;
  type: RuleType;
  pattern: string;
  priority: number;
}

export type AssignedBy = "rule" | "manual" | "none";

export interface ActivitySummary {
  app: string;
  title: string;
  time: number;
  projectId: ProjectId | null;
  assignedBy: AssignedBy;
}

export interface Activity extends ActivitySummary {
  lastSeen: number;
}

export interface CurrentActivity {
  app: string;
  title: string;
  projectId: ProjectId | null;
}

export interface TrackingState {
  activities: Record<string, Activity>;
  projects: Project[];
  rules: Rule[];
  currentActivity: CurrentActivity | null;
  totalTodaySeconds: number;
  isPaused: boolean;
}

export interface CreateProjectInput {
  name: string;
  color: string;
  autoRulePattern?: string | null;
}

export interface CreateRuleInput {
  projectId: ProjectId;
  type: RuleType;
  pattern: string;
  priority?: number;
}

export interface UpdateRuleInput {
  id: RuleId;
  type?: RuleType;
  pattern?: string;
  priority?: number;
}

export interface CreateProjectFromActivityInput {
  name: string;
  color: string;
  activityKey: string;
  autoRulePattern?: string | null;
}

export interface AssignActivityInput {
  activityKey: string;
  projectId: ProjectId;
}

export type DateRange = "today" | "week" | "month" | "all";

export interface HistoricalActivity {
  app: string;
  title: string;
  totalTime: number;
  projectId: ProjectId | null;
  assignedBy: AssignedBy;
}

export interface HistoricalState {
  activities: Record<string, HistoricalActivity>;
  totalSeconds: number;
  dateRange: DateRange;
  startDate: string;
  endDate: string;
}

export interface IdleSettings {
  enabled: boolean;
  timeoutMinutes: number;
}

export interface WidgetPosition {
  x: number;
  y: number;
}

export interface AppSettings {
  trackingIntervalMs: number;
  idle: IdleSettings;
  widgetPosition: WidgetPosition | null;
}

export const activityKey = (app: string, title: string): string => `${app}::${title}`;

export function parseActivityKey(key: string): { app: string; title: string } | null {
  const idx = key.indexOf("::");
  if (idx <= 0) return null;
  return { app: key.slice(0, idx), title: key.slice(idx + 2) };
}
