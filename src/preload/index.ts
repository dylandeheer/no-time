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
  AppSettings,
  ManualEntry,
  ManualEntryId,
  CreateManualEntryInput,
  UpdateManualEntryInput,
  DayReviewState,
  CalendarAuthStatus,
  CalendarInfo,
} from "../shared/types.js";

type TrackingListener = (state: TrackingState) => void;
type FocusReviewListener = (date: string) => void;

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

  exportData: (
    format: "csv" | "json",
    range: DateRange,
  ): Promise<{ success: boolean; filePath?: string }> =>
    ipcRenderer.invoke("export-data", { format, range }),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("get-settings"),

  updateSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke("update-settings", partial),

  clearTodayData: (): Promise<void> => ipcRenderer.invoke("clear-today-data"),

  clearAllData: (): Promise<void> => ipcRenderer.invoke("clear-all-data"),

  getDataDirectory: (): Promise<string> => ipcRenderer.invoke("get-data-directory"),

  getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),

  installUpdate: (): Promise<void> => ipcRenderer.invoke("install-update"),

  onUpdateAvailable: (listener: () => void): (() => void) => {
    const handler = (): void => listener();
    ipcRenderer.on("update-available", handler);
    return () => ipcRenderer.off("update-available", handler);
  },

  onUpdateDownloaded: (listener: () => void): (() => void) => {
    const handler = (): void => listener();
    ipcRenderer.on("update-downloaded", handler);
    return () => ipcRenderer.off("update-downloaded", handler);
  },

  onTrackingUpdate: (listener: TrackingListener): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, state: TrackingState): void => listener(state);
    ipcRenderer.on("tracking-update", handler);
    return () => ipcRenderer.off("tracking-update", handler);
  },

  getReviewState: (date: string): Promise<DayReviewState> =>
    ipcRenderer.invoke("get-review-state", date),

  markDayReviewed: (date: string): Promise<AppSettings> =>
    ipcRenderer.invoke("mark-day-reviewed", date),

  unmarkDayReviewed: (date: string): Promise<AppSettings> =>
    ipcRenderer.invoke("unmark-day-reviewed", date),

  addManualEntry: (input: CreateManualEntryInput): Promise<ManualEntry> =>
    ipcRenderer.invoke("add-manual-entry", input),

  updateManualEntry: (input: UpdateManualEntryInput): Promise<ManualEntry | null> =>
    ipcRenderer.invoke("update-manual-entry", input),

  deleteManualEntry: (id: ManualEntryId): Promise<void> =>
    ipcRenderer.invoke("delete-manual-entry", id),

  onFocusReview: (listener: FocusReviewListener): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, date: string): void => listener(date);
    ipcRenderer.on("focus-review", handler);
    return () => ipcRenderer.off("focus-review", handler);
  },

  calendarAuthStatus: (options?: { request?: boolean }): Promise<CalendarAuthStatus> =>
    ipcRenderer.invoke("calendar-auth-status", options),

  calendarList: (): Promise<CalendarInfo[]> => ipcRenderer.invoke("calendar-list"),

  calendarSync: (): Promise<void> => ipcRenderer.invoke("calendar-sync"),
};

contextBridge.exposeInMainWorld("electronAPI", api);

export type ElectronAPI = typeof api;
