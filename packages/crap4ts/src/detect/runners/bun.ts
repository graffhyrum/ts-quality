import path from "node:path";
import { bunFileSystem } from "../fs";
import { readPackageJson, type PackageJson } from "../packageJson";
import type { CoverageFormat } from "../../types";
import type { FileSystem, RunnerAdapter } from "../types";

export async function detect(root: string, fs: FileSystem = bunFileSystem): Promise<boolean> {
  const [hasLock, pkg] = await Promise.all([lockfileExists(root, fs), readPackageJson(root, fs)]);
  return hasLock || isBunInDeps(pkg) || hasBunTestScript(pkg);
}

function lockfileExists(root: string, fs: FileSystem): Promise<boolean> {
  return Promise.all([
    fs.exists(path.join(root, "bun.lockb")),
    fs.exists(path.join(root, "bun.lock")),
  ]).then((rs) => rs.some(Boolean));
}

function isBunInDeps(pkg: PackageJson | null): boolean {
  if (!pkg) return false;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return "bun" in deps || "@types/bun" in deps;
}

function hasBunTestScript(pkg: PackageJson | null): boolean {
  if (!pkg) return false;
  return Object.values(pkg.scripts ?? {}).some((v) => v.includes("bun test"));
}

function getCoverageConfig(): { path: string; format: CoverageFormat } {
  return { path: "./coverage/lcov.info", format: "lcov" };
}

function generateConfig(): string {
  return `[test]\ncoverage = true\ncoverageReporter = ["lcov"]\ncoverageDir = "coverage"\n`;
}

function configFilename(): string {
  return "bunfig.toml";
}

function getSetupInstructions(): string[] {
  return [
    "Run: bun test (coverage config is in bunfig.toml)",
    "Then: crap4ts -c coverage/lcov.info -f lcov",
  ];
}

export const bunAdapter: RunnerAdapter = {
  name: "bun",
  detect: (root) => detect(root, bunFileSystem),
  getCoverageConfig,
  generateConfig,
  configFilename,
  getSetupInstructions,
};
