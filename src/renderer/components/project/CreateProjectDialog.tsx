import { useEffect, useState } from "react";
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
import { PROJECT_COLORS, nextColor } from "@renderer/lib/colors";
import { cn } from "@renderer/lib/utils";
import { toast } from "sonner";
import type { Project } from "@shared/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usedColors?: string[];
  onCreated?: (project: Project) => void;
  defaultName?: string;
  activityKey?: string;
  titleText?: string;
  description?: string;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  usedColors = [],
  onCreated,
  defaultName = "",
  activityKey,
  titleText = "Create project",
  description = "Projects automatically group activities. You can edit rules anytime.",
}: Props) {
  const [name, setName] = useState(defaultName);
  const [color, setColor] = useState(() => nextColor(usedColors));
  const [autoRule, setAutoRule] = useState(true);
  const [rulePattern, setRulePattern] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setRulePattern(defaultName);
      setColor(nextColor(usedColors));
      setAutoRule(true);
    }
    // Only reset on open transition; usedColors/defaultName change on every
    // tracking tick and would otherwise wipe the user's input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (autoRule) setRulePattern(name);
  }, [name, autoRule]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const pattern = autoRule ? rulePattern.trim() : null;
      const project = activityKey
        ? await window.electronAPI.createProjectFromActivity({
            name: name.trim(),
            color,
            activityKey,
            autoRulePattern: pattern,
          })
        : await window.electronAPI.createProject({
            name: name.trim(),
            color,
            autoRulePattern: pattern,
          });
      toast.success(`Created "${project.name}"`);
      onCreated?.(project);
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to create project");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{titleText}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="project-name">
                Name
              </label>
              <Input
                id="project-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Website"
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Color</div>
              <div className="flex flex-wrap gap-2">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition",
                      color === c.value ? "border-foreground" : "border-transparent",
                    )}
                    style={{ backgroundColor: c.value }}
                    aria-label={c.name}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={autoRule}
                  onChange={(e) => setAutoRule(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[color:var(--primary)]"
                />
                Auto-match windows containing this keyword
              </label>
              {autoRule && (
                <Input
                  value={rulePattern}
                  onChange={(e) => setRulePattern(e.target.value)}
                  placeholder="Keyword to match"
                />
              )}
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || submitting}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
