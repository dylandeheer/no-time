import type {
  AssignedBy,
  Project,
  ProjectId,
  Suggestion,
  SuggestionsSettings,
} from "@shared/types";
import {
  CALENDAR_APP_NAME,
  MANUAL_APP_NAME,
  parseActivityKey,
} from "@shared/types";
import type { LLMSupervisor } from "./llm.js";

const MIN_CONFIDENCE = 0.55;
const MAX_BATCH_AT_ONCE = 5;

export interface ExampleAssignment {
  app: string;
  title: string;
  projectId: string;
  projectName: string;
}

export interface SuggestionsEngineDeps {
  llm: LLMSupervisor;
  getTrackingDays: () => Record<string, Record<string, number>>;
  getSettings: () => SuggestionsSettings;
  getProjects: () => Project[];
  getOverrides: () => Record<string, ProjectId>;
  getAssignedBy: (activityKey: string) => AssignedBy;
  getSuggestions: () => Record<string, Suggestion>;
  setSuggestions: (next: Record<string, Suggestion>) => void;
  getDismissed: () => Record<string, number>;
  setDismissed: (next: Record<string, number>) => void;
  onSuggestionsChanged: () => void;
}

export class SuggestionsEngine {
  private deps: SuggestionsEngineDeps;
  private runningKeys = new Set<string>();
  private pendingRun = false;
  private inFlight = false;

  constructor(deps: SuggestionsEngineDeps) {
    this.deps = deps;
  }

  scheduleRun(): void {
    if (this.inFlight) {
      this.pendingRun = true;
      return;
    }
    this.inFlight = true;
    setImmediate(() => {
      void this.runOnce().finally(() => {
        this.inFlight = false;
        if (this.pendingRun) {
          this.pendingRun = false;
          this.scheduleRun();
        }
      });
    });
  }

  acceptSuggestion(activityKey: string): Suggestion | null {
    const suggestions = this.deps.getSuggestions();
    const suggestion = suggestions[activityKey];
    if (!suggestion) return null;
    const { [activityKey]: _, ...rest } = suggestions;
    this.deps.setSuggestions(rest);
    this.deps.onSuggestionsChanged();
    return suggestion;
  }

  dismissSuggestion(activityKey: string): void {
    const suggestions = this.deps.getSuggestions();
    const dismissed = this.deps.getDismissed();
    const { [activityKey]: _, ...restSuggestions } = suggestions;
    this.deps.setSuggestions(restSuggestions);
    this.deps.setDismissed({ ...dismissed, [activityKey]: Date.now() });
    this.deps.onSuggestionsChanged();
  }

  clearSuggestionForKey(activityKey: string): void {
    const suggestions = this.deps.getSuggestions();
    if (!(activityKey in suggestions)) return;
    const { [activityKey]: _, ...rest } = suggestions;
    this.deps.setSuggestions(rest);
    this.deps.onSuggestionsChanged();
  }

  private async runOnce(): Promise<void> {
    const settings = this.deps.getSettings();
    if (!settings.enabled) return;

    const candidates = this.collectCandidates(settings);
    if (candidates.length === 0) return;

    const projects = this.deps.getProjects();
    if (projects.length === 0) return;

    const examples = this.collectExamples();

    const projectPayload = projects.map((p) => ({ id: p.id, name: p.name }));
    const suggestions = { ...this.deps.getSuggestions() };
    let changed = false;

    for (const candidate of candidates.slice(0, MAX_BATCH_AT_ONCE)) {
      if (this.runningKeys.has(candidate.key)) continue;
      this.runningKeys.add(candidate.key);

      try {
        const result = await this.deps.llm.categorize({
          activity: { app: candidate.app, title: candidate.title },
          projects: projectPayload,
          examples,
          modelId: settings.modelId,
        });
        if (result.projectId && result.confidence >= MIN_CONFIDENCE) {
          suggestions[candidate.key] = {
            activityKey: candidate.key,
            projectId: result.projectId,
            confidence: result.confidence,
            reason: result.reason,
            createdAt: Date.now(),
            modelId: settings.modelId,
          };
          changed = true;
        } else if (candidate.key in suggestions) {
          delete suggestions[candidate.key];
          changed = true;
        }
      } catch (err) {
        console.warn("suggestion failed", candidate.key, err);
        break;
      } finally {
        this.runningKeys.delete(candidate.key);
      }
    }

    if (changed) {
      this.deps.setSuggestions(suggestions);
      this.deps.onSuggestionsChanged();
    }
  }

  private collectCandidates(
    settings: SuggestionsSettings,
  ): Array<{ key: string; app: string; title: string; totalSeconds: number }> {
    const trackingDays = this.deps.getTrackingDays();
    const dismissed = this.deps.getDismissed();
    const overrides = this.deps.getOverrides();
    const existing = this.deps.getSuggestions();

    const totalsByKey = new Map<string, number>();
    for (const entries of Object.values(trackingDays)) {
      for (const [key, seconds] of Object.entries(entries)) {
        totalsByKey.set(key, (totalsByKey.get(key) ?? 0) + seconds);
      }
    }

    const candidates: Array<{
      key: string;
      app: string;
      title: string;
      totalSeconds: number;
    }> = [];

    for (const [key, totalSeconds] of totalsByKey) {
      if (totalSeconds < settings.minSecondsThreshold) continue;
      if (key in overrides) continue;
      if (key in existing) continue;
      if (key in dismissed) continue;
      const parsed = parseActivityKey(key);
      if (!parsed) continue;
      if (parsed.app === MANUAL_APP_NAME) continue;
      if (parsed.app === CALENDAR_APP_NAME) continue;
      if (parsed.app === "Idle") continue;
      if (this.deps.getAssignedBy(key) !== "none") continue;
      candidates.push({
        key,
        app: parsed.app,
        title: parsed.title,
        totalSeconds,
      });
    }

    candidates.sort((a, b) => b.totalSeconds - a.totalSeconds);
    return candidates;
  }

  private collectExamples(): ExampleAssignment[] {
    const overrides = this.deps.getOverrides();
    const projects = new Map(this.deps.getProjects().map((p) => [p.id, p]));
    const entries = Object.entries(overrides).slice(-30);
    const examples: ExampleAssignment[] = [];
    for (const [key, projectId] of entries) {
      const parsed = parseActivityKey(key);
      if (!parsed) continue;
      const project = projects.get(projectId);
      if (!project) continue;
      examples.push({
        app: parsed.app,
        title: parsed.title,
        projectId: project.id,
        projectName: project.name,
      });
    }
    return examples;
  }
}
