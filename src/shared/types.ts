export type ProjectId = string;
export type RuleId = string;

export type RuleType = "keyword" | "app" | "calendar";

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
  calendarId?: string;
}

export type AssignedBy =
  | "rule"
  | "manual"
  | "manual-entry"
  | "calendar-rule"
  | "suggestion-accepted"
  | "none";

export type ManualEntryId = string;

export interface ManualEntry {
  id: ManualEntryId;
  date: string;
  description: string;
  seconds: number;
  projectId: ProjectId | null;
  createdAt: number;
}

export interface CreateManualEntryInput {
  date: string;
  description: string;
  seconds: number;
  projectId: ProjectId | null;
}

export interface UpdateManualEntryInput {
  id: ManualEntryId;
  description?: string;
  seconds?: number;
  projectId?: ProjectId | null;
}

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
  calendarId?: string;
}

export interface UpdateRuleInput {
  id: RuleId;
  type?: RuleType;
  pattern?: string;
  priority?: number;
  calendarId?: string | null;
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

export interface ReviewNotificationSettings {
  enabled: boolean;
  time: string;
}

export interface AppSettings {
  trackingIntervalMs: number;
  idle: IdleSettings;
  widgetPosition: WidgetPosition | null;
  reviewNotification: ReviewNotificationSettings;
  reviewedDays: Record<string, number>;
  calendar: CalendarSettings;
  suggestions: SuggestionsSettings;
}

export interface DayReviewEntry {
  key: string;
  kind: "activity" | "manual" | "calendar";
  app: string;
  title: string;
  description?: string;
  seconds: number;
  projectId: ProjectId | null;
  assignedBy: AssignedBy;
  manualEntryId?: ManualEntryId;
  calendarEvent?: {
    eventId: string;
    calendarId: string;
    calendarTitle: string;
    start: string;
    end: string;
    location?: string;
  };
  suggestion?: Suggestion;
}

export interface DayReviewProjectGroup {
  project: Project | null;
  entries: DayReviewEntry[];
  totalSeconds: number;
}

export interface DayReviewState {
  date: string;
  totalSeconds: number;
  reviewedAt: number | null;
  groups: DayReviewProjectGroup[];
  unassigned: DayReviewEntry[];
}

export const activityKey = (app: string, title: string): string => `${app}::${title}`;

export function parseActivityKey(key: string): { app: string; title: string } | null {
  const idx = key.indexOf("::");
  if (idx <= 0) return null;
  return { app: key.slice(0, idx), title: key.slice(idx + 2) };
}

export const MANUAL_APP_NAME = "Manual entry";
export const manualEntryKey = (id: ManualEntryId): string => `${MANUAL_APP_NAME}::${id}`;

export function parseManualEntryKey(key: string): ManualEntryId | null {
  const parsed = parseActivityKey(key);
  if (!parsed) return null;
  return parsed.app === MANUAL_APP_NAME ? parsed.title : null;
}

export const CALENDAR_APP_NAME = "Calendar";
export const calendarEventKey = (eventId: string): string => `${CALENDAR_APP_NAME}::${eventId}`;

export function parseCalendarEventKey(key: string): string | null {
  const parsed = parseActivityKey(key);
  if (!parsed) return null;
  return parsed.app === CALENDAR_APP_NAME ? parsed.title : null;
}

export interface CalendarInfo {
  id: string;
  title: string;
  source: string;
  color: string;
  allowsModifications: boolean;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  calendarTitle: string;
  title: string;
  start: string;
  end: string;
  durationSeconds: number;
  isAllDay: boolean;
  location: string | null;
  notes: string | null;
}

export type CalendarAuthStatus =
  | "not-determined"
  | "restricted"
  | "denied"
  | "authorized"
  | "write-only"
  | "unavailable"
  | "unknown";

export interface CalendarSettings {
  enabled: boolean;
  includeAllDay: boolean;
  enabledCalendarIds: string[];
}

export interface SuggestionsSettings {
  enabled: boolean;
  minSecondsThreshold: number;
  modelId: string;
}

export type LlmStatus =
  | "disabled"
  | "unavailable"
  | "loading"
  | "downloading"
  | "ready"
  | "error";

export interface LlmState {
  status: LlmStatus;
  modelId: string | null;
  message?: string;
}

export interface Suggestion {
  activityKey: string;
  projectId: ProjectId;
  confidence: number;
  reason: string;
  createdAt: number;
  modelId: string;
}
