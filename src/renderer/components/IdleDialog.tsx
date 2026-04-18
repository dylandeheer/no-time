import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@renderer/components/ui/alert-dialog";
import { Button } from "@renderer/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import type { Project } from "@shared/types";

interface Props {
  open: boolean;
  idleDurationSeconds: number;
  projects: Project[];
  onResolve: (choice: "discard" | "keep" | "assign", projectId?: string) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function IdleDialog({ open, idleDurationSeconds, projects, onResolve }: Props) {
  const [projectId, setProjectId] = useState<string>("");

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Welcome back!</AlertDialogTitle>
          <AlertDialogDescription>
            You were away for {formatDuration(idleDurationSeconds)}. What would you like to do with
            the idle time?
          </AlertDialogDescription>
        </AlertDialogHeader>

        {projects.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Assign to project..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!projectId}
              onClick={() => onResolve("assign", projectId)}
            >
              Assign
            </Button>
          </div>
        )}

        <AlertDialogFooter>
          <Button variant="ghost" onClick={() => onResolve("discard")}>
            Discard
          </Button>
          <Button onClick={() => onResolve("keep")}>Keep time</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
