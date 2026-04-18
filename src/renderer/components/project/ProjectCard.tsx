import { useRef, useState } from "react";
import { MoreVertical, Pencil, Trash2, Palette } from "lucide-react";
import type { Project, Rule, Activity } from "@shared/types";
import { Card } from "@renderer/components/ui/card";
import { Input } from "@renderer/components/ui/input";
import { Button } from "@renderer/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@renderer/components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@renderer/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@renderer/components/ui/alert-dialog";
import { Badge } from "@renderer/components/ui/badge";
import { PROJECT_COLORS } from "@renderer/lib/colors";
import { formatTime } from "@renderer/lib/format";
import { cn } from "@renderer/lib/utils";
import { toast } from "sonner";

interface Props {
  project: Project;
  rules: Rule[];
  activities: Activity[];
  rangeTime?: number;
  rangeLabel?: string;
  onOpen?: () => void;
}

export function ProjectCard({ project, rules, activities, rangeTime, rangeLabel, onOpen }: Props) {
  const projectRules = rules.filter((r) => r.projectId === project.id);
  const todayTime = activities.reduce((sum, a) => sum + a.time, 0);
  const activityCount = activities.length;

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const saveName = async () => {
    setEditing(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === project.name) {
      setName(project.name);
      return;
    }
    try {
      await window.electronAPI.renameProject(project.id, trimmed);
    } catch {
      toast.error("Failed to rename");
      setName(project.name);
    }
  };

  const handleDelete = async () => {
    try {
      await window.electronAPI.deleteProject(project.id);
      toast.success(`Deleted "${project.name}"`);
    } catch {
      toast.error("Failed to delete");
    }
  };

  const setColor = async (color: string) => {
    try {
      await window.electronAPI.setProjectColor(project.id, color);
    } catch {
      toast.error("Failed to update color");
    }
  };

  return (
    <Card
      className="group flex cursor-pointer flex-col p-5 transition-colors hover:border-accent"
      onClick={(e) => {
        if (editing) return;
        const target = e.target as HTMLElement;
        if (target.closest('[data-card-action="true"]')) return;
        onOpen?.();
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
            aria-hidden
          />
          {editing ? (
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setName(project.name);
                  setEditing(false);
                }
              }}
              autoFocus
              className="h-7 w-auto text-base font-semibold"
              data-card-action="true"
            />
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className="truncate text-base font-semibold tracking-tight hover:text-primary"
              data-card-action="true"
            >
              {project.name}
            </button>
          )}
        </div>

        <div data-card-action="true">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
              >
                <Pencil className="h-4 w-4" /> Rename
              </DropdownMenuItem>
              <Popover>
                <PopoverTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Palette className="h-4 w-4" /> Change color
                  </DropdownMenuItem>
                </PopoverTrigger>
                <PopoverContent side="left" className="w-auto p-2">
                  <div className="flex gap-1.5">
                    {PROJECT_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => setColor(c.value)}
                        className={cn(
                          "h-6 w-6 rounded-full border-2 transition",
                          c.value === project.color ? "border-foreground" : "border-transparent",
                        )}
                        style={{ backgroundColor: c.value }}
                        aria-label={c.name}
                      />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmOpen(true);
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mb-4 flex items-baseline gap-6">
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Today
          </div>
          <div className="font-mono text-2xl font-light tabular-nums">
            {formatTime(todayTime)}
          </div>
        </div>
        {rangeTime !== undefined && rangeLabel && (
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {rangeLabel}
            </div>
            <div className="font-mono text-lg font-light tabular-nums text-muted-foreground">
              {formatTime(rangeTime)}
            </div>
          </div>
        )}
      </div>

      {projectRules.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {projectRules.slice(0, 3).map((r) => (
            <Badge key={r.id} variant="outline" className="max-w-full">
              <span className="truncate font-mono text-[11px]">{r.pattern}</span>
            </Badge>
          ))}
          {projectRules.length > 3 && (
            <Badge variant="outline">+{projectRules.length - 3}</Badge>
          )}
        </div>
      )}

      <div className="mt-auto text-xs text-muted-foreground">
        {activityCount} {activityCount === 1 ? "activity" : "activities"} ·{" "}
        {projectRules.length} {projectRules.length === 1 ? "rule" : "rules"}
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{project.name}&quot; and all its rules. Activities
              will become uncategorized. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
