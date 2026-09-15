# What a plan has to contain

A brief another engineer could implement without asking you anything, not a
description of the problem and not code.

Explore first. **Every path you name must exist**, unless you mark it as a new
file: a plan citing a file that is not there was written from imagination.
This package is small enough to read end to end — `src/` is the code, `docs/`
is the normative spec of the wire, `scripts/` is the release machinery — so a
guessed path is a choice, not an accident. Reuse the helper or convention the
codebase already has, and say which: the two `RpcPeer`s wired to each other in
`src/methods.test.ts`, or the rule that `CHANGELOG.md` holds the version,
which `scripts/publish-gate.mjs` and `src/version.test.ts` both already
encode.

## The five sections

Exactly these, in this order.

### Acceptance criteria

Quoted from the Spec, one per testable outcome. A sentence of the body that is
an instruction, a warning or an observation is not a criterion: it is context,
and belongs in a **Context from the Spec** note. Propose no verification the
Spec did not ask for — `npm test` and `npm run typecheck` are what this
repository runs, and a plan does not invent a third gate.

### Affected files

One line each: the path and what changes about it, so a reviewer sees the
blast radius. A test sits beside the module it covers (`src/jsonrpc.ts` and
`src/jsonrpc.test.ts`); a check about the package itself sits at the root
(`package.test.ts`, `typecheck.test.ts`). A file that does not exist yet is
marked **new file**:

```
- src/types.ts — JobAssignParams gains the optional field
- src/lease.ts — new file, the expiry check
- src/lease.test.ts — new file, the cases below
- docs/methods.md — the job.assign payload gains the same field
- CHANGELOG.md — new entry, since the wire changed
```

A change to a message shape in `src/types.ts` is a change to the wire, so the
`docs/` line and the `CHANGELOG.md` line belong in the list with it rather
than being left for the reviewer to infer.

More than roughly ten files should be split: say so instead. In a package this
size, reaching ten usually means the plan picked up a second subject.

### Approach

Short. What you are doing and, where a real choice exists, why this one and
not the obvious alternative. A choice this package keeps making is where a
rule belongs — in `RpcPeer`, which is transport-agnostic and never touches a
socket, or in the protocol itself, which every runner in every language then
has to implement. Say which side you picked. This is the section a reviewer
disagrees with, so make that possible.

### Steps

Ordered, each one a change that leaves the tree working: `npm test` and
`npm run typecheck` both pass at the end of every step, not only the last.

### Tests & evals (write first)

The contract the code stage implements against, covering the acceptance
criteria above and the change itself, no more:

```
- [unit] receive() on a malformed frame reports a parse error and does not throw
- [integration] job.complete round-trips through two wired peers and the ack reaches the runner
```

Name the input and the expected outcome, and include the edge cases you found
while exploring — the second call, the frame that is neither a request nor a
response, the peer that was closed before the call.

## Two ways to refuse

Both are successful outcomes. **Too thin**: exploring did not make the Spec
plannable — say what is missing and stop, rather than planning around the gap.
**Too big**: propose a split where each piece is independently valuable and
separately reviewable.

A plan never invents a requirement the Spec does not state, never widens scope,
and never includes code.
