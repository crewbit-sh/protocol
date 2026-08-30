# @crewbit/protocol

The JSON-RPC 2.0 wire protocol between the [Crewbit](https://crewbit.sh) server
and a runner. A runner executes work and knows nothing else: no provider
credential, no issue tracker, no server-side state.

```
npm install @crewbit/protocol
```

## What is in this package

- `RpcPeer`, a transport-agnostic JSON-RPC 2.0 peer: requests correlated by id,
  fire-and-forget notifications, and typed handlers per method. It never
  touches a socket; you supply `send` and feed it `receive`.
- The full set of message shapes both sides exchange: the handshake, capacity
  announcement, heartbeat, job assignment and cancellation, status and batched
  event streaming, human-facing notices, and job completion with artifacts and
  outcome.

## Where to read the spec

[docs/README.md](./docs/README.md) is the durable reference: transport,
message conventions, versioning, and how to implement a runner in any
language. [docs/methods.md](./docs/methods.md) has every method with full
payloads, and [docs/lifecycle.md](./docs/lifecycle.md) has the normal
sequence, leases, reconnect, and failure handling.

## Versioning

[CHANGELOG.md](./CHANGELOG.md) is where a released version and its
compatibility promise are written down, and it is the source of truth for
what gets published: nothing publishes a version this file does not
announce.
