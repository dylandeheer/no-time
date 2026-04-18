import { contextBridge, ipcRenderer } from "electron";
import type {
  Project,
  Rule,
  ProjectId,
  RuleId,
  TrackingState,
  CreateProjectInput,
  CreateRuleInput,
  UpdateRuleInput,
  CreateProjectFromActivityInput,
  AssignActivityInput,
  DateRange,
  HistoricalState,
} from "../shared/types.js";

type TrackingListener = (state: TrackingState) => void;

const api = {
  getState: (): Promise<TrackingState> => ipcRenderer.invoke("get-state"),

  openDashboard: (): Promise<void> => ipcRenderer.invoke("open-dashboard"),

  togglePause: (): Promise<boolean> => ipcRenderer.invoke("toggle-pause"),

  getHistoricalState: (range: DateRange): Promise<HistoricalState> =>
    ipcRenderer.invoke("get-historical-state", range),

  createProject: (input: CreateProjectInput): Promise<Project> =>
    ipcRenderer.invoke("create-project", input),

  renameProject: (id: ProjectId, name: string): Promise<void> =>
    ipcRenderer.invoke("rename-project", { id, name }),

  setProjectColor: (id: ProjectId, color: string): Promise<void> =>
    ipcRenderer.invoke("set-project-color", { id, color }),

  deleteProject: (id: ProjectId): Promise<void> =>
    ipcRenderer.invoke("delete-project", { id }),

  assignActivity: (input: AssignActivityInput): Promise<void> =>
    ipcRenderer.invoke("assign-activity", input),

  unassignActivity: (activityKey: string): Promise<void> =>
    ipcRenderer.invoke("unassign-activity", { activityKey }),

  createRule: (input: CreateRuleInput): Promise<Rule> =>
    ipcRenderer.invoke("create-rule", input),

  updateRule: (input: UpdateRuleInput): Promise<Rule | null> =>
    ipcRenderer.invoke("update-rule", input),

  deleteRule: (id: RuleId): Promise<void> =>
    ipcRenderer.invoke("delete-rule", { id }),

  createProjectFromActivity: (input: CreateProjectFromActivityInput): Promise<Project> =>
    ipcRenderer.invoke("create-project-from-activity", input),

  onTrackingUpdate: (listener: TrackingListener): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, state: TrackingState): void => listener(state);
    ipcRenderer.on("tracking-update", handler);
    return () => ipcRenderer.off("tracking-update", handler);
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);

export type ElectronAPI = typeof api;
