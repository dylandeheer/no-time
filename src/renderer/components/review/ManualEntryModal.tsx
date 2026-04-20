import { useEffect, useState } from "react";
import type { ManualEntry, Project, ProjectId } from "@shared/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  projects: Project[];
  entry?: ManualEntry;
  onSaved?: () => void;
}

const UNASSIGNED_VALUE = "__unassigned__";

export function ManualEntryModal({ open, onOpenChange, date, projects, entry, onSaved }: Props) {
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("30");
  const [projectId, setProjectId] = useState<string>(UNASSIGNED_VALUE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setDescription(entry.description);
      const h = Math.floor(entry.seconds / 3600);
      const m = Math.floor((entry.seconds % 3600) / 60);
      setHours(String(h));
      setMinutes(String(m));
      setProjectId(entry.projectId ?? UNASSIGNED_VALUE);
    } else {
      setDescription("");
      setHours("0");
      setMinutes("30");
      setProjectId(UNASSIGNED_VALUE);
    }
  }, [open, entry]);

  const computeSeconds = (): number => {
    const h = Math.max(0, parseInt(hours || "0", 10) || 0);
    const m = Math.max(0, parseInt(minutes || "0", 10) || 0);
    return h * 3600 + m * 60;
  };

  const canSave =
    description.trim().length > 0 && computeSeconds() > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const chosenProject: ProjectId | null =
      projectId === UNASSIGNED_VALUE ? null : projectId;
    try {
      if (entry) {
        await window.electronAPI.updateManualEntry({
          id: entry.id,
          description: description.trim(),
          seconds: computeSeconds(),
          projectId: chosenProject,
        });
        toast.success("Entry updated");
      } else {
        await window.electronAPI.addManualEntry({
          date,
          description: description.trim(),
          seconds: computeSeconds(),
          projectId: chosenProject,
        });
        toast.success("Entry added");
      }
      onOpenChange(false);
      onSaved?.();
    } catch {
      toast.error("Failed to save entry");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!entry) return;
    setSaving(true);
    try {
      await window.electronAPI.deleteManualEntry(entry.id);
      toast.success("Entry deleted");
      onOpenChange(false);
      onSaved?.();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? "Edit manual entry" : "Add manual entry"}</DialogTitle>
          <DialogDescription>
            Log time not captured automatically — calls, meetings, offline work.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Description
            </label>
            <Input
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Client call with Achmea"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) save();
              }}
            />
          </div>

          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Hours</label>
              <Input
                type="number"
                min={0}
                max={23}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Minutes</label>
              <Input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="w-20"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Project</label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {entry ? (
            <Button
              variant="outline"
              size="sm"
              onClick={remove}
              disabled={saving}
              className="text-destructive hover:text-destructive"
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!canSave}>
              {entry ? "Save" : "Add entry"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
