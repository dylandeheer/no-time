import { app } from "electron";
import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { nanoid } from "nanoid";
import type { LlmState, LlmStatus } from "@shared/types";

export interface CategorizeRequest {
  activity: { app: string; title: string };
  projects: Array<{ id: string; name: string; description?: string }>;
  examples: Array<{ app: string; title: string; projectId: string; projectName: string }>;
  modelId: string;
}

export interface CategorizeResponse {
  projectId: string | null;
  confidence: number;
  reason: string;
}

interface PendingRequest {
  resolve: (value: CategorizeResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface SidecarEnvelope {
  ok: boolean;
  requestId?: string;
  op: string;
  data?: unknown;
  error?: string;
}

type StateListener = (state: LlmState) => void;

export class LLMSupervisor {
  private child: ChildProcess | null = null;
  private pending = new Map<string, PendingRequest>();
  private listeners = new Set<StateListener>();
  private state: LlmState = { status: "disabled", modelId: null };
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private desiredModelId: string;
  private stopping = false;

  constructor(modelId: string) {
    this.desiredModelId = modelId;
  }

  getState(): LlmState {
    return this.state;
  }

  onState(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setModelId(modelId: string): void {
    if (modelId === this.desiredModelId) return;
    this.desiredModelId = modelId;
    if (this.child) {
      this.restart();
    }
  }

  start(): void {
    if (this.child) return;

    const bin = resolveLlmSidecarPath();
    if (!bin) {
      this.setState({
        status: "unavailable",
        modelId: null,
        message: "LLM sidecar binary not found. Run `npm run build:sidecars`.",
      });
      return;
    }

    this.stopping = false;
    this.setState({ status: "loading", modelId: this.desiredModelId });

    try {
      this.child = spawn(bin, [], {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      this.setState({
        status: "error",
        modelId: null,
        message: `sidecar spawn failed: ${(err as Error).message}`,
      });
      return;
    }

    this.child.stdout?.on("data", (chunk) => this.onStdout(chunk.toString()));
    this.child.stderr?.on("data", (chunk) => {
      this.stderrBuffer += chunk.toString();
      if (this.stderrBuffer.length > 16_000) {
        this.stderrBuffer = this.stderrBuffer.slice(-8000);
      }
    });
    this.child.on("exit", (code) => {
      const hadPending = this.pending.size > 0;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`LLM sidecar exited (code ${code})`));
      }
      this.pending.clear();
      this.child = null;
      if (this.stopping) {
        this.setState({ status: "disabled", modelId: null });
      } else {
        this.setState({
          status: "error",
          modelId: null,
          message: `sidecar exited (${code}). stderr: ${this.stderrBuffer.slice(-400)}`,
        });
        if (!hadPending) return;
      }
    });

    this.sendLoadRequest();
  }

  stop(): void {
    this.stopping = true;
    if (this.child) {
      try {
        this.child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("LLM supervisor stopped"));
    }
    this.pending.clear();
    this.child = null;
    this.setState({ status: "disabled", modelId: null });
  }

  restart(): void {
    this.stop();
    this.stopping = false;
    this.start();
  }

  async categorize(req: CategorizeRequest): Promise<CategorizeResponse> {
    if (!this.child) this.start();
    if (this.state.status === "unavailable") {
      throw new Error("LLM sidecar unavailable");
    }
    return this.sendRequest("categorize", {
      activity: req.activity,
      projects: req.projects,
      examples: req.examples,
      modelId: req.modelId,
    });
  }

  private sendLoadRequest(): void {
    this.sendRequest("load", { modelId: this.desiredModelId }, 180_000)
      .then(() => this.setState({ status: "ready", modelId: this.desiredModelId }))
      .catch((err) => {
        this.setState({
          status: "error",
          modelId: this.desiredModelId,
          message: err.message,
        });
      });
  }

  private sendRequest<T>(
    op: string,
    payload: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.child || !this.child.stdin) {
        reject(new Error("LLM sidecar not running"));
        return;
      }
      const requestId = nanoid(12);
      const body = JSON.stringify({ op, requestId, ...payload });
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`LLM sidecar request timed out (${op})`));
      }, timeoutMs);
      this.pending.set(requestId, {
        resolve: (value) => resolve(value as unknown as T),
        reject,
        timer,
      });
      this.child.stdin.write(body + "\n", (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(requestId);
          reject(err);
        }
      });
    });
  }

  private onStdout(text: string): void {
    this.stdoutBuffer += text;
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (!line) continue;
      try {
        const envelope = JSON.parse(line) as SidecarEnvelope;
        this.routeEnvelope(envelope);
      } catch (err) {
        console.warn("LLM sidecar: unparseable line:", line.slice(0, 200), err);
      }
    }
  }

  private routeEnvelope(envelope: SidecarEnvelope): void {
    if (envelope.op === "hello") {
      return;
    }
    if (!envelope.requestId) {
      return;
    }
    const pending = this.pending.get(envelope.requestId);
    if (!pending) return;
    this.pending.delete(envelope.requestId);
    clearTimeout(pending.timer);
    if (!envelope.ok) {
      pending.reject(new Error(envelope.error ?? "sidecar returned error"));
      return;
    }
    pending.resolve(envelope.data as CategorizeResponse);
  }

  private setState(next: LlmState): void {
    this.state = next;
    for (const listener of this.listeners) {
      try {
        listener(next);
      } catch {
        // ignore listener error
      }
    }
  }
}

function resolveLlmSidecarPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath ?? "", "bin", "no-time-llm"),
    path.join(app.getAppPath(), "assets", "bin", "no-time-llm"),
    path.join(process.cwd(), "assets", "bin", "no-time-llm"),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

export function llmSidecarAvailable(): boolean {
  return resolveLlmSidecarPath() !== null;
}

export function describeStatus(status: LlmStatus): string {
  switch (status) {
    case "disabled":
      return "Off";
    case "unavailable":
      return "Sidecar missing";
    case "loading":
      return "Loading model…";
    case "downloading":
      return "Downloading model…";
    case "ready":
      return "Ready";
    case "error":
      return "Error";
  }
}
