import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, RotateCcw } from "lucide-react";
import type { DayReviewState, ManualEntry, TrackingState } from "@shared/types";
import { formatTime } from "@renderer/lib/format";
import { Button } from "@renderer/components/ui/button";
import { DayPicker } from "@renderer/components/review/DayPicker";
import { ManualEntryModal } from "@renderer/components/review/ManualEntryModal";
import { ReviewProjectGroup } from "@renderer/components/review/ReviewProjectGroup";
import { toast } from "sonner";

interface Props {
  state: TrackingState;
  initialDate?: string;
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ReviewView({ state, initialDate }: Props) {
  const [date, setDate] = useState<string>(initialDate ?? todayKey());
  const [review, setReview] = useState<DayReviewState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ManualEntry | null>(null);
  const [manualEntriesById, setManualEntriesById] = useState<Record<string, ManualEntry>>({});

  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);

  const loadReview = useCallback(async () => {
    const result = await window.electronAPI.getReviewState(date);
    setReview(result);

    const manuals: Record<string, ManualEntry> = {};
    for (const group of result.groups) {
      for (const entry of group.entries) {
        if (entry.kind === "manual" && entry.manualEntryId) {
          manuals[entry.manualEntryId] = {
            id: entry.manualEntryId,
            date: result.date,
            description: entry.description ?? entry.title,
            seconds: entry.seconds,
            projectId: entry.projectId,
            createdAt: 0,
          };
        }
      }
    }
    for (const entry of result.unassigned) {
      if (entry.kind === "manual" && entry.manualEntryId) {
        manuals[entry.manualEntryId] = {
          id: entry.manualEntryId,
          date: result.date,
          description: entry.description ?? entry.title,
          seconds: entry.seconds,
          projectId: entry.projectId,
          createdAt: 0,
        };
      }
    }
    setManualEntriesById(manuals);
  }, [date]);

  useEffect(() => {
    loadReview();
  }, [loadReview]);

  useEffect(() => {
    const off = window.electronAPI.onTrackingUpdate(() => {
      loadReview();
    });
    return off;
  }, [loadReview]);

  const openEdit = (manualEntryId: string) => {
    const entry = manualEntriesById[manualEntryId];
    if (!entry) return;
    setEditingEntry(entry);
    setModalOpen(true);
  };

  const openAdd = () => {
    setEditingEntry(null);
    setModalOpen(true);
  };

  const markReviewed = async () => {
    await window.electronAPI.markDayReviewed(date);
    await loadReview();
    toast.success("Day marked as reviewed");
  };

  const unmarkReviewed = async () => {
    await window.electronAPI.unmarkDayReviewed(date);
    await loadReview();
  };

  const dateLabel = useMemo(() => {
    if (date === todayKey()) return "today";
    const parsed = new Date(date);
    return parsed.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }, [date]);

  const reviewed = review?.reviewedAt !== null && review?.reviewedAt !== undefined;
  const hasContent = review && (review.groups.length > 0 || review.unassigned.length > 0);

  return (
    <div className="p-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm your tracked time for {dateLabel}.
          </p>
        </div>
        <DayPicker date={date} onChange={setDate} />
      </header>

      <div className="mb-6 flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <div>
          <div className="text-xs text-muted-foreground">Total tracked</div>
          <div className="mt-1 font-mono text-2xl font-light tabular-nums">
            {formatTime(review?.totalSeconds ?? 0)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" />
            Add manual entry
          </Button>
          {reviewed ? (
            <Button variant="outline" size="sm" onClick={unmarkReviewed}>
              <RotateCcw className="h-3.5 w-3.5" />
              Unmark reviewed
            </Button>
          ) : (
            <Button size="sm" onClick={markReviewed} disabled={!hasContent}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark reviewed
            </Button>
          )}
        </div>
      </div>

      {reviewed && (
        <div className="mb-6 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Reviewed {review?.reviewedAt ? new Date(review.reviewedAt).toLocaleString() : ""}
        </div>
      )}

      {!hasContent ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <h3 className="text-base font-medium">Nothing tracked for {dateLabel}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a manual entry for work done off-computer.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {review!.unassigned.length > 0 && (
            <ReviewProjectGroup
              project={null}
              entries={review!.unassigned}
              projects={state.projects}
              rules={state.rules}
              totalSeconds={review!.unassigned.reduce((s, e) => s + e.seconds, 0)}
              onEditManual={openEdit}
            />
          )}
          {review!.groups.map((g) => (
            <ReviewProjectGroup
              key={g.project?.id ?? "__none__"}
              project={g.project}
              entries={g.entries}
              projects={state.projects}
              rules={state.rules}
              totalSeconds={g.totalSeconds}
              onEditManual={openEdit}
            />
          ))}
        </div>
      )}

      <ManualEntryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        date={date}
        projects={state.projects}
        entry={editingEntry ?? undefined}
        onSaved={loadReview}
      />
    </div>
  );
}
