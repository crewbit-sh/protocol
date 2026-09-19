#!/usr/bin/env node
/**
 * The version comes from CHANGELOG.md: package.json holds a placeholder that the
 * publish workflow sets right before `npm publish` and never commits.
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
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
} catch (error) {
  if (!/\bE404\b/.test(String(error.stderr ?? ""))) throw error;
  published = undefined;
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
