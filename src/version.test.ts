import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { PROTOCOL_VERSION } from "./types.ts";

/**
 * CHANGELOG.md, not package.json: the version in the manifest is a
 * placeholder until the publish workflow sets it transiently, so the
 * checked-in source of truth is the top heading here.
 */
function changelogVersion(): string {
  const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  const heading = changelog.match(/^##\s+(\d+)\.\d+\.\d+\s*$/m);
  if (!heading) throw new Error("CHANGELOG.md has no ## X.Y.Z heading");
  return heading[1] as string;
}

describe("the package major tracks PROTOCOL_VERSION", () => {
  test("a runner on this package's version is never refused for speaking the wrong wire", () => {
    const wireMajor = PROTOCOL_VERSION.match(/^v(\d+)$/)?.[1];
    expect(wireMajor).toBeDefined();
    expect(changelogVersion()).toBe(wireMajor);
  });
});
