import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, Check, RefreshCw } from "lucide-react";
import type { AppSettings, CalendarAuthStatus, CalendarInfo } from "@shared/types";
import { Card } from "@renderer/components/ui/card";
import { Button } from "@renderer/components/ui/button";
import { Switch } from "@renderer/components/ui/switch";
import { cn } from "@renderer/lib/utils";
import { toast } from "sonner";

interface Props {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => Promise<void>;
}

function statusMessage(status: CalendarAuthStatus): {
  tone: "ok" | "warn" | "error";
  text: string;
} {
  switch (status) {
    case "authorized":
      return { tone: "ok", text: "Calendar access granted" };
    case "not-determined":
      return { tone: "warn", text: "Calendar access not requested yet" };
    case "denied":
    case "restricted":
      return {
        tone: "error",
        text: "Calendar access denied. Grant it in System Settings → Privacy & Security → Calendar.",
      };
    case "write-only":
      return {
        tone: "error",
        text: "Only write access granted. Full access is required to read events.",
      };
    case "unavailable":
      return {
        tone: "error",
        text: "Calendar sidecar not installed. Run `npm run build:sidecars` to rebuild.",
      };
    default:
      return { tone: "warn", text: "Calendar access status unknown" };
  }
}

export function CalendarSettingsCard({ settings, onUpdate }: Props) {
  const { calendar } = settings;
  const [status, setStatus] = useState<CalendarAuthStatus>("unknown");
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const next = await window.electronAPI.calendarAuthStatus();
    setStatus(next);
    if (next === "authorized") {
      setLoadingCalendars(true);
      try {
        const list = await window.electronAPI.calendarList();
        setCalendars(list);
      } finally {
        setLoadingCalendars(false);
      }
    } else {
      setCalendars([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requestAccess = async () => {
    setRequestingAccess(true);
    try {
      const next = await window.electronAPI.calendarAuthStatus({ request: true });
      setStatus(next);
      if (next === "authorized") {
        await refresh();
        toast.success("Calendar access granted");
      } else if (next === "denied" || next === "restricted") {
        toast.error("Calendar access was denied — grant it in System Settings");
      }
    } finally {
      setRequestingAccess(false);
    }
  };

  const toggleEnabled = async (enabled: boolean) => {
    if (enabled && status !== "authorized") {
      await requestAccess();
      const latest = await window.electronAPI.calendarAuthStatus();
      setStatus(latest);
      if (latest !== "authorized") {
        return;
      }
    }
    await onUpdate({ calendar: { ...calendar, enabled } });
  };

  const toggleCalendar = async (id: string) => {
    const set = new Set(calendar.enabledCalendarIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    await onUpdate({
      calendar: { ...calendar, enabledCalendarIds: Array.from(set) },
    });
  };

  const toggleIncludeAllDay = async (includeAllDay: boolean) => {
    await onUpdate({ calendar: { ...calendar, includeAllDay } });
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      await window.electronAPI.calendarSync();
      toast.success("Calendar synced");
    } catch {
      toast.error("Calendar sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const message = statusMessage(status);
  const canEnable = status === "authorized" || status === "not-determined";

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Calendar meetings</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Include macOS Calendar events as tracked meeting time.
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm">Enable meeting capture</span>
          <Switch
            checked={calendar.enabled}
            onCheckedChange={toggleEnabled}
            disabled={!canEnable && !calendar.enabled}
          />
        </div>

        <div
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
            message.tone === "ok" && "border-primary/30 bg-primary/5 text-primary",
            message.tone === "warn" && "border-amber-500/30 bg-amber-500/5 text-amber-400",
            message.tone === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
          )}
        >
          {message.tone === "ok" ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span className="flex-1">{message.text}</span>
          {status !== "authorized" && status !== "unavailable" && (
            <Button
              variant="outline"
              size="sm"
              onClick={requestAccess}
              disabled={requestingAccess}
              className="h-7 shrink-0"
            >
              {requestingAccess ? "Requesting…" : "Request access"}
            </Button>
          )}
        </div>

        {calendar.enabled && status === "authorized" && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Include all-day events</div>
                <div className="text-xs text-muted-foreground">
                  Off by default — all-day events inflate totals.
                </div>
              </div>
              <Switch
                checked={calendar.includeAllDay}
                onCheckedChange={toggleIncludeAllDay}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm">Calendars to include</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncNow}
                  disabled={syncing}
                  className="h-7"
                >
                  <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
                  Sync now
                </Button>
              </div>
              {loadingCalendars ? (
                <div className="text-xs text-muted-foreground">Loading calendars…</div>
              ) : calendars.length === 0 ? (
                <div className="text-xs text-muted-foreground">No calendars found.</div>
              ) : (
                <div className="space-y-1.5">
                  {calendars.map((cal) => {
                    const enabled =
                      calendar.enabledCalendarIds.length === 0 ||
                      calendar.enabledCalendarIds.includes(cal.id);
                    return (
                      <label
                        key={cal.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card/50 px-3 py-1.5 text-xs hover:bg-accent/40"
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => toggleCalendar(cal.id)}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: cal.color }}
                          aria-hidden
                        />
                        <span className="flex-1 truncate">{cal.title}</span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {cal.source}
                        </span>
                      </label>
                    );
                  })}
                  <div className="text-[11px] text-muted-foreground">
                    No selection = all calendars.
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
