/**
 * This is what a consumer trusts by installing a wire-format package rather
 * than vendoring it: that it cannot drag anything else in. crewbit-v2 checked
 * the same fact about this package while it lived in that monorepo
 * (`test/boundary.test.ts`); that check could not survive the extraction, and
 * this is where the guarantee lives now.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("this package depends on nothing at all", () => {
  test("package.json declares no runtime dependencies", () => {
    const pkg = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(pkg.dependencies).toBeUndefined();
  });
});

/**
 * #1: `JobEvent` is a type, so it leaves no runtime trace to check `dist`
 * against - the source is what a reader and this test both have.
 */
describe("JobEvent's public surface", () => {
  const types = readFileSync(new URL("src/types.ts", import.meta.url), "utf8");

  test("names the two kinds the wire gained", () => {
    expect(types).toContain('t: "tool_result"');
    expect(types).toContain('t: "thinking"');
  });

  test("other stays, marked deprecated rather than removed", () => {
    const comment = /\/\*\*([\s\S]*?)\*\/\s*\|\s*\{ t: "other"; raw: unknown \}/.exec(types)?.[1];
    expect(comment).toMatch(/@deprecated/);
  });
});

describe("Harness's maxTurns", () => {
  const types = readFileSync(new URL("src/types.ts", import.meta.url), "utf8");

  test("is optional, so a runner falls back to its own default when a caller omits it", () => {
    expect(types).toContain("maxTurns?: number;");
  });
});

/**
 * protocol#3: `job.status`'s result gains an optional grant, so the runner's
 * own keepalive can carry a fresh one back before the current one expires.
 */
describe("job.status's result", () => {
  const types = readFileSync(new URL("src/types.ts", import.meta.url), "utf8");

  test("names JobStatusResult, carrying an optional grant", () => {
    expect(types).toContain("export type JobStatusResult = { grant?: RepoGrant }");
  });

  test("RunnerCalls wires job.status to it rather than to void", () => {
    const entry = /"job\.status":\s*\{[^}]*\}/.exec(types)?.[0] ?? "";
    expect(entry).toContain("result: JobStatusResult");
  });
});

/**
 * #328: a rebase Job starts no engine, so `prompt` - the one field every
 * other Job required - has to become optional for `rebase` to be legal
 * without one.
 */
describe("Harness's rebase", () => {
  const types = readFileSync(new URL("src/types.ts", import.meta.url), "utf8");

  test("prompt is optional, so a Job with no engine needs none", () => {
    expect(types).toContain("prompt?: string;");
  });

  test("is a bare marker, not a second place to name the base repo.baseBranch already does", () => {
    expect(types).toContain("rebase?: true;");
  });
});
