import type { AssignedBy, ProjectId, Rule } from "@shared/types";
import { activityKey } from "@shared/types";

export interface MatchResult {
  projectId: ProjectId | null;
  assignedBy: AssignedBy;
}

export interface MatchContext {
  rules: Rule[];
  overrides: Record<string, ProjectId>;
}

export function resolveProject(app: string, title: string, ctx: MatchContext): MatchResult {
  const key = activityKey(app, title);

  const override = ctx.overrides[key];
  if (override) {
    return { projectId: override, assignedBy: "manual" };
  }

  const sortedRules = [...ctx.rules].sort((a, b) => a.priority - b.priority);
  const appLower = app.toLowerCase();
  const titleLower = title.toLowerCase();

  for (const rule of sortedRules) {
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
