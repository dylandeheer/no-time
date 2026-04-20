import { Notification } from "electron";
import type { ReviewNotificationSettings } from "@shared/types";

type FocusReview = () => void;

let scheduled: ReturnType<typeof setTimeout> | null = null;

function parseTime(hhmm: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

function nextFiringTime(hhmm: string, now = new Date()): Date | null {
  const parsed = parseTime(hhmm);
  if (!parsed) return null;
  const target = new Date(now);
  target.setHours(parsed.hours, parsed.minutes, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

function fire(onClick: FocusReview): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: "Ready to review your day?",
    body: "Take a minute to confirm today's tracked time.",
    silent: false,
  });
  notification.on("click", () => {
    onClick();
  });
  notification.show();
}

export function scheduleReviewNotification(
  settings: ReviewNotificationSettings,
  onClick: FocusReview,
): void {
  cancelReviewNotification();
  if (!settings.enabled) return;

  const next = nextFiringTime(settings.time);
  if (!next) return;

  const delay = next.getTime() - Date.now();
  scheduled = setTimeout(() => {
    fire(onClick);
    scheduleReviewNotification(settings, onClick);
  }, delay);
}

export function cancelReviewNotification(): void {
  if (scheduled) {
    clearTimeout(scheduled);
    scheduled = null;
  }
}

export const __test = { nextFiringTime, parseTime };
