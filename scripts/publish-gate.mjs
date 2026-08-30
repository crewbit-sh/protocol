#!/usr/bin/env node
/**
 * CHANGELOG.md is the source of the version, not package.json. This reads the
 * top `## X.Y.Z` heading, compares it against what npm already has published,
 * and says whether this is a version worth publishing.
 *
 * Nothing here bumps package.json by hand: the publish step sets it
 * transiently, right before `npm publish`, and that change is never
 * committed.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const root = new URL("..", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const changelog = readFileSync(new URL("CHANGELOG.md", root), "utf8");

const heading = changelog.match(/^##\s+(\d+\.\d+\.\d+)\s*$/m);
if (!heading) {
  console.error("CHANGELOG.md has no ## X.Y.Z heading yet; nothing to publish.");
  emit({ should_publish: "false" });
  process.exit(0);
}
const version = heading[1];

let published;
try {
  published = execSync(`npm view ${pkg.name} version`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  published = undefined; // the package has never been published
}

const shouldPublish = !published || compare(version, published) > 0;

console.log(
  shouldPublish
    ? `${pkg.name}: CHANGELOG says ${version}, npm has ${published ?? "nothing yet"}. Publishing.`
    : `${pkg.name}: CHANGELOG says ${version}, npm already has ${published}. Nothing to publish.`,
);

emit({ version, should_publish: String(shouldPublish) });

function compare(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function emit(fields) {
  const lines = `${Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
  const target = process.env.GITHUB_OUTPUT;
  if (target) appendFileSync(target, lines);
  else process.stdout.write(lines);
}
