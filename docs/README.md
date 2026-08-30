# Crewbit runner protocol v1

The contract between the Crewbit **server** and a **runner**. A runner
executes Jobs and knows nothing else: no provider, no credentials, no issue
tracker, no state machine.

This directory is the durable reference and is **self-contained**: it
specifies messages and behavior only, says nothing about how either side is
built, and does not depend on any other document. It can be published on its
own.

| Doc | Contents |
|---|---|
| [methods.md](./methods.md) | The nine methods, with full payloads |
| [lifecycle.md](./lifecycle.md) | Normal sequence, leases, reconnect, failure handling, security |

## Terms

Only four, defined here as a runner sees them.

| Term | Meaning to a runner |
|---|---|
| **Job** | One unit of work: execute one Stage. Carries everything needed to do it. The unit of dispatch, lease, and completion |
| **Stage** | The kind of Job: `plan`, `code`, `pr`, `eval`. Determines the prompt, the tool allowlist and the budget, all of which arrive inside the Job |
| **Run** | The server-side process a Job belongs to. A runner only ever echoes its `runId` |
| **Spec** | The work item a Run is about. A runner never reads it from anywhere; the relevant parts arrive as files in the Job |

A runner holds no state between Jobs and needs no model of the server beyond
these.

## Transport

**JSON-RPC 2.0 over a single WebSocket**, bidirectional. The runner opens the
connection and both sides then send requests and notifications on it.

```
wss://<server>/runner/v1        Authorization: Bearer <runner token>
```

A server on the same machine is reached the same way over `ws://127.0.0.1`.
Nothing in the protocol distinguishes the two cases.

The runner always dials out, so it needs no inbound port and no public
address. That is what lets one protocol serve a workstation behind a corporate
proxy and an ephemeral cloud worker, with no NAT traversal and no firewall
exception.

**Why not long-poll**: the server needs to *send* (`job.assign`, `job.cancel`)
and the runner needs to *stream* (events, status). Long-poll does the first
awkwardly and the second not at all without a second channel.

## Message conventions

Standard JSON-RPC 2.0. Two distinctions carry meaning:

- **Request** (has `id`): the sender needs an answer, and the answer changes
  what happens next. Used for `job.assign` (accept or decline) and
  `job.complete` (the runner may not clean up before the acknowledgement).
- **Notification** (no `id`): fire and forget. Status, events, and human
  notices, where waiting for a reply would only add latency.

The word "notification" is reserved for that JSON-RPC meaning. A message
intended for a *person* is `human.notify`, deliberately not named
`notification.*`.

## Versioning

The version is in the path (`/runner/v1`). A runner declares its protocol
version in `runner.hello`; a server that cannot serve it refuses the handshake
rather than failing later mid-Job.

Within v1, these are compatible changes every implementation must tolerate:

- new optional fields in any payload: ignore what you do not recognize
- new event kinds in `job.event`: pass through as opaque
- new decline reasons and outcome values: treat unknown as a generic failure

Breaking changes get a new path. Nothing is versioned per method.

## Implementing a runner

The protocol is transport and JSON, so a runner can be written in any language.
The full loop is small. A conforming runner:

1. Connects and sends `runner.hello` with its engine, supported stages, and
   slot count. Waits for `accepted: true`.
2. Sends `runner.ready` whenever it has free capacity.
3. On `job.assign`, replies immediately with accept or decline. Declining is
   normal, not an error.
4. Prepares an isolated workspace, writes `context` to disk, and runs the
   engine with the given `harness`.
5. Streams `job.status` and batched `job.event` with a monotonic `seq`.
6. Sends `job.complete` with the outcome and artifacts **as data**, then waits
   for the acknowledgement before cleaning up.
7. Honors `job.cancel` by interrupting, committing whatever exists, pushing,
   and replying. Never discards work.

What a runner must **never** do: call a provider API, read or store a provider
credential, decide Run state, or post anything anywhere. Everything
provider-visible is a server action, decided from the artifacts the runner
returned.

The only secret a runner ever holds is the short-lived, repository-scoped git
token inside a Job.

## Engines

The Job's `harness` describes work in terms every coding agent shares: a
prompt, a tool allowlist, a permission mode, a model hint, and turn and budget
ceilings. The protocol does not name an engine or require a particular one.

A runner declares what it has in `runner.hello`. The server uses only
`engine.auth` for routing, since that distinguishes work billed per token from
work covered by a seat; `engine.kind` is opaque to the server.
