// Secondary doctor surfaces: health, capabilities, robot-docs, ls, undo.
import path from "node:path";
import { DOCTOR_CONTRACT_VERSION, DoctorExit } from "./types.ts";
import { capabilitiesJson, ROBOT_DOCS } from "./capabilities.ts";
import { latestRunDir, listRuns, undoRun } from "./undo.ts";
import { discoverGit, runDoctorDiagnose } from "./doctor.ts";
import { acquireLock, releaseLock } from "./lock.ts";

export async function runHealth(cwd: string = process.cwd()): Promise<number> {
	const code = await runDoctorDiagnose({
		cwd,
		quick: true,
		silent: true,
		skipArtifactWrites: true,
	});
	console.log(code === 0 ? "rule-validator doctor: ok" : "rule-validator doctor: findings");
	return code;
}

export function runCapabilities(jsonFlag: boolean | undefined): number {
	if (!jsonFlag) {
		console.log(JSON.stringify(capabilitiesJson(), null, 2));
		return DoctorExit.healthy;
	}
	console.log(JSON.stringify(capabilitiesJson()));
	return DoctorExit.healthy;
}

export function runRobotDocs(): number {
	console.log(ROBOT_DOCS);
	return DoctorExit.healthy;
}

export async function runLs(
	jsonFlag: boolean | undefined,
	cwd: string = process.cwd(),
): Promise<number> {
	const doctorDir = path.join(cwd, ".doctor");
	const runs = await listRuns(doctorDir);
	if (jsonFlag) {
		console.log(JSON.stringify({ schema_version: DOCTOR_CONTRACT_VERSION, runs }));
		return DoctorExit.healthy;
	}
	if (runs.length === 0) {
		console.log("no doctor runs recorded in .doctor/runs/");
		return DoctorExit.healthy;
	}
	for (const run of runs) {
		console.log(`${run.run_id}  exit=${run.exit_code ?? "?"}  actions=${run.action_count}`);
	}
	return DoctorExit.healthy;
}

export async function runDoctorUndo(
	runId: string | undefined,
	cwd: string = process.cwd(),
): Promise<number> {
	if (runId !== undefined && !isRunDirName(runId)) {
		console.error(`invalid run id "${runId}": expected a single run directory name`);
		return DoctorExit.usage;
	}
	const doctorDir = path.join(cwd, ".doctor");
	const resolved = await resolveRunDir(doctorDir, runId);
	if (!resolved) {
		console.error(
			runId === "latest" || runId === undefined
				? "no doctor runs found in .doctor/runs/"
				: `no run with id "${runId}" in .doctor/runs/`,
		);
		return DoctorExit.noInput;
	}
	const { repoRoot } = await discoverGit(cwd);
	if (!repoRoot) {
		console.error("refusing to undo: cwd is not inside a git repository");
		return DoctorExit.refused;
	}
	const lock = await acquireLock(doctorDir);
	if (!lock.ok) {
		console.error(`refusing to undo: cannot hold .doctor/lock (${lock.holder})`);
		return lock.holder?.startsWith("lock-error") ? DoctorExit.refused : DoctorExit.concurrencyLost;
	}
	try {
		return reportUndo(await undoRun(resolved, repoRoot));
	} finally {
		await releaseLock(doctorDir);
	}
}

function isRunDirName(runId: string): boolean {
	return runId !== "" && runId !== "." && runId !== ".." && !/[\\/]/.test(runId);
}

async function resolveRunDir(doctorDir: string, runId: string | undefined): Promise<string | null> {
	if (runId !== undefined && runId !== "latest") {
		return (await runDirExists(doctorDir, runId)) ? path.join(doctorDir, "runs", runId) : null;
	}
	const latest = await latestRunDir(doctorDir);
	if (latest) return latest;
	const runs = await listRuns(doctorDir);
	const first = runs[0];
	return first ? path.join(doctorDir, "runs", first.run_id) : null;
}

async function runDirExists(doctorDir: string, runId: string): Promise<boolean> {
	const { promises: fs } = await import("node:fs");
	try {
		const stat = await fs.stat(path.join(doctorDir, "runs", runId));
		return stat.isDirectory();
	} catch {
		return false;
	}
}

function reportUndo(result: { restored: number; skipped: string[]; errors: string[] }): number {
	for (const skipped of result.skipped) console.log(`skipped: ${skipped}`);
	for (const error of result.errors) console.error(`error: ${error}`);
	if (result.errors.length > 0) {
		console.error(`undo incomplete: ${result.restored} restored, ${result.errors.length} refused`);
		return result.restored > 0 ? DoctorExit.partial : DoctorExit.rolledBack;
	}
	console.log(`undo complete: ${result.restored} action(s) restored`);
	return DoctorExit.healthy;
}
