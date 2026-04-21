import { useState } from "react";
import { Plus, ChevronDown, X } from "lucide-react";
import type { ActivitySummary, Project } from "@shared/types";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@renderer/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@renderer/components/ui/command";
import { CreateProjectDialog } from "@renderer/components/project/CreateProjectDialog";
import { cn } from "@renderer/lib/utils";
import { toast } from "sonner";
import { activityKey as makeKey } from "@shared/types";

interface Props {
  activity: ActivitySummary;
  project: Project | null;
  projects: Project[];
  activityKey?: string;
}

export function AssignmentDropdown({ activity, project, projects, activityKey }: Props) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const key = activityKey ?? makeKey(activity.app, activity.title);

  const assign = async (projectId: string) => {
    setOpen(false);
    try {
      await window.electronAPI.assignActivity({ activityKey: key, projectId });
      const target = projects.find((p) => p.id === projectId);
      const titleForRule = activity.title.trim();
      const truncate = (s: string, n: number): string =>
        s.length > n ? `${s.slice(0, n)}…` : s;
      const projectLabel = truncate(target?.name ?? "project", 32);
      const titleLabel = truncate(titleForRule, 28);
      toast.success(`Assigned to "${projectLabel}"`, {
        action: titleForRule
          ? {
              label: `Always for "${titleLabel}"`,
              onClick: async () => {
                try {
                  await window.electronAPI.createRule({
                    projectId,
                    type: "keyword",
                    pattern: titleForRule,
                  });
                  toast.success(`Rule created for "${titleLabel}"`);
                } catch {
                  toast.error("Failed to create rule");
                }
              },
            }
          : undefined,
      });
    } catch {
      toast.error("Failed to assign");
    }
  };

  const unassign = async () => {
    setOpen(false);
    try {
      await window.electronAPI.unassignActivity(key);
    } catch {
      toast.error("Failed to unassign");
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs transition hover:bg-accent",
              project ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: project?.color ?? "#52525b" }}
              aria-hidden
            />
            <span className="max-w-[10rem] truncate font-medium">
              {project?.name ?? "Assign"}
            </span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-0">
          <Command>
            <CommandInput placeholder="Assign to project…" />
            <CommandList>
              <CommandEmpty>No projects found.</CommandEmpty>
              {projects.length > 0 && (
                <CommandGroup heading="Projects">
                  {projects.map((p) => (
                    <CommandItem key={p.id} value={p.name} onSelect={() => assign(p.id)}>
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="truncate">{p.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="__create__"
                  onSelect={() => {
                    setOpen(false);
                    setCreateOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  New project from this…
                </CommandItem>
                {project && activity.assignedBy === "manual" && (
                  <CommandItem value="__remove__" onSelect={unassign}>
                    <X className="h-4 w-4" />
                    Remove assignment
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        usedColors={projects.map((p) => p.color)}
        defaultName={activity.app}
        activityKey={key}
        titleText="New project from activity"
        description={`Create a project and assign "${activity.app}" to it.`}
      />
    </>
  );
}
