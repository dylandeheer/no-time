import { app } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import type {
  CalendarAuthStatus,
  CalendarEvent,
  CalendarInfo,
  CalendarSettings,
} from "@shared/types";

interface SidecarResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export class CalendarSidecarError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

function resolveSidecarPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath, "bin", "no-time-calendar"),
    path.join(app.getAppPath(), "assets", "bin", "no-time-calendar"),
    path.join(process.cwd(), "assets", "bin", "no-time-calendar"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function runSidecar<T>(args: string[], timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const bin = resolveSidecarPath();
    if (!bin) {
      reject(new CalendarSidecarError("calendar sidecar not found", "missing-sidecar"));
      return;
    }

    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new CalendarSidecarError("calendar sidecar timed out", "timeout"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new CalendarSidecarError(err.message, "spawn-error"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const trimmed = stdout.trim();
        if (!trimmed) {
          reject(
            new CalendarSidecarError(
              stderr.trim() || `sidecar exited ${code} with no output`,
              "no-output",
            ),
          );
          return;
        }
        const last = trimmed.split("\n").pop() ?? trimmed;
        const parsed = JSON.parse(last) as SidecarResponse<T>;
        if (!parsed.ok) {
          reject(
            new CalendarSidecarError(
              parsed.error ?? "sidecar returned not-ok",
              parsed.code ?? "error",
            ),
          );
          return;
        }
        if (parsed.data === undefined) {
          reject(new CalendarSidecarError("sidecar returned no data", "empty-data"));
          return;
        }
        resolve(parsed.data);
      } catch (err) {
        reject(
          new CalendarSidecarError(
            `sidecar parse error: ${(err as Error).message}`,
            "parse-error",
          ),
        );
      }
    });
  });
}

export async function getAuthStatus(options?: { request?: boolean }): Promise<CalendarAuthStatus> {
  try {
    const args = options?.request ? ["auth", "--request"] : ["auth"];
    const { status } = await runSidecar<{ status: string }>(args);
    return normalizeStatus(status);
  } catch (err) {
    if (err instanceof CalendarSidecarError && err.code === "missing-sidecar") {
      return "unavailable";
    }
    throw err;
  }
}

function normalizeStatus(raw: string): CalendarAuthStatus {
  switch (raw) {
    case "not-determined":
    case "restricted":
    case "denied":
    case "authorized":
    case "write-only":
    case "unavailable":
      return raw;
    default:
      return "unknown";
  }
}

export async function listCalendars(): Promise<CalendarInfo[]> {
  return runSidecar<CalendarInfo[]>(["list-calendars"]);
}

export async function listEvents(
  start: string,
  end: string,
  calendarIds?: string[],
): Promise<CalendarEvent[]> {
  const args = ["events", start, end];
  if (calendarIds && calendarIds.length > 0) {
    args.push(calendarIds.join(","));
  }
  return runSidecar<CalendarEvent[]>(args);
}

export function eventEffectiveSeconds(
  event: CalendarEvent,
  dateKey: string,
  includeAllDay: boolean,
): number {
  if (event.isAllDay && !includeAllDay) return 0;
  if (event.durationSeconds <= 0) return 0;

  const dayStart = new Date(`${dateKey}T00:00:00`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999`);
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);

  const overlapStart = Math.max(dayStart.getTime(), eventStart.getTime());
  const overlapEnd = Math.min(dayEnd.getTime(), eventEnd.getTime());
  const overlapMs = overlapEnd - overlapStart;
  if (overlapMs <= 0) return 0;
  return Math.round(overlapMs / 1000);
}

export function eventDateKeys(event: CalendarEvent): string[] {
  const keys = new Set<string>();
  const start = new Date(event.start);
  const end = new Date(event.end);
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endOfEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor.getTime() <= endOfEnd.getTime()) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    keys.add(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return Array.from(keys);
}

export interface CalendarMergeResult {
  trackingDays: Record<string, Record<string, number>>;
  events: Record<string, CalendarEvent>;
  addedEvents: number;
  removedEvents: number;
}

export function mergeCalendarEvents(
  trackingDays: Record<string, Record<string, number>>,
  previousEvents: Record<string, CalendarEvent>,
  fetchedEvents: CalendarEvent[],
  fetchStart: string,
  fetchEnd: string,
  settings: CalendarSettings,
): CalendarMergeResult {
  const nextDays: Record<string, Record<string, number>> = {};
  for (const [day, entries] of Object.entries(trackingDays)) {
    nextDays[day] = { ...entries };
  }

  const enabled = new Set(settings.enabledCalendarIds);
  const keepingIds = new Set<string>();

  for (const [eventId, cached] of Object.entries(previousEvents)) {
    const eventStartKey = cached.start.slice(0, 10);
    const eventEndKey = cached.end.slice(0, 10);
    const insideRange = eventEndKey >= fetchStart && eventStartKey <= fetchEnd;
    if (!insideRange) keepingIds.add(eventId);
  }

  for (const [eventId, cached] of Object.entries(previousEvents)) {
    for (const day of eventDateKeys(cached)) {
      const dayEntries = nextDays[day];
      if (!dayEntries) continue;
      const key = `Calendar::${eventId}`;
      if (key in dayEntries) {
        delete dayEntries[key];
        if (Object.keys(dayEntries).length === 0) delete nextDays[day];
      }
    }
  }

  const nextEvents: Record<string, CalendarEvent> = {};
  for (const id of keepingIds) {
    nextEvents[id] = previousEvents[id];
  }

  let addedEvents = 0;
  for (const event of fetchedEvents) {
    if (enabled.size > 0 && !enabled.has(event.calendarId)) continue;
    nextEvents[event.id] = event;
    addedEvents += 1;

    for (const day of eventDateKeys(event)) {
      const seconds = eventEffectiveSeconds(event, day, settings.includeAllDay);
      if (seconds <= 0) continue;
      if (!nextDays[day]) nextDays[day] = {};
      nextDays[day][`Calendar::${event.id}`] = seconds;
    }
  }

  for (const id of keepingIds) {
    const cached = previousEvents[id];
    if (enabled.size > 0 && !enabled.has(cached.calendarId)) {
      delete nextEvents[id];
      continue;
    }
    for (const day of eventDateKeys(cached)) {
      const seconds = eventEffectiveSeconds(cached, day, settings.includeAllDay);
      if (seconds <= 0) continue;
      if (!nextDays[day]) nextDays[day] = {};
      nextDays[day][`Calendar::${id}`] = seconds;
    }
  }

  const removedEvents = Object.keys(previousEvents).length - Object.keys(nextEvents).length;

  return {
    trackingDays: nextDays,
    events: nextEvents,
    addedEvents,
    removedEvents: Math.max(0, removedEvents),
  };
}
