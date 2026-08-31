#!/usr/bin/env node
/**
 * Runs as prepublishOnly. "0.0.0" here means the publish workflow's `npm
 * version` step never ran, which is the shape of a manual `npm publish`: the
 * one that created this package's actual 0.0.0 on the registry, seven minutes
 * ahead of the workflow's first run. npm refuses to republish an existing
 * version, so once a real one exists a repeat is harmless — but a manual
 * publish landing before any version does is not a repeat, and npm also marks
 * the newest publish `latest` regardless of its number, so that one shipped an
 * empty package to everyone installing this by name until 1.0.0 overtook it.
 * The version comes from the top of CHANGELOG.md; nothing here writes it by
 * hand.
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
