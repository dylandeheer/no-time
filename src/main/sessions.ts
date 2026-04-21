import { nanoid } from "nanoid";
import type {
  CalendarEvent,
  Project,
  ProjectId,
  Rule,
  Session,
  SessionSource,
  ManualEntry,
} from "@shared/types";
import {
  CALENDAR_APP_NAME,
  activityKey,
  calendarEventKey,
  manualEntryKey,
} from "@shared/types";
import type { MatchResult } from "./matching.js";
import { resolveProject } from "./matching.js";

export function sessionDurationSeconds(session: Session): number {
  return Math.max(0, Math.round((session.end - session.start) / 1000));
}

export function dayKeyForMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayBoundsMs(dayKey: string): { start: number; end: number } {
  const [y, m, d] = dayKey.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const end = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  return { start, end };
}

export function upsertTick(
  sessions: Session[],
  tick: {
    app: string;
    title: string;
    source: SessionSource;
    now: number;
    minDurationMs: number;
    manualEntryId?: string;
    calendarEventId?: string;
  },
): Session[] {
  const { app, title, source, now, minDurationMs } = tick;
  const last = sessions[sessions.length - 1];

  if (
    last &&
    last.source === source &&
    last.app === app &&
    last.title === title &&
    last.manualEntryId === tick.manualEntryId &&
    last.calendarEventId === tick.calendarEventId &&
    now - last.end <= minDurationMs * 2
  ) {
    last.end = now;
    return sessions;
  }

  sessions.push({
    id: nanoid(12),
    start: now - minDurationMs,
    end: now,
    app,
    title,
    source,
    manualEntryId: tick.manualEntryId,
    calendarEventId: tick.calendarEventId,
  });
  return sessions;
}

export function derivedFlatMapForDay(sessions: Session[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const s of sessions) {
    let key: string;
    if (s.source === "manual" && s.manualEntryId) key = manualEntryKey(s.manualEntryId);
    else if (s.source === "calendar" && s.calendarEventId)
      key = calendarEventKey(s.calendarEventId);
    else if (s.source === "idle") key = activityKey("Idle", "Idle");
    else key = activityKey(s.app, s.title);
    const prev = map[key] ?? 0;
    map[key] = prev + sessionDurationSeconds(s);
  }
  return map;
}

export function derivedFlatMap(
  sessionsByDay: Record<string, Session[]>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [day, sessions] of Object.entries(sessionsByDay)) {
    out[day] = derivedFlatMapForDay(sessions);
  }
  return out;
}

export interface ResolvedSession {
  session: Session;
  match: MatchResult;
}

export function applyCalendarOverlay(
  sessions: Session[],
  dayKey: string,
  calendarEvents: Record<string, CalendarEvent>,
  matchFor: (app: string, title: string) => MatchResult,
): ResolvedSession[] {
  const result: ResolvedSession[] = [];

  const dayBounds = dayBoundsMs(dayKey);
  const events = Object.values(calendarEvents).filter((e) => {
    const s = Date.parse(e.start);
    const end = Date.parse(e.end);
    return Number.isFinite(s) && Number.isFinite(end) && end > dayBounds.start && s < dayBounds.end;
  });

  const appAndManual = sessions.filter((s) => s.source !== "calendar" && s.source !== "idle");
  const idleSessions = sessions.filter((s) => s.source === "idle");

  for (const session of appAndManual) {
    const overlay = overlapEvent(session, events);
    let match = matchFor(session.app, session.title);
    let labeled = session;
    if (overlay && match.assignedBy === "none") {
      const overlayMatch = matchFor(CALENDAR_APP_NAME, overlay.id);
      if (overlayMatch.assignedBy !== "none") {
        match = overlayMatch.projectId
          ? { projectId: overlayMatch.projectId, assignedBy: "calendar-overlay" }
          : match;
      }
      labeled = { ...session, calendarEventId: overlay.id };
    }
    result.push({ session: labeled, match });
  }

  for (const session of idleSessions) {
    result.push({ session, match: matchFor(session.app, session.title) });
  }

  for (const event of events) {
    const eventStart = clampToDay(Date.parse(event.start), dayBounds);
    const eventEnd = clampToDay(Date.parse(event.end), dayBounds);
    if (eventEnd <= eventStart) continue;

    const gaps = gapsWithinEvent(eventStart, eventEnd, appAndManual);
    for (const gap of gaps) {
      const synthetic: Session = {
        id: `calendar:${event.id}:${gap.start}`,
        start: gap.start,
        end: gap.end,
        app: event.calendarTitle,
        title: event.title,
        source: "calendar",
        calendarEventId: event.id,
      };
      const overlayMatch = matchFor(CALENDAR_APP_NAME, event.id);
      result.push({ session: synthetic, match: overlayMatch });
    }
  }

  result.sort((a, b) => a.session.start - b.session.start);
  return result;
}

function overlapEvent(
  session: Session,
  events: CalendarEvent[],
): CalendarEvent | undefined {
  for (const event of events) {
    const s = Date.parse(event.start);
    const e = Date.parse(event.end);
    if (s < session.end && e > session.start) return event;
  }
  return undefined;
}

function clampToDay(value: number, bounds: { start: number; end: number }): number {
  return Math.min(Math.max(value, bounds.start), bounds.end);
}

function gapsWithinEvent(
  start: number,
  end: number,
  sessions: Session[],
): Array<{ start: number; end: number }> {
  const overlaps = sessions
    .filter((s) => s.start < end && s.end > start)
    .map((s) => ({ start: Math.max(s.start, start), end: Math.min(s.end, end) }))
    .sort((a, b) => a.start - b.start);

  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = start;
  for (const overlap of overlaps) {
    if (overlap.start > cursor) gaps.push({ start: cursor, end: overlap.start });
    cursor = Math.max(cursor, overlap.end);
  }
  if (cursor < end) gaps.push({ start: cursor, end });
  return gaps;
}

export interface SessionContext {
  rules: Rule[];
  overrides: Record<string, ProjectId>;
  manualEntries: Record<string, ManualEntry>;
  calendarEvents: Record<string, CalendarEvent>;
}

export function makeMatchFn(ctx: SessionContext): (app: string, title: string) => MatchResult {
  return (app, title) =>
    resolveProject(app, title, {
      rules: ctx.rules,
      overrides: ctx.overrides,
      manualEntries: ctx.manualEntries,
      calendarEvents: ctx.calendarEvents,
    });
}

export function cloneSessions(byDay: Record<string, Session[]>): Record<string, Session[]> {
  const next: Record<string, Session[]> = {};
  for (const [day, arr] of Object.entries(byDay)) {
    next[day] = arr.map((s) => ({ ...s }));
  }
  return next;
}

export function projectsIndex(projects: Project[]): Map<ProjectId, Project> {
  return new Map(projects.map((p) => [p.id, p]));
}
