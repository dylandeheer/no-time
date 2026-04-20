import type {
  AssignedBy,
  CalendarEvent,
  ManualEntry,
  ManualEntryId,
  ProjectId,
  Rule,
} from "@shared/types";
import { CALENDAR_APP_NAME, MANUAL_APP_NAME, activityKey } from "@shared/types";

export interface MatchResult {
  projectId: ProjectId | null;
  assignedBy: AssignedBy;
}

export interface MatchContext {
  rules: Rule[];
  overrides: Record<string, ProjectId>;
  manualEntries: Record<ManualEntryId, ManualEntry>;
  calendarEvents: Record<string, CalendarEvent>;
}

export function resolveProject(app: string, title: string, ctx: MatchContext): MatchResult {
  if (app === MANUAL_APP_NAME) {
    const entry = ctx.manualEntries[title];
    if (entry) {
      return { projectId: entry.projectId, assignedBy: "manual-entry" };
    }
    return { projectId: null, assignedBy: "none" };
  }

  if (app === CALENDAR_APP_NAME) {
    const key = activityKey(app, title);
    const override = ctx.overrides[key];
    if (override) {
      return { projectId: override, assignedBy: "manual" };
    }

    const event = ctx.calendarEvents[title];
    if (!event) {
      return { projectId: null, assignedBy: "none" };
    }

    const sortedRules = [...ctx.rules].sort((a, b) => a.priority - b.priority);
    const eventTitleLower = event.title.toLowerCase();

    for (const rule of sortedRules) {
      if (rule.type !== "calendar") continue;
      const patternLower = rule.pattern.toLowerCase();
      const hasCalendarFilter = Boolean(rule.calendarId);
      const hasPatternFilter = patternLower.length > 0;
      if (!hasCalendarFilter && !hasPatternFilter) continue;
      if (hasCalendarFilter && rule.calendarId !== event.calendarId) continue;
      if (hasPatternFilter && !eventTitleLower.includes(patternLower)) continue;
      return { projectId: rule.projectId, assignedBy: "calendar-rule" };
    }

    return { projectId: null, assignedBy: "none" };
  }

  const key = activityKey(app, title);

  const override = ctx.overrides[key];
  if (override) {
    return { projectId: override, assignedBy: "manual" };
  }

  const sortedRules = [...ctx.rules].sort((a, b) => a.priority - b.priority);
  const appLower = app.toLowerCase();
  const titleLower = title.toLowerCase();

  for (const rule of sortedRules) {
    if (rule.type === "calendar") continue;
    const pattern = rule.pattern.toLowerCase();
    if (!pattern) continue;

    if (rule.type === "app") {
      if (appLower === pattern) {
        return { projectId: rule.projectId, assignedBy: "rule" };
      }
    } else if (rule.type === "keyword") {
      if (titleLower.includes(pattern) || appLower.includes(pattern)) {
        return { projectId: rule.projectId, assignedBy: "rule" };
      }
    }
  }

  return { projectId: null, assignedBy: "none" };
}

export class MatchCache {
  private cache = new Map<string, MatchResult>();

  get(app: string, title: string, ctx: MatchContext): MatchResult {
    const key = activityKey(app, title);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const result = resolveProject(app, title, ctx);
    this.cache.set(key, result);
    return result;
  }

  invalidate(): void {
    this.cache.clear();
  }
}
