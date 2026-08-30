# Methods

Eight methods. Everything else (human approval gates, opening pull requests,
changing state in an issue tracker) happens on the server and never touches
this protocol.

| Method | Direction | Kind | Purpose |
|---|---|---|---|
| [`runner.hello`](#runnerhello) | runner → server | request | Handshake: engine, stages, slots |
| [`runner.ready`](#runnerready) | runner → server | notification | Announce free capacity |
| [`job.assign`](#jobassign) | server → runner | request | Dispatch a Job; accept or decline |
| [`job.status`](#jobstatus) | runner → server | notification | Coarse lifecycle |
| [`job.event`](#jobevent) | runner → server | notification | Batched transcript |
| [`human.notify`](#humannotify) | runner → server | notification | Something a person should see |
| [`job.complete`](#jobcomplete) | runner → server | request | Outcome + artifacts; server must ack |
| [`job.cancel`](#jobcancel) | server → runner | request | Stop, preserve work, reply |

## runner.hello

The runner speaks first. It declares what it can do; the server decides what to
send it.

```jsonc
// → request
{"jsonrpc":"2.0","id":1,"method":"runner.hello","params":{
  "protocol": "v1",
  "runnerId": "<stable id for this runner>",
  "version": "0.4.1",
  "engine": {"kind":"<opaque>","version":"...","auth":"subscription"},
  "stages": ["plan","code","pr","eval"],
  "slots": 1,
  "platform": {"os":"...","arch":"...","git":"2.44.0"},
  "activeJobs": []                    // non-empty when reconnecting
}}

// ← result
{"jsonrpc":"2.0","id":1,"result":{
  "accepted": true,
  "serverVersion": "0.4.1",
  "heartbeatSeconds": 30,
  "maxJobBytes": 1048576,
  "resume": []                        // per active job: last acknowledged seq
}}
```

`engine.auth` is `"subscription"` or `"api-key"` and is the only part of
`engine` the server interprets: it distinguishes work billed per token from
work covered by a seat, which drives routing. `engine.kind` and
`engine.version` are opaque strings, recorded for diagnostics.

A server that cannot serve the declared protocol version or stage set replies
`{"accepted": false, "reason": "..."}` and closes. Refusing here beats failing
mid-Job.

## runner.ready

Capacity is announced, never assumed. Without this the server pushes work at a
busy runner and finds out by timeout.

```jsonc
// → notification
{"jsonrpc":"2.0","method":"runner.ready","params":{"slots":1}}
```

Send it after the handshake and after every Job finishes. `slots: 0` means stop
sending work without disconnecting.

## runner.alive

```jsonc
// → notification
{"jsonrpc":"2.0","method":"runner.alive","params":{}}
```

"I am still here", at `heartbeatSeconds`, and nothing else. Send it while idle;
a runner mid-Job is already sending `job.status`, and either counts.

Not `runner.ready` repeated: that one declares capacity, and re-declaring it
while a Job is in flight hands back the slot the Job is using.

## job.assign

```jsonc
// ← request
{"jsonrpc":"2.0","id":42,"method":"job.assign","params":{
  "jobId": "job_01H...",
  "runId": "run_01H...",
  "stage": "code",
  "repo": {
    "url": "https://github.com/acme/api.git",
    "baseBranch": "main",
    "branch": "feat/issue-318",
    "token": "ghs_...",
    "tokenExpiresAt": "2026-08-07T18:40:00Z"
  },
  "context": {
    "spec.md": "...",
    "plan.md": "## Plan\n...",
    "feedback.md": "..."
  },
  "contextMeta": {
    "entries": 14,
    "dropped": [{"kind":"repo_map","reason":"budget"}]
  },
  "harness": {
    "prompt": "...",
    "allowedTools": ["Read","Edit","Write","Bash","Glob","Grep"],
    "permissionMode": "acceptEdits",
    "model": "opus",
    "maxTurns": 80,
    "maxBudgetUsd": 10
  },
  "resumeSessionId": "a7ea0a98-...",
  "leaseSeconds": 3600
}}

// → result
{"jsonrpc":"2.0","id":42,"result":{"accepted":true}}
```

**The payload is self-contained.** `context` is a map of filename to content,
selected by the server for this Stage and already rendered. The runner writes
it to the workspace and never fetches anything.

`contextMeta.dropped` records what the server had to leave out to fit the
budget. It is what answers "did the agent even see that?" when a run
disappoints.

Declining is a normal outcome:

```jsonc
{"jsonrpc":"2.0","id":42,"result":{
  "accepted": false,
  "reason": "rate_limited",           // no_slots | engine_unavailable | unsupported_stage | rate_limited
  "retryAfter": "2026-08-07T18:00:00Z"
}}
```

A runner that declines is healthier than one that accepts and stalls. Unknown
reasons are treated as a generic decline by the server.

## job.status

```jsonc
// → notification
{"jsonrpc":"2.0","method":"job.status","params":{
  "jobId":"job_01H...",
  "status":"working",                 // accepted | preparing | working | finalizing
  "detail":"worktree ready, engine started"
}}
```

The server may mirror this outward (for example onto the tracked work item) so
a person can follow progress. That is a server concern; the runner just
reports.

## job.event

```jsonc
// → notification
{"jsonrpc":"2.0","method":"job.event","params":{
  "jobId":"job_01H...",
  "seq": 128,                         // monotonic per Job
  "events":[
    {"t":"assistant","text":"Writing the failing test first..."},
    {"t":"tool_use","name":"Edit","summary":"src/auth.ts"},
    {"t":"rate_limit","rateLimitType":"five_hour","resetsAt":1785956400,"status":"allowed"}
  ]
}}
```

Batched, because a chatty stage produces hundreds of messages and one frame
each is waste. `seq` lets the server detect loss and lets a reconnecting runner
resume from the last acknowledged sequence.

Event kinds are open. A runner passes through anything its engine emits;
unknown kinds arrive as `{"t":"other","raw":...}` and the server stores them
without interpreting.

## human.notify

```jsonc
// → notification
{"jsonrpc":"2.0","method":"human.notify","params":{
  "jobId":"job_01H...",
  "level":"warning",                  // info | warning | blocked
  "code":"rate_limited",
  "message":"Subscription five-hour window exhausted, resumes 15:00",
  "resumeAt":"2026-08-07T18:00:00Z"
}}
```

The runner cannot reach a person directly, having no provider credential. It
reports the condition and the server chooses the channel. `level: "blocked"`
tells the server this Run needs human attention.

## job.complete

A request, not a notification, because the runner may not clean up before the
server confirms it has the artifacts.

```jsonc
// → request
{"jsonrpc":"2.0","id":77,"method":"job.complete","params":{
  "jobId":"job_01H...",
  "outcome":"complete",               // complete | not_ready | too_big | partial | failed
  "artifacts":{
    "pr-body.md":"## Spec\n...",
    "verdict.json":"{...}"
  },
  "commits":["a1b2c3d","e4f5g6h"],    // already pushed
  "session":{"id":"a7ea...","turns":63,"costUsd":4.12,"durationMs":903411},
  "engineResult":{"subtype":"success","terminalReason":"completed"}
}}

// ← result
{"jsonrpc":"2.0","id":77,"result":{"acknowledged":true}}
```

Outcomes:

| Value | Meaning |
|---|---|
| `complete` | The stage did what it was asked |
| `not_ready` | The work item lacks what the stage needs (a plan stage refusing to guess) |
| `too_big` | Cannot land as one focused change; a split is proposed in the artifacts |
| `partial` | Hit the turn or budget ceiling with work committed. **Never advances to eval**: incomplete-by-budget is a different failure from fixable-bug |
| `failed` | The stage could not finish and left nothing usable |

Artifacts come back **as data**. The runner posts nothing anywhere. The server
decides what each artifact becomes, and validates size, expected filenames per
stage, and schema before applying any of it.

`session.costUsd` may be an estimate rather than a billed amount, depending on
the engine and its authentication. Treat it as approximate.

## job.cancel

```jsonc
// ← request
{"jsonrpc":"2.0","id":91,"method":"job.cancel","params":{
  "jobId":"job_01H...",
  "reason":"superseded"               // superseded | user_cancelled | lease_expired
}}

// → result
{"jsonrpc":"2.0","id":91,"result":{"stopped":true,"commits":["a1b2c3d"]}}
```

The runner interrupts the engine, commits whatever is on disk, pushes, and
replies. Work is never discarded on cancellation.
