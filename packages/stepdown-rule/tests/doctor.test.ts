import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const cli = path.join(import.meta.dir, "..", "src", "cli.ts");
let dir: string;

function doctor(...args: string[]): { exitCode: number; stdout: string } {
	const result = Bun.spawnSync(["bun", cli, "doctor", ...args], { cwd: dir });
	return { exitCode: result.exitCode, stdout: result.stdout.toString() };
}

function runIds(): string[] {
	return readdirSync(path.join(dir, ".doctor", "runs"));
}

beforeEach(() => {
	dir = mkdtempSync(path.join(os.tmpdir(), "stepdown-doctor-"));
	writeFileSync(path.join(dir, ".gitignore"), "node_modules\n");
	doctor("--fix");
	expect(readFileSync(path.join(dir, ".gitignore"), "utf8")).toBe("node_modules\n.doctor/\n");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

test("undo restores a target that still holds the fix", () => {
	expect(doctor("undo", "latest").exitCode).toBe(0);
	expect(readFileSync(path.join(dir, ".gitignore"), "utf8")).toBe("node_modules\n");
});

test("undo refuses a target edited after the fix and keeps the edit", () => {
	writeFileSync(path.join(dir, ".gitignore"), "node_modules\n.doctor/\nmine\n");
	expect(doctor("undo", "latest").exitCode).toBe(4);
	expect(readFileSync(path.join(dir, ".gitignore"), "utf8")).toBe("node_modules\n.doctor/\nmine\n");
});

test("undo --dry-run changes nothing", () => {
	expect(doctor("undo", "latest", "--dry-run").exitCode).toBe(0);
	expect(readFileSync(path.join(dir, ".gitignore"), "utf8")).toBe("node_modules\n.doctor/\n");
});

test("gc --dry-run lists runs without deleting them", () => {
	const [runId] = runIds();
	const result = doctor("gc", "--before", "2999-01-01", "--yes", "--dry-run");
	expect(result.exitCode).toBe(0);
	expect(JSON.parse(result.stdout).wouldRemove).toEqual([runId]);
	expect(runIds()).toEqual([runId as string]);
});

test("gc refuses while a doctor --fix holds the lock", () => {
	writeFileSync(path.join(dir, ".doctor", "doctor.lock"), String(process.pid));
	expect(doctor("gc", "--before", "2999-01-01", "--yes").exitCode).toBe(5);
	expect(runIds()).toHaveLength(1);
	expect(existsSync(path.join(dir, ".doctor", "doctor.lock"))).toBe(true);
});
