# Lifecycle

How a connection and a Job progress, and what each side does when something
goes wrong.

## Normal sequence

```
runner                                                          server
  │                                                                │
  ├─ runner.hello (protocol, engine, stages, slots) ──────────────▶│
  │◀───────────────────────── accepted, heartbeatSeconds, resume ──┤
  │                                                                │
  ├─ runner.ready (slots: 1) ─────────────────────────────────────▶│
  │◀────────────────────────── job.assign (harness, context, repo) ┤
  ├─ accepted: true ──────────────────────────────────────────────▶│
  │                                                                │
  ├─ job.status (preparing → working) ────────────────────────────▶│
  ├─ job.event (seq 1..n, batched) ───────────────────────────────▶│
  ├─ human.notify (only when a person should know) ───────────────▶│
  ├─ job.status (finalizing) ─────────────────────────────────────▶│
  │                                                                │
  ├─ job.complete (outcome, artifacts, commits, session) ─────────▶│
  │◀─────────────────────────────────────────── acknowledged: true ┤
  │                                                                │
  ├─ runner.ready (slots: 1) ─────────────────────────────────────▶│
```

The runner cleans up its workspace only after the acknowledgement, so a
connection lost at exactly the wrong moment does not lose the artifacts.

## Liveness and leases

The runner sends `runner.alive` at `heartbeatSeconds` from the handshake, and a
server that has heard nothing for three of those may presume the connection dead.

An application frame rather than a WebSocket ping, and the runner rather than the
server, because a ping is invisible where it matters: a server may be a Cloudflare
Worker, whose runtime answers an inbound ping without waking the code and offers
no way to send one. A half-open socket there would look connected forever, and a
server that reports liveness to anything else would report a runner that is gone.

Anything the runner sends counts. A runner mid-Job is already sending
`job.status`, so this is what an idle one sends instead.

Every Job carries `leaseSeconds`. The lease is what makes a dead runner
recoverable without duplicating work:

- While the lease holds, the Job stays assigned to that runner. A reconnect
  within the window resumes it.
- When the lease expires, the server may dispatch the Job elsewhere. A runner
  that reappears afterwards must abandon it, because another runner may already
  hold it.
- A server may end that window early once the socket closes. The lease is for a
  runner that is working and saying nothing, and a working runner holds its
  connection open, so a server is entitled to give a disconnected runner a
  shorter window to reconnect in than the lease would allow. How much shorter is
  the server's own business, and a runner cannot assume it has the full lease
  once its socket has dropped.

A runner that needs longer than its lease should be sending `job.status`
throughout; a server may extend a lease for a Job that is visibly progressing.

## Reconnect

The runner reconnects with backoff and declares what it still holds:

```jsonc
{"jsonrpc":"2.0","id":1,"method":"runner.hello","params":{
  "protocol":"v1", "runnerId":"...", "slots":0,
  "activeJobs":[{"jobId":"job_01H...","lastSeq":128}]
}}
```

The server answers with what it actually received, so the runner knows where to
resume the event stream:

```jsonc
{"jsonrpc":"2.0","id":1,"result":{
  "accepted": true,
  "resume":[{"jobId":"job_01H...","ackedSeq":124,"stillMine":true}]
}}
```

`stillMine: false` means the lease expired and the Job was reassigned: the
runner stops work on it and discards its workspace without reporting anything.

## Failure handling

| Failure | Handling |
|---|---|
| Runner disconnects mid-Job | The Job stays assigned for a grace the server chooses, which may be shorter than the lease. Reconnect within it resumes from `ackedSeq`. After that the Job is re-dispatched |
| Runner dies permanently | Whatever was pushed survives on the branch. A re-dispatched Job clones that branch and continues rather than starting over |
| Server restarts | The runner reconnects with backoff. Job state lives in the server's store, not in connection memory |
| Duplicate `job.assign` after a retry | `jobId` is the idempotency key. A runner already holding it replies `accepted: true` again instead of starting a second execution |
| Events arrive out of order or with gaps | `seq` is monotonic per Job. The server orders them and can request a resend from a given sequence |
| Engine hits a rate limit | `human.notify` with the reset time, then `job.complete` with `outcome: failed`. The server re-queues after that time rather than burning the queue |
| Job exceeds its turn or budget ceiling | `outcome: partial` with work committed and pushed. This never advances to a verification stage: incomplete-by-budget is a different failure from a fixable bug |
| Workspace preparation fails (clone, checkout) | `job.complete` with `outcome: failed` and the reason in the artifacts. Do not retry internally; the server decides |

The rule behind most of these: **never discard work, and never report success
you cannot substantiate.** A conservative failure is cheap; a false success
costs a human's review time and their trust.

## Security

The runner's blast radius is bounded by what the protocol hands it:

- **No provider credential, ever.** The only secret in a Job is a short-lived
  git token scoped to one repository, expiring with the lease.
- **No query surface.** A runner cannot enumerate work items or read anything
  it was not given in `context`. There is no method for it to ask.
- **Artifacts are validated before use.** The server checks size, expected
  filenames per stage, and schema. A runner cannot cause arbitrary content to
  be published by returning it.
- **Runner tokens are per-runner and revocable.** Removing one machine is a
  single operation and rotates nothing else.

This matters because a runner is the least trusted component in the system: it
executes model-authored code against a fetched repository. The design assumes
it may be compromised and caps the damage at "pushed commits to a branch it was
already scoped to".
