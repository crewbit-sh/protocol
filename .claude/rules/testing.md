# What counts as a test here

One document, because the code stage writes against it and the eval stage
judges against it. The gates are `npm test` (`vitest run`, with `fixtures/`
excluded on purpose) and `npm run typecheck` (`tsc -p
tsconfig.typecheck.json --noEmit`, which reaches into `*.test.ts` as well as
`src/`). Both pass, or the change is not done.

## Failing first

Write the test, watch it fail, then implement. A test written after the code
asserts what the code does, not what was wanted.

## Assert behaviour, not implementation

Name an input and an expected outcome, not a private function, a count of calls
to a helper, or an intermediate value. `RpcPeer` keeps its state in private
`#` fields for this reason: the seam a caller uses is `request`, `notify`,
`receive` and `close`, and a test drives those and reads the frames that come
back out of `send`. Would this test survive a rewrite of the internals that
kept the behaviour? Test through the seam the caller uses.

## What to cover

Every stated acceptance criterion, one test each. The edge cases you find while
implementing: empty input, the second call, the concurrent call, the failure of
what you depend on — a frame that is not JSON, a frame that is neither a
request nor a response, a call on a peer that is already closed, a handler
that throws something that is not an `Error`. And the boundary you are
trusting: every inbound frame here is untrusted input arriving from the other
side of a socket this package does not own, and a dropped `job.complete` is
work already paid for and lost.

## The shape: unit tests carry the coverage, integration proves the flow

A unit test needs nothing running, and every branch a module can take is
reachable that way: that is where coverage comes from. Nothing in this package
opens a socket, so there is no excuse for a branch left to integration.
Integration is the other job: the real components meeting on a completed flow
— two `RpcPeer`s wired to each other in memory, as `src/jsonrpc.test.ts` and
`src/methods.test.ts` both do, carrying a method from call to result; or a
real `tsc` spawned against `fixtures/`, as `typecheck.test.ts` does, because
whether a config reaches a file is not a question source can answer about
itself. One per flow is usually enough.

Both, never one instead of the other: coverage reached by integration hides
the module with no test of its own.

## Waiting: on the event, never on the clock

**A test may not sleep, and it may not poll**, `expect.poll` and a `waitFor`
helper included. Both put the assertion at a time the test picked rather than
when the thing happened. Wait on the event: something caused it, and that is a
seam. In this package the seam is nearly always a promise — `await` the one
`request` returned, which the response frame resolves, rather than waiting for
a frame to appear in an array.

Two waits are legitimate, and both say so where they sit. **Proving an
absence**, where the assertion is that nothing moved. And **state outside this
process** that raises no event, such as a spawned compiler.

## What does not count

A test that cannot fail. A snapshot of unexamined output. A test for what the
type system already guarantees — the direction maps in `src/types.ts` make a
wrong method name or a wrong payload a compile error, and `npm run typecheck`
is what catches it. A skipped test. Coverage as a goal.

A test genuinely hard to write is a design signal: say so, and why.
