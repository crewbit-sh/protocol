/**
 * protocol#2: `tsconfig.json`'s own `include`/`exclude` never reached a test
 * file, so a type error inside one - the shape measured while working
 * protocol#1 - passed `tsc --noEmit` and `vitest run` alike. `typecheck`
 * now runs against `tsconfig.typecheck.json` instead, and this is what
 * proves that config actually looks: `fixtures/typecheck-error/` is kept
 * broken on purpose, checked by nothing else, for exactly this.
 */
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
