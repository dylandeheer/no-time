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

export interface Activity {
  app: string;
  title: string;
  time: number;
  projectId: ProjectId | null;
  assignedBy: AssignedBy;
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

export const activityKey = (app: string, title: string): string => `${app}::${title}`;
