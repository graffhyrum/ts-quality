#!/usr/bin/env bun
/**
 * Read-only readiness check for verify-crap4ts.
 * Exit 0 = safe to drive. Exit 1 = fix before driving.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..", "..", "..");
const failures: string[] = [];

function ok(msg: string) {
  console.log(`OK  ${msg}`);
}
function fail(msg: string) {
  failures.push(msg);
  console.error(`FAIL ${msg}`);
}

const bunVer = Bun.version;
if (!bunVer) fail("Bun runtime missing");
else ok(`Bun ${bunVer}`);

const pkgPath = join(root, "package.json");
if (!existsSync(pkgPath)) fail(`missing ${pkgPath}`);
else {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string; name: string };
  ok(`package ${pkg.name}@${pkg.version}`);
  const proc = Bun.spawnSync(["bun", "src/index.ts", "--version"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const printed = new TextDecoder().decode(proc.stdout).trim();
  if (proc.exitCode !== 0) fail(`--version exit ${proc.exitCode}`);
  else if (printed !== pkg.version) fail(`--version ${printed} != package.json ${pkg.version}`);
  else ok(`CLI --version matches ${pkg.version}`);
}

if (!existsSync(join(root, "node_modules"))) fail("node_modules missing — run bun install");
else ok("node_modules present");

const fixtures = [
  "test/fixtures/simple.ts",
  "test/fixtures/coverage-istanbul.json",
  "test/fixtures/coverage.lcov",
];
for (const f of fixtures) {
  if (!existsSync(join(root, f))) fail(`missing fixture ${f}`);
  else ok(`fixture ${f}`);
}

if (failures.length > 0) {
  console.error(`\nDoctor failed (${failures.length}). Do not drive.`);
  process.exit(1);
}
console.log("\nDoctor passed. Safe to drive.");
process.exit(0);
