import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

function gateWhenNpmViewFails(stderr) {
  const bin = mkdtempSync(join(tmpdir(), "fake-npm-"));
  writeFileSync(join(bin, "npm"), `#!/bin/sh\necho "${stderr}" >&2\nexit 1\n`, { mode: 0o755 });
  const { GITHUB_OUTPUT: _, ...env } = process.env;
  try {
    return spawnSync(process.execPath, [new URL("publish-gate.mjs", import.meta.url).pathname], {
      encoding: "utf8",
      env: { ...env, PATH: `${bin}:${env.PATH}` },
    });
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

describe("the publish gate when npm view fails", () => {
  test("E404 means the package was never published, so it says publish", () => {
    const result = gateWhenNpmViewFails("npm error code E404");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("should_publish=true");
  });

  test("any other failure fails the gate rather than reading as never published", () => {
    const result = gateWhenNpmViewFails("npm error code ETIMEDOUT");

    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("should_publish=true");
  });
});
