# Is this Spec workable?

You are judging one thing: can this be worked without guessing? Not whether it
is a good idea, not how hard it is, not how you would build it.

**Fill the routine gap from the tree, and say so.** A Spec that says "bump the
version" without saying where is not thin: read the tree, find the one thing
it can mean — `CHANGELOG.md`'s top `## X.Y.Z` heading, which `README.md`,
`scripts/publish-gate.mjs` and `src/version.test.ts` all treat as the source
of truth, `package.json` being a placeholder the publish workflow sets
transiently — and write down that you read it that way. The gap is routine
when the tree answers it without a decision.

**Ask when the gap is a decision.** "Requests should time out" is one of
those: a timer inside `RpcPeer` in `src/jsonrpc.ts`, which every consumer of
this package then gets, and a lease the protocol already describes in
`docs/lifecycle.md` are materially different work, and the tree does not say
which was meant. Not yours to guess, and not yours to refuse either: it is a
question for whoever wrote the Spec.

**Refuse when there is nothing to read.** "Make the protocol better" names no
surface a grep could land on, and no reading of the tree resolves that.

## Required

A Spec is workable when all three are present.

**A stated problem, distinct from a stated solution.** "Add a `job.ping`
method" is a solution with the problem missing. "A runner holding a Job for
forty minutes with no output cannot be told apart from a dead one" is a
problem. A solution is welcome as well, and never sufficient alone.

**Testable acceptance criteria.** An outcome that can be turned into a failing
test before any code exists — here, a `*.test.ts` that `npm test` runs, or a
type error `npm run typecheck` catches. "The docs should be clearer" is not
testable; "`docs/methods.md` documents every method `src/types.ts` declares,
and adding one to either side alone fails the suite" is.

**A named surface.** Where in the protocol this lives, at the granularity the
reporter can be expected to know: a method, a message shape, a peer, a script.
"`job.assign`'s payload", "what `RpcPeer.receive` does with a frame that is
neither a request nor a response" and "the publish gate" are surfaces;
"somewhere in the wire format" is not.

## Not required

Their absence is never a reason to refuse: a design or an architecture, file
paths or which module in `src/` it lands in, an estimate or a priority, a test
plan.

## When something is missing

Name the item and what would satisfy it. "Needs more detail" is a rejection
nobody can act on. Do not propose the answer: a guess in a question becomes the
requirement.
