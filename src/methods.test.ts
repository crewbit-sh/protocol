/**
 * The eight methods, round-tripped through two peers wired to each other. This
 * is what proves the two direction maps are complete and agree: a method the
 * server can call that the runner cannot answer fails to compile, and one whose
 * payload drifts fails here.
 */

import { describe, expect, test } from "vitest";
import { type Handlers, RpcPeer } from "./jsonrpc.ts";
import {
  type HelloParams,
  type JobAssignParams,
  PROTOCOL_VERSION,
  type RunnerCalls,
  type ServerCalls,
} from "./types.ts";

function wire(server: Handlers<RunnerCalls>, runner: Handlers<ServerCalls>) {
  let toServer = (_: string) => {};
  let toRunner = (_: string) => {};

  const runnerPeer = new RpcPeer<RunnerCalls, ServerCalls>({
    send: (f) => toServer(f),
    handlers: runner,
    onError: () => {},
  });
  const serverPeer = new RpcPeer<ServerCalls, RunnerCalls>({
    send: (f) => toRunner(f),
    handlers: server,
    onError: () => {},
  });

  toServer = (f) => serverPeer.receive(f);
  toRunner = (f) => runnerPeer.receive(f);
  return { runnerPeer, serverPeer };
}

const HELLO: HelloParams = {
  protocol: PROTOCOL_VERSION,
  runnerId: "runner_1",
  version: "0.0.0",
  engine: { kind: "fake", version: "0", auth: "subscription" },
  stages: ["plan", "code", "pr", "eval"],
  slots: 1,
  platform: { os: "darwin", arch: "arm64" },
};

const ASSIGN: JobAssignParams = {
  jobId: "job_1",
  runId: "run_1",
  stage: "code",
  context: { "spec.md": "..." },
  harness: { prompt: "go", maxTurns: 1 },
  leaseSeconds: 3600,
};

describe("runner to server", () => {
  test("hello carries what it still holds, and the answer says where to resume", async () => {
    const { runnerPeer } = wire(
      {
        "runner.hello": (p) => ({
          accepted: true,
          serverVersion: "0.0.0",
          heartbeatSeconds: 30,
          maxJobBytes: 1024,
          resume: (p.activeJobs ?? []).map((j) => ({
            jobId: j.jobId,
            ackedSeq: j.lastSeq - 4,
            stillMine: true,
          })),
        }),
      },
      {},
    );

    const result = await runnerPeer.request("runner.hello", {
      ...HELLO,
      activeJobs: [{ jobId: "job_1", lastSeq: 128 }],
    });

    expect(result.accepted).toBe(true);
    if (result.accepted)
      expect(result.resume).toEqual([{ jobId: "job_1", ackedSeq: 124, stillMine: true }]);
  });

  test("a refused handshake says why and carries no resume", async () => {
    const { runnerPeer } = wire(
      { "runner.hello": () => ({ accepted: false, reason: "this server speaks v1" }) },
      {},
    );

    const result = await runnerPeer.request("runner.hello", HELLO);

    expect(result).toEqual({ accepted: false, reason: "this server speaks v1" });
  });

  test("status is a notification and expects no reply", () => {
    const seen: string[] = [];
    const { runnerPeer } = wire({ "job.status": (p) => void seen.push(p.status) }, {});

    runnerPeer.notify("job.status", {
      jobId: "job_1",
      status: "working",
      detail: "engine started",
    });

    expect(seen).toEqual(["working"]);
  });

  test("events arrive batched, with a sequence the server can order by", () => {
    const batches: number[] = [];
    const { runnerPeer } = wire({ "job.event": (p) => void batches.push(p.seq) }, {});

    runnerPeer.notify("job.event", {
      jobId: "job_1",
      seq: 128,
      events: [
        { t: "assistant", text: "writing the failing test" },
        { t: "tool_use", name: "Edit", summary: "src/auth.ts" },
        { t: "rate_limit", rateLimitType: "five_hour", resetsAt: 1786168200 },
      ],
    });

    expect(batches).toEqual([128]);
  });

  test("human.notify carries a level the server can route on", () => {
    const levels: string[] = [];
    const { runnerPeer } = wire({ "human.notify": (p) => void levels.push(p.level) }, {});

    runnerPeer.notify("human.notify", {
      jobId: "job_1",
      level: "blocked",
      code: "rate_limited",
      message: "five-hour window exhausted",
      resumeAt: "2026-08-10T18:00:00Z",
    });

    expect(levels).toEqual(["blocked"]);
  });
});

describe("server to runner", () => {
  test("assign carries a lease, and the runner accepts or declines", async () => {
    const { serverPeer } = wire({}, { "job.assign": () => ({ accepted: true }) });

    expect(await serverPeer.request("job.assign", ASSIGN)).toEqual({ accepted: true });
  });

  test("declining names a reason the server can act on", async () => {
    const { serverPeer } = wire(
      {},
      {
        "job.assign": () => ({
          accepted: false,
          reason: "rate_limited",
          retryAfter: "2026-08-10T18:00:00Z",
        }),
      },
    );

    const result = await serverPeer.request("job.assign", ASSIGN);

    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.reason).toBe("rate_limited");
  });

  test("cancel is a request, and the reply says what was preserved", async () => {
    const { serverPeer } = wire(
      {},
      { "job.cancel": () => ({ stopped: true, commits: ["a1b2c3d"] }) },
    );

    expect(
      await serverPeer.request("job.cancel", { jobId: "job_1", reason: "lease_expired" }),
    ).toEqual({
      stopped: true,
      commits: ["a1b2c3d"],
    });
  });
});
