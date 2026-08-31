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
