#!/usr/bin/env node
/**
 * "0.0.0" means the publish workflow's `npm version` step never ran, so this is
 * a manual `npm publish`. npm tags the newest publish `latest` whatever its
 * number, so letting it through ships the placeholder to everyone installing
 * this by name.
 */
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

if (pkg.version === "0.0.0") {
  console.error(
    "refusing to publish 0.0.0: this is the placeholder, not a released version. " +
      "Run the publish workflow, which sets the real version from CHANGELOG.md " +
      "immediately before publishing.",
  );
  process.exit(1);
}
