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

describe("Harness's rebase", () => {
  const types = readFileSync(new URL("src/types.ts", import.meta.url), "utf8");

  test("prompt is optional, so a Job with no engine needs none", () => {
    expect(types).toContain("prompt?: string;");
  });

  test("is a bare marker, not a second place to name the base repo.baseBranch already does", () => {
    expect(types).toContain("rebase?: true;");
  });
});
