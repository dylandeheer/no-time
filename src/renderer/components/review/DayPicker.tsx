import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@renderer/lib/utils";

interface Props {
  date: string;
  onChange: (date: string) => void;
  maxDate?: string;
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayKey(): string {
  return formatDateKey(new Date());
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDateKey(d);
}

function displayLabel(key: string): string {
  if (key === todayKey()) return "Today";
  if (key === yesterdayKey()) return "Yesterday";
  const d = parseKey(key);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function DayPicker({ date, onChange, maxDate = todayKey() }: Props) {
  const shift = (days: number) => {
    const d = parseKey(date);
    d.setDate(d.getDate() + days);
    const next = formatDateKey(d);
    if (next > maxDate) return;
    onChange(next);
  };

  const atMax = date >= maxDate;

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card/50 p-0.5">
      <button
        onClick={() => shift(-1)}
        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="min-w-[9rem] px-2 text-center text-sm font-medium">
        {displayLabel(date)}
      </div>
      <button
        onClick={() => shift(1)}
        disabled={atMax}
        className={cn(
          "rounded-md p-1.5 transition",
          atMax
            ? "cursor-not-allowed text-muted-foreground/30"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
