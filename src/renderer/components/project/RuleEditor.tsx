import { useEffect, useState } from "react";
import { AppWindow, CalendarDays, Hash, Plus, X } from "lucide-react";
import type { CalendarInfo, Project, Rule, RuleType } from "@shared/types";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { cn } from "@renderer/lib/utils";
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

  const calendarRuleLabel = (
    rule: Rule,
  ): { calendar?: string; pattern?: string } => {
    const cal = rule.calendarId
      ? calendars.find((c) => c.id === rule.calendarId)
      : undefined;
    const calendar = cal
      ? cal.title
      : rule.calendarId
        ? `${rule.calendarId.slice(0, 6)}…`
        : undefined;
    return { calendar, pattern: rule.pattern || undefined };
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {projectRules.length === 0 ? (
          <div className="text-xs text-muted-foreground">No rules yet. Add one below.</div>
        ) : (
          projectRules.map((rule) => (
            <RuleChip key={rule.id} rule={rule} calendar={calendarRuleLabel(rule)} onRemove={() => remove(rule.id)} />
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

interface RuleChipProps {
  rule: Rule;
  calendar: { calendar?: string; pattern?: string };
  onRemove: () => void;
}

function RuleChip({ rule, calendar, onRemove }: RuleChipProps) {
  const tone = chipToneFor(rule.type);
  const TypeIcon = iconFor(rule.type);
  const typeLabel = typeLabelFor(rule.type);

  let valueElement: React.ReactNode;
  if (rule.type === "calendar") {
    const parts: React.ReactNode[] = [];
    if (calendar.calendar) {
      parts.push(
        <span key="cal" className="max-w-[10rem] truncate">
          {calendar.calendar}
        </span>,
      );
    }
    if (calendar.pattern) {
      parts.push(
        <span key="pat" className="max-w-[12rem] truncate font-mono">
          {calendar.pattern}
        </span>,
      );
    }
    if (parts.length === 0) {
      parts.push(
        <span key="any" className="italic text-muted-foreground">
          any event
        </span>,
      );
    }
    valueElement = (
      <span className="flex items-center gap-1.5">
        {parts.flatMap((node, i) =>
          i === 0
            ? [node]
            : [
                <span key={`sep-${i}`} className="text-muted-foreground/50">
                  ·
                </span>,
                node,
              ],
        )}
      </span>
    );
  } else {
    valueElement = (
      <span className="max-w-[14rem] truncate font-mono">{rule.pattern}</span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-md border text-xs",
        tone.border,
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider",
          tone.leading,
        )}
      >
        <TypeIcon className="h-3 w-3" aria-hidden />
        {typeLabel}
      </span>
      <span className="flex items-center gap-2 px-2.5 py-1.5">
        {valueElement}
        <button
          onClick={onRemove}
          className="rounded-sm p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label="Remove rule"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    </span>
  );
}

function iconFor(type: RuleType): React.ComponentType<{ className?: string }> {
  switch (type) {
    case "app":
      return AppWindow;
    case "calendar":
      return CalendarDays;
    default:
      return Hash;
  }
}

function typeLabelFor(type: RuleType): string {
  switch (type) {
    case "app":
      return "App";
    case "calendar":
      return "Calendar";
    default:
      return "Keyword";
  }
}

function chipToneFor(type: RuleType): { leading: string; border: string } {
  switch (type) {
    case "app":
      return {
        leading: "bg-emerald-500/10 text-emerald-300",
        border: "border-emerald-500/20",
      };
    case "calendar":
      return {
        leading: "bg-sky-500/10 text-sky-300",
        border: "border-sky-500/20",
      };
    default:
      return {
        leading: "bg-muted/60 text-muted-foreground",
        border: "border-border",
      };
  }
}
