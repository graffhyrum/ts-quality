// `doctor undo <run-id>`: walk actions.jsonl in reverse and restore each
// mutation from its verbatim backup. Created files are moved to the run's
// quarantine/ (never deleted). Fails closed on any hash mismatch and on any
// path outside the repository (targets) or the run directory (backups).
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveInside, sha256, writeAtomic } from "./fs-utils.ts";

export interface UndoResult {
	restored: number;
	skipped: string[];
	errors: string[];
}

interface ActionLine {
	path: string;
	op: string;
	beforeHash: string | null;
	afterHash: string;
	existed: boolean;
	backup?: string | null;
}

interface UndoTarget {
	runDir: string;
	scopeRoot: string;
	file: string;
	action: ActionLine;
	result: UndoResult;
}

export async function undoRun(runDir: string, scopeRoot: string): Promise<UndoResult> {
	const lines = await readActions(path.join(runDir, "actions.jsonl"));
	const result: UndoResult = { restored: 0, skipped: [], errors: [] };
	for (const action of [...lines].reverse()) {
		await undoOne({ runDir, scopeRoot, action, result });
	}
	return result;
}

export async function latestRunDir(doctorDir: string): Promise<string | null> {
	try {
		return await fs.readlink(path.join(doctorDir, "latest"));
	} catch {
		return null;
	}
}

async function readActions(actionsFile: string): Promise<ActionLine[]> {
	const raw = await fs.readFile(actionsFile, "utf8").catch(() => "");
	const actions: ActionLine[] = [];
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		try {
			actions.push(JSON.parse(line) as ActionLine);
		} catch {
			// Corrupt line: skip loudly — caller reports it via skipped.
			actions.push({
				path: actionsFile,
				op: "unreadable",
				beforeHash: null,
				afterHash: "",
				existed: false,
			});
		}
	}
	return actions;
}

async function undoOne(parts: Omit<UndoTarget, "file">): Promise<void> {
	const { action, result } = parts;
	if (action.op === "unreadable") {
		result.skipped.push("unreadable actions.jsonl line — refusing to guess");
		return;
	}
	const file = await resolveInside(parts.scopeRoot, action.path);
	if (!file) {
		result.errors.push(`${action.path}: outside the repository — refusing to touch it`);
		return;
	}
	const target = { ...parts, file };
	if (!action.existed) {
		await quarantineCreated(target);
		return;
	}
	await restoreFromBackup(target);
}

async function quarantineCreated(target: UndoTarget): Promise<void> {
	const { file, action, result } = target;
	const current = await fs.readFile(file).catch(() => null);
	if (!current) {
		result.skipped.push(`${action.path}: already gone, nothing to undo`);
		return;
	}
	if (sha256(current) !== action.afterHash) {
		result.errors.push(
			`${action.path}: content changed since the fix — refusing to remove (hash mismatch)`,
		);
		return;
	}
	const quarantine = path.join(target.runDir, "quarantine", path.relative(target.scopeRoot, file));
	await fs.mkdir(path.dirname(quarantine), { recursive: true });
	await fs.rename(file, quarantine);
	result.restored += 1;
}

async function restoreFromBackup(target: UndoTarget): Promise<void> {
	const { runDir, file, action, result } = target;
	if (!action.backup) {
		result.errors.push(
			`${action.path}: actions.jsonl records no backup path — refusing to restore`,
		);
		return;
	}
	const backupPath = await resolveInside(runDir, action.backup);
	if (!backupPath) {
		result.errors.push(
			`${action.path}: backup path escapes the run directory — refusing to restore`,
		);
		return;
	}
	const backup = await fs.readFile(backupPath).catch(() => null);
	if (!backup) {
		result.errors.push(
			`${action.path}: backup missing at ${backupPath} — refusing to touch the file`,
		);
		return;
	}
	if (action.beforeHash && sha256(backup) !== action.beforeHash) {
		result.errors.push(
			`${action.path}: backup hash mismatch (corrupt backup) — refusing to restore`,
		);
		return;
	}
	const current = await fs.readFile(file).catch(() => null);
	if (current === null) {
		result.errors.push(`${action.path}: file is missing — refusing to restore`);
		return;
	}
	const currentHash = sha256(current);
	if (currentHash === action.beforeHash) {
		result.skipped.push(`${action.path}: already matches its pre-fix content, nothing to undo`);
		return;
	}
	if (currentHash !== action.afterHash) {
		result.errors.push(
			`${action.path}: content changed since the fix — refusing to restore (hash mismatch)`,
		);
		return;
	}
	await writeAtomic(file, backup);
	result.restored += 1;
}

/** Best-effort sweep of empty legacy quarantine dirs created before pass 1 — never deletes content. */
export async function listRuns(
	doctorDir: string,
): Promise<
	{ run_id: string; started_at: string | null; exit_code: number | null; action_count: number }[]
> {
	const runsDir = path.join(doctorDir, "runs");
	const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
	const out: {
		run_id: string;
		started_at: string | null;
		exit_code: number | null;
		action_count: number;
	}[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const reportPath = path.join(runsDir, entry.name, "report.json");
		try {
			const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as {
				started_at?: string;
				exit_code?: number;
				summary?: { actions_taken?: number };
			};
			out.push({
				run_id: entry.name,
				started_at: report.started_at ?? null,
				exit_code: report.exit_code ?? null,
				action_count: report.summary?.actions_taken ?? 0,
			});
		} catch {
			out.push({ run_id: entry.name, started_at: null, exit_code: null, action_count: 0 });
		}
	}
	const sorted = out.sort((a, b) => (a.run_id < b.run_id ? 1 : -1));
	return sorted;
}
