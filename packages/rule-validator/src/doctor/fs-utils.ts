// Atomic file writes and verbatim backups used by mutate(). Kept separate from
// mutate() so both stay small and individually testable.
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
/** Verbatim copy preserving byte content. Returns the recorded backup path. */
export async function backupVerbatim(
	source: string,
	backupDir: string,
	relName: string,
): Promise<string> {
	const dest = path.join(backupDir, relName);
	await fs.mkdir(path.dirname(dest), { recursive: true });
	const bytes = await fs.readFile(source);
	await writeAtomic(dest, bytes);
	const verify = await fs.readFile(dest);
	if (!bytes.equals(verify)) throw new Error(`backup mismatch after write: ${dest}`);
	return dest;
}
/** Resolve `p` and verify it stays inside `root` (symlink-safe via realpath). */
export async function resolveInside(root: string, p: string): Promise<string | null> {
	const resolved = path.resolve(root, p);
	if (!(await isInsideReal(root, resolved))) return null;
	return resolved;
}
export function sha256(content: Buffer | string): string {
	return createHash("sha256").update(content).digest("hex");
}
export async function pathExists(p: string): Promise<boolean> {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}
async function isInsideReal(root: string, resolved: string): Promise<boolean> {
	const realRoot = await realpathAllowMissing(path.resolve(root));
	const realCandidate = await realpathAllowMissing(resolved);
	if (realRoot === null || realCandidate === null) return false;
	return realCandidate === realRoot || realCandidate.startsWith(realRoot + path.sep);
}
/** realpath of `p`; for a missing path, the realpath of its nearest existing ancestor plus the
 *  missing tail. Null for a dangling symlink or any other resolution error. */
async function realpathAllowMissing(p: string): Promise<string | null> {
	try {
		return await fs.realpath(p);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null;
		if (await fs.lstat(p).catch(() => null)) return null; // dangling symlink
		const parent = path.dirname(p);
		if (parent === p) return null;
		const realParent = await realpathAllowMissing(parent);
		return realParent === null ? null : path.join(realParent, path.basename(p));
	}
}
/** Write `content` to `target` atomically (tmp in same dir + rename). */
export async function writeAtomic(target: string, content: Buffer): Promise<void> {
	const dir = path.dirname(target);
	const tmp = path.join(
		dir,
		`.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
	);
	await fs.writeFile(tmp, content);
	await fs.rename(tmp, target);
}
