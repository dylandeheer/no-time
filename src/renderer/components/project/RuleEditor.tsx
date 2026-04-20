import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type { CalendarInfo, Project, Rule, RuleType } from "@shared/types";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Badge } from "@renderer/components/ui/badge";
import { toast } from "sonner";

interface Props {
  project: Project;
  rules: Rule[];
}

const CALENDAR_ANY_VALUE = "__any__";

export function RuleEditor({ project, rules }: Props) {
  const projectRules = rules.filter((r) => r.projectId === project.id);
  const [type, setType] = useState<RuleType>("keyword");
  const [pattern, setPattern] = useState("");
  const [calendarId, setCalendarId] = useState<string>(CALENDAR_ANY_VALUE);
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (type !== "calendar") return;
    window.electronAPI.calendarList().then(setCalendars).catch(() => setCalendars([]));
  }, [type]);

  const canSubmit = (() => {
    if (submitting) return false;
    if (type === "calendar") {
      return pattern.trim().length > 0 || calendarId !== CALENDAR_ANY_VALUE;
    }
    return pattern.trim().length > 0;
  })();

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await window.electronAPI.createRule({
        projectId: project.id,
        type,
        pattern: pattern.trim(),
        calendarId: type === "calendar" && calendarId !== CALENDAR_ANY_VALUE ? calendarId : undefined,
      });
      setPattern("");
      setCalendarId(CALENDAR_ANY_VALUE);
      toast.success("Rule added");
    } catch (err) {
      toast.error("Failed to add rule");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await window.electronAPI.deleteRule(id);
    } catch (err) {
      toast.error("Failed to remove rule");
      console.error(err);
    }
  };

  const ruleLabel = (rule: Rule): string => {
    if (rule.type !== "calendar") return rule.pattern;
    const cal = rule.calendarId ? calendars.find((c) => c.id === rule.calendarId) : null;
    const parts: string[] = [];
    if (cal) parts.push(`cal: ${cal.title}`);
    else if (rule.calendarId) parts.push(`cal: ${rule.calendarId.slice(0, 6)}…`);
    if (rule.pattern) parts.push(`match: ${rule.pattern}`);
    return parts.join(" · ") || "any meeting";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {projectRules.length === 0 ? (
          <div className="text-xs text-muted-foreground">No rules yet. Add one below.</div>
        ) : (
          projectRules.map((rule) => (
            <Badge key={rule.id} variant="outline" className="gap-1 pr-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {rule.type}
              </span>
              <span className="font-mono">{ruleLabel(rule)}</span>
              <button
                onClick={() => remove(rule.id)}
                className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Remove rule"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
      </div>

      <form onSubmit={add} className="flex flex-wrap gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as RuleType)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
        >
          <option value="keyword">Keyword</option>
          <option value="app">App name</option>
          <option value="calendar">Calendar</option>
        </select>
        {type === "calendar" && (
          <select
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
          >
            <option value={CALENDAR_ANY_VALUE}>Any calendar</option>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
        <Input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={
            type === "app"
              ? "Exact app name"
              : type === "calendar"
                ? "Optional keyword in event title"
                : "Substring to match"
          }
          className="min-w-[14rem] flex-1"
        />
        <Button type="submit" size="sm" disabled={!canSubmit}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </form>
    </div>
  );
}
