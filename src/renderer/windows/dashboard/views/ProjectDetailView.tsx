import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { Activity, Client, Project, TrackingState } from "@shared/types";
import { Button } from "@renderer/components/ui/button";
import { Card } from "@renderer/components/ui/card";
import { Input } from "@renderer/components/ui/input";
import { Switch } from "@renderer/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { RuleEditor } from "@renderer/components/project/RuleEditor";
import { formatTime } from "@renderer/lib/format";
import { toast } from "sonner";

interface Props {
  state: TrackingState;
  project: Project;
  onBack: () => void;
}

const NO_CLIENT = "__none__";

export function ProjectDetailView({ state, project, onBack }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>(project.clientId ?? NO_CLIENT);
  const [hourlyRateEuros, setHourlyRateEuros] = useState<string>(
    typeof project.hourlyRateCents === "number"
      ? (project.hourlyRateCents / 100).toString()
      : "",
  );
  const [billable, setBillable] = useState<boolean>(project.billable);

  useEffect(() => {
    window.electronAPI.listClients().then(setClients);
  }, []);

  useEffect(() => {
    setClientId(project.clientId ?? NO_CLIENT);
    setHourlyRateEuros(
      typeof project.hourlyRateCents === "number"
        ? (project.hourlyRateCents / 100).toString()
        : "",
    );
    setBillable(project.billable);
  }, [project.id, project.clientId, project.hourlyRateCents, project.billable]);

  const saveBilling = async () => {
    try {
      const parsedRate = hourlyRateEuros.trim()
        ? Math.round(Number(hourlyRateEuros.replace(",", ".")) * 100)
        : null;
      await window.electronAPI.updateProjectBilling({
        id: project.id,
        clientId: clientId === NO_CLIENT ? null : clientId,
        hourlyRateCents: parsedRate !== null && Number.isFinite(parsedRate) ? parsedRate : null,
        billable,
      });
      toast.success("Billing updated");
    } catch {
      toast.error("Failed to save");
    }
  };

  const activities = useMemo(
    () =>
      Object.values(state.activities)
        .filter((a) => a.projectId === project.id)
        .sort((a, b) => b.time - a.time),
    [state.activities, project.id],
  );

  const totalTime = activities.reduce((sum, a) => sum + a.time, 0);

  return (
    <div className="p-10">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 -ml-2">
        <ChevronLeft className="h-4 w-4" />
        Projects
      </Button>

      <header className="mb-8 flex items-center gap-3">
        <span
          className="h-4 w-4 rounded-full"
          style={{ backgroundColor: project.color }}
          aria-hidden
        />
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Today
          </div>
          <div className="font-mono text-3xl font-light tabular-nums">{formatTime(totalTime)}</div>
        </Card>
        <Card className="p-5">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Activities
          </div>
          <div className="font-mono text-3xl font-light tabular-nums">{activities.length}</div>
        </Card>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-tight">Billing</h2>
        <Card className="p-5">
          <div className="grid grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Client</span>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>No client</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Hourly rate</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={hourlyRateEuros}
                onChange={(e) => setHourlyRateEuros(e.target.value)}
                placeholder="Default from client"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Billable</span>
              <div className="flex h-9 items-center">
                <Switch checked={billable} onCheckedChange={setBillable} />
              </div>
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={saveBilling}>
              Save billing
            </Button>
          </div>
        </Card>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-tight">Rules</h2>
        <Card className="p-5">
          <RuleEditor project={project} rules={state.rules} />
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-tight">Activities</h2>
        <Card>
          {activities.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No activities yet. Activities matching this project's rules will appear here.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {activities.map((a) => (
                <ActivityListItem key={`${a.app}::${a.title}`} activity={a} />
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function ActivityListItem({ activity }: { activity: Activity }) {
  return (
    <li className="flex items-center justify-between px-5 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{activity.title}</div>
        <div className="truncate text-xs text-muted-foreground">{activity.app}</div>
      </div>
      <div className="ml-4 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
        {formatTime(activity.time)}
      </div>
    </li>
  );
}
