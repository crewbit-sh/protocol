import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

describe("the typecheck config reaches into test files", () => {
  test("a fixture .test.ts that misuses an exported type fails tsc", () => {
    const result = spawnSync(
      "tsc",
      ["-p", "fixtures/typecheck-error/tsconfig.json", "--noEmit"],
      { encoding: "utf8" },
    );

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("bad.test.ts");
    expect(result.stdout).toContain("isError");
  });
});
