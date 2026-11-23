// Doctor-specific lock: `.doctor/lock` via O_EXCL. One holder at a time.
// A lock is reclaimed (at most once per call) when its recorded pid has exited,
// or, when it records no pid, when its mtime is older than STALE_MS.
import { promises as fs } from "node:fs";
import path from "node:path";
const STALE_MS = 10 * 60 * 1000;
export interface LockResult {
	ok: boolean;
	holder?: string;
}
export async function acquireLock(doctorDir: string): Promise<LockResult> {
	const lockPath = path.join(doctorDir, "lock");
	const first = await tryCreateLock(lockPath);
	if (first) return first;
	const stat = await fs.stat(lockPath).catch(() => null);
	if (!stat) return { ok: false, holder: "lock-unreadable" };
	const holder = (await fs.readFile(lockPath, "utf8").catch(() => "unknown")).trim();
	const alive = holderAlive(holder);
	if (alive === true) return { ok: false, holder };
	if (alive === null && Date.now() - stat.mtimeMs <= STALE_MS) return { ok: false, holder };
	return reclaimStaleLock(lockPath);
}
/** Whether the lock's recorded pid is running; null when the lock records no pid. */
function holderAlive(holder: string): boolean | null {
	const match = /^pid=(\d+)\b/.exec(holder);
	if (!match) return null;
	try {
		process.kill(Number(match[1]), 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}
async function reclaimStaleLock(lockPath: string): Promise<LockResult> {
	try {
		await fs.unlink(lockPath);
	} catch {
		// Stale but unremovable (e.g. a directory): refuse rather than recurse.
		return { ok: false, holder: "stale-lock-unremovable" };
	}
	const retried = await tryCreateLock(lockPath);
	return retried ?? { ok: false, holder: "reclaim-race" };
}
export async function releaseLock(doctorDir: string): Promise<void> {
	try {
		await fs.unlink(path.join(doctorDir, "lock"));
	} catch {
		// Missing lock is fine — release is best-effort by design.
	}
}
async function tryCreateLock(lockPath: string): Promise<LockResult | null> {
	try {
		const handle = await fs.open(lockPath, "wx");
		await handle.writeFile(`pid=${process.pid} started=${new Date().toISOString()}\n`);
		await handle.close();
		return { ok: true };
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EEXIST"
			? null
			: { ok: false, holder: `lock-error:${(error as Error).message}` };
	}
}
