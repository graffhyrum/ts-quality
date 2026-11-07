import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { FileSystem } from "../types";
import { bunAdapter, detect } from "./bun";

function makeFs(overrides: Partial<FileSystem> = {}): FileSystem {
  return {
    exists: async () => false,
    readText: async () => null,
    realPath: async (p) => p,
    ...overrides,
  };
}

const noPackageJson = makeFs();

const withLockb = makeFs({ exists: async (p) => p.endsWith("bun.lockb") });
const withLock = makeFs({ exists: async (p) => p.endsWith("bun.lock") });

const withBunDep = makeFs({
  readText: async () => JSON.stringify({ name: "test", dependencies: { bun: "*" } }),
});

const withTypesBunDev = makeFs({
  readText: async () => JSON.stringify({ name: "test", devDependencies: { "@types/bun": "*" } }),
});

const withBunTestScript = makeFs({
  readText: async () => JSON.stringify({ name: "test", scripts: { test: "bun test" } }),
});

const allAbsent = makeFs({
  readText: async () => JSON.stringify({ name: "test" }),
});

describe("detect", () => {
  test("bun.lockb present → true", async () => {
    expect(await detect("/root", withLockb)).toBe(true);
  });

  test("bun.lock present → true", async () => {
    expect(await detect("/root", withLock)).toBe(true);
  });

  test("bun in dependencies → true", async () => {
    expect(await detect("/root", withBunDep)).toBe(true);
  });

  test("@types/bun in devDependencies → true", async () => {
    expect(await detect("/root", withTypesBunDev)).toBe(true);
  });

  test("script contains 'bun test' → true", async () => {
    expect(await detect("/root", withBunTestScript)).toBe(true);
  });

  test("all signals absent → false", async () => {
    expect(await detect("/root", allAbsent)).toBe(false);
  });

  test("readText returns null (no package.json) → false, no throw", async () => {
    expect(await detect("/root", noPackageJson)).toBe(false);
  });
});

describe("bunAdapter", () => {
  test("getCoverageConfig", () => {
    expect(bunAdapter.getCoverageConfig()).toEqual({
      path: "./coverage/lcov.info",
      format: "lcov",
    });
  });

  test("generateConfig contains [test] section header", () => {
    expect(bunAdapter.generateConfig()).toContain("[test]");
  });

  test("generateConfig contains coverage = true", () => {
    expect(bunAdapter.generateConfig()).toContain("coverage = true");
  });

  test('generateConfig contains coverageReporter = ["lcov"]', () => {
    expect(bunAdapter.generateConfig()).toContain('coverageReporter = ["lcov"]');
  });

  test("configFilename → bunfig.toml", () => {
    expect(bunAdapter.configFilename()).toBe("bunfig.toml");
  });

  test("detects this repository as a bun project", async () => {
    expect(await bunAdapter.detect(process.cwd())).toBe(true);
  });

  test("setup instructions name the bun test command and the crap4ts command", () => {
    expect(bunAdapter.getSetupInstructions()).toEqual([
      "Run: bun test (coverage config is in bunfig.toml)",
      "Then: crap4ts -c coverage/lcov.info -f lcov",
    ]);
  });

  test("detect reports a directory that has no bun project", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crap-bun-"));
    try {
      expect(await bunAdapter.detect(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
