import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { Project, Rule, RuleType } from "@shared/types";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Badge } from "@renderer/components/ui/badge";
import { toast } from "sonner";

interface Props {
  project: Project;
  rules: Rule[];
}

export function RuleEditor({ project, rules }: Props) {
  const projectRules = rules.filter((r) => r.projectId === project.id);
  const [type, setType] = useState<RuleType>("keyword");
  const [pattern, setPattern] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim() || submitting) return;
    setSubmitting(true);
    try {
      await window.electronAPI.createRule({
        projectId: project.id,
        type,
        pattern: pattern.trim(),
      });
      setPattern("");
      toast.success("Rule added");
    } catch (err) {
      toast.error("Failed to add rule");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await window.electronAPI.deleteRule(id);
    } catch (err) {
      toast.error("Failed to remove rule");
      console.error(err);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {projectRules.length === 0 ? (
          <div className="text-xs text-muted-foreground">No rules yet. Add one below.</div>
        ) : (
          projectRules.map((rule) => (
            <Badge key={rule.id} variant="outline" className="gap-1 pr-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {rule.type}
              </span>
              <span className="font-mono">{rule.pattern}</span>
              <button
                onClick={() => remove(rule.id)}
                className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Remove rule"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
      </div>

      <form onSubmit={add} className="flex gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as RuleType)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-xs"
        >
          <option value="keyword">Keyword</option>
          <option value="app">App name</option>
        </select>
        <Input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={type === "app" ? "Exact app name" : "Substring to match"}
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={!pattern.trim() || submitting}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </form>
    </div>
  );
}
