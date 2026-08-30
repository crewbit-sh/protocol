/**
 * Message shapes for the runner protocol. The normative spec is docs/protocol/;
 * this file carries only what P0 implements, which is four of the eight
 * methods. Fields that exist only for leases and reconnect arrive in P3, and
 * adding optional fields is a compatible change within v1.
 */

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

/** What a reconnecting runner still holds, so the server can say where to resume. */
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
 * `stillMine: false` means the lease expired and the Job was re-dispatched.
 * The runner stops and reports nothing: another runner may already hold it, and
 * two completions for one `jobId` is the one thing the store must never accept.
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

/** A repository-scoped, short-lived grant. Absent in P0: there is no git yet. */
export type RepoGrant = {
  url: string;
  baseBranch: string;
  branch: string;
  token: string;
  tokenExpiresAt: string;
};

export type Harness = {
  prompt: string;
  allowedTools?: string[];
  permissionMode?: string;
  model?: string;
  maxTurns: number;
  maxBudgetUsd?: number;
  /**
   * What the checkout needs before anything runs in it, usually installing
   * dependencies.
   *
   * Its own field rather than the front of `verify`, because a prepare that
   * fails is the environment failing and a verify that fails is the change
   * failing, and a fix round told the wrong one changes the wrong thing. It also
   * belongs to every stage that builds, not only the one that checks: the code
   * stage was buying it with turns from its own ceiling.
   */
  prepare?: { command: string; timeoutSeconds?: number };
  /**
   * A command the runner runs itself, before the engine and outside it.
   *
   * An agent asked to run the tests and report is an agent that can report a
   * green it did not get, which is the fraud the eval stage exists to catch.
   */
  verify?: { command: string; timeoutSeconds?: number };
};

/**
 * What the runner collects from the workspace, and what each file means.
 *
 * The mapping is declared by the server so the runner stays generic: it applies
 * it without knowing what a plan is, and a new Stage needs no runner change.
 * `outcomes` is ordered and the first match wins, so refusals are listed before
 * success: an agent that hedges by writing both is signalling doubt, and the
 * conservative reading costs a human a minute instead of a review cycle.
 */
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
 * Event kinds are open. A runner passes through whatever its engine emits, and
 * anything unrecognised arrives as `other` for the server to store without
 * interpreting.
 */
export type JobEvent =
  | { t: "assistant"; text: string }
  | { t: "tool_use"; name: string; summary?: string }
  /**
   * `status` is what tells a window's reset time apart from a limit that was
   * actually hit, and it is optional because the engine's contract for it is
   * undocumented: absent means unknown, never means fine.
   */
  | { t: "rate_limit"; rateLimitType: string; resetsAt: number; status?: string }
  | { t: "other"; raw: unknown };

export type JobEventParams = {
  jobId: string;
  /** Monotonic per Job, so the server can detect loss and a reconnect can resume. */
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
  /** Filename to content. Returned as data; the server decides what it becomes. */
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
   * "I am still here", at `heartbeatSeconds`, and nothing else.
   *
   * Separate from `runner.ready` because that one declares capacity, and
   * repeating it would re-grant a slot the Job in flight is using. Separate from
   * `job.status` because an idle runner holds no Job.
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: a notification has no result
  "runner.alive": { params: Record<string, never>; result: void };
  // biome-ignore lint/suspicious/noConfusingVoidType: a notification has no result
  "job.status": { params: JobStatusParams; result: void };
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
