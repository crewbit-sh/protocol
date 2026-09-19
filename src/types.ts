/** Adding an optional field is a compatible change within a version. */
export const PROTOCOL_VERSION = "v1";

export type Stage = "plan" | "code" | "pr" | "eval";

/** The only part of `engine` the server interprets: seat-covered vs per-token. */
export type EngineAuth = "subscription" | "api-key";

export type DeclineReason =
  | "no_slots"
  | "engine_unavailable"
  | "unsupported_stage"
  | "rate_limited";

export type JobOutcome = "complete" | "not_ready" | "too_big" | "partial" | "failed";

export type ActiveJob = { jobId: string; lastSeq: number };

export type HelloParams = {
  protocol: typeof PROTOCOL_VERSION;
  runnerId: string;
  version: string;
  engine: { kind: string; version: string; auth: EngineAuth };
  stages: Stage[];
  slots: number;
  platform: { os: string; arch: string; git?: string };
  /** Non-empty when reconnecting. */
  activeJobs?: ActiveJob[];
};

/**
 * `stillMine: false` means the lease expired and the Job was re-dispatched: the
 * runner stops and reports nothing, since another runner may already hold it.
 */
export type ResumePoint = { jobId: string; ackedSeq: number; stillMine: boolean };

export type HelloResult =
  | {
      accepted: true;
      serverVersion: string;
      heartbeatSeconds: number;
      maxJobBytes: number;
      resume?: ResumePoint[];
    }
  | { accepted: false; reason: string };

export type ReadyParams = { slots: number };

/** `token` is scoped to this one repository. */
export type RepoGrant = {
  url: string;
  baseBranch: string;
  branch: string;
  token: string;
  tokenExpiresAt: string;
};

export type Harness = {
  /** Required for every Job except a `rebase` one, which starts no engine to prompt. */
  prompt?: string;
  allowedTools?: string[];
  permissionMode?: string;
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  /**
   * What the checkout needs before anything runs in it, usually installing
   * dependencies. Its failure is the environment failing, where a `verify`
   * failure is the change failing.
   */
  prepare?: { command: string; timeoutSeconds?: number };
  /** A command the runner runs itself, before the engine and outside it. */
  verify?: { command: string; timeoutSeconds?: number };
  /**
   * `true`: the runner starts no engine and reads no other field here. The whole
   * Job is rebasing the delivered branch onto `repo.baseBranch` and pushing it.
   */
  rebase?: true;
};

export type ArtifactSpec = {
  /** Filenames to read back from the workspace, if present. */
  collect: string[];
  /** First match decides the outcome. None present means `failed`. */
  outcomes: Array<{ file: string; outcome: JobOutcome }>;
};

export type JobAssignParams = {
  jobId: string;
  runId: string;
  stage: Stage;
  repo?: RepoGrant;
  /** Filename to content, already rendered by the server. The runner never fetches. */
  context: Record<string, string>;
  contextMeta?: { entries: number; dropped: { kind: string; reason: string }[] };
  harness: Harness;
  resumeSessionId?: string;
  /**
   * How long the Job stays assigned to this runner without a sign of life. A
   * reconnect inside the window resumes it; after it, the server may dispatch
   * it elsewhere.
   */
  leaseSeconds?: number;
  /** Absent means the runner reports the engine's final text and nothing else. */
  artifacts?: ArtifactSpec;
};

export type JobAssignResult =
  | { accepted: true }
  | { accepted: false; reason: DeclineReason; retryAfter?: string };

export type JobStatus = "accepted" | "preparing" | "working" | "finalizing";

export type JobStatusParams = { jobId: string; status: JobStatus; detail?: string };

/**
 * Absent when the server has nothing to hand over, which is never a reason to
 * refuse the call. Present, it is the grant to check out with from here on.
 */
export type JobStatusResult = { grant?: RepoGrant };

export type JobEvent =
  | { t: "assistant"; text: string }
  | { t: "tool_use"; name: string; summary?: string }
  /**
   * `status` tells a window's reset time apart from a limit actually hit. The
   * engine does not document it, so absent means unknown, never fine.
   */
  | { t: "rate_limit"; rateLimitType: string; resetsAt: number; status?: string }
  /** The first 200 characters of a tool result; the runner's own `raw` never leaves it. */
  | { t: "tool_result"; text: string; isError: boolean }
  /** The first 200 characters of an assistant line that carried only a thinking block. */
  | { t: "thinking"; text: string }
  /**
   * @deprecated a tool result and a thinking-only line arrive as `tool_result`
   * and `thinking` now; an older runner may still send this.
   */
  | { t: "other"; raw: unknown };

export type JobEventParams = {
  jobId: string;
  /** Monotonic per Job. */
  seq: number;
  events: JobEvent[];
};

export type NotifyLevel = "info" | "warning" | "blocked";

export type HumanNotifyParams = {
  jobId: string;
  level: NotifyLevel;
  code: string;
  message: string;
  resumeAt?: string;
};

export type CancelReason = "superseded" | "user_cancelled" | "lease_expired";

export type JobCancelParams = { jobId: string; reason: CancelReason };

/** Work is never discarded on cancellation: whatever existed is committed first. */
export type JobCancelResult = { stopped: boolean; commits?: string[] };

export type JobSession = { id: string; turns: number; costUsd: number; durationMs: number };

export type JobCompleteParams = {
  jobId: string;
  outcome: JobOutcome;
  /** Filename to content. */
  artifacts: Record<string, string>;
  commits?: string[];
  session?: JobSession;
  engineResult?: { subtype: string; terminalReason: string };
};

export type JobCompleteResult = { acknowledged: true };

/** Methods the runner invokes on the server. */
export type RunnerCalls = {
  "runner.hello": { params: HelloParams; result: HelloResult };
  // biome-ignore lint/suspicious/noConfusingVoidType: a notification has no result
  "runner.ready": { params: ReadyParams; result: void };
  /**
   * Sent every `heartbeatSeconds`, idle or not. Not a repeated `runner.ready`:
   * the server reads each of those as capacity, and would re-grant a slot the
   * Job in flight is using.
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: a notification has no result
  "runner.alive": { params: Record<string, never>; result: void };
  /** A notification, or a request from a runner that wants `result.grant` back. */
  "job.status": { params: JobStatusParams; result: JobStatusResult };
  // biome-ignore lint/suspicious/noConfusingVoidType: a notification has no result
  "job.event": { params: JobEventParams; result: void };
  // biome-ignore lint/suspicious/noConfusingVoidType: a notification has no result
  "human.notify": { params: HumanNotifyParams; result: void };
  "job.complete": { params: JobCompleteParams; result: JobCompleteResult };
};

/** Methods the server invokes on the runner. */
export type ServerCalls = {
  "job.assign": { params: JobAssignParams; result: JobAssignResult };
  "job.cancel": { params: JobCancelParams; result: JobCancelResult };
};
