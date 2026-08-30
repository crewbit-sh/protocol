# @crewbit/protocol

What changed for someone implementing this protocol from the other side of
the wire, including someone who does not work on Crewbit.

From 1.0.0 the wire is under semantic versioning for whoever depends on it,
and what counts as a break is concrete rather than a matter of judgment:
`PROTOCOL_VERSION` in `src/types.ts` is checked on every handshake with exact
equality, so a runner declaring a version the server does not speak is
refused outright, with no negotiation and no range. That makes the rule for
this package's own major version literal: **the major here tracks the number
in `PROTOCOL_VERSION`.** While the wire stays `"v1"`, this package stays on
`1.x`, because a `2.0.0` would promise an incompatibility the handshake
cannot see. The day `PROTOCOL_VERSION` becomes `"v2"`, this package moves to
`2.0.0` in the same change, or an installer on `1.5.0` dials in and is told
`this server speaks v1` with nothing in this file explaining why.

Below that: a new optional field, a new `job.event` kind, or a new decline or
outcome value is **minor**, because [docs/README.md](./docs/README.md)
already asks every implementation to tolerate exactly those without changes.
Anything else that changes a field's meaning without changing
`PROTOCOL_VERSION` is a defect in this file's own rule, not a version by
itself.

## 1.0.0

First publication of the protocol as its own package. JSON-RPC 2.0 over one
WebSocket, and the nine methods a runner and a server speak to each other.

### Added

- `RpcPeer`: a transport-agnostic JSON-RPC 2.0 peer with correlated
  request/response, fire-and-forget notifications, and typed handlers per
  method
- The handshake (`runner.hello`), capacity announcement (`runner.ready`), and
  heartbeat (`runner.alive`)
- Job dispatch and its lifecycle: `job.assign`, `job.status`, `job.event`,
  `human.notify`, `job.complete`, and `job.cancel`
- Reconnect support: a runner declares what it still holds in `runner.hello`,
  and the server answers with what it actually received, so a dropped
  connection resumes a job rather than restarting it
