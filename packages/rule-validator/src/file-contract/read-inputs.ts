import { promises as fs } from "node:fs";
import { normalizeBaselineKey, UsageError } from "./path-key.ts";
import type { RenamePair } from "./types.ts";

export async function readPathLines(source: string, label: string): Promise<string[]> {
	const text = source === "-" ? await readStdinUtf8(label) : await readFileUtf8(source, label);
	if (text.includes("\0")) {
		throw new UsageError(`${label}: contains NUL`);
	}
	const lines = text.split("\n");
	const paths: string[] = [];
	for (const line of lines) {
		const stripped = line.replace(/\r$/, "");
		if (stripped === "") continue;
		if (stripped.includes("\n")) {
			throw new UsageError(`${label}: line contains newline`);
		}
		paths.push(normalizeBaselineKey(stripped));
	}
	return paths;
}

export async function readRenamePairs(source: string, label: string): Promise<RenamePair[]> {
	const text = source === "-" ? await readStdinUtf8(label) : await readFileUtf8(source, label);
	const lines = text.split("\n");
	const pairs: RenamePair[] = [];
	for (const line of lines) {
		const stripped = line.replace(/\r$/, "");
		if (stripped === "") continue;
		const tabIndex = stripped.indexOf("\t");
		if (tabIndex < 0 || stripped.indexOf("\t", tabIndex + 1) >= 0) {
			throw new UsageError(`${label}: expected from<TAB>to on each line`);
		}
		const from = normalizeBaselineKey(stripped.slice(0, tabIndex));
		const to = normalizeBaselineKey(stripped.slice(tabIndex + 1));
		pairs.push({ from, to });
	}
	return pairs;
}

async function readFileUtf8(filePath: string, label: string): Promise<string> {
	try {
		const bytes = new Uint8Array(await Bun.file(filePath).arrayBuffer());
		if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
			throw new UsageError(`${label}: UTF-8 BOM is not allowed`);
		}
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch (error) {
		if (error instanceof UsageError) throw error;
		throw new UsageError(`${label}: cannot read ${filePath}`);
	}
}

export async function readStdinUtf8(label = "stdin"): Promise<string> {
	const chunks: Uint8Array[] = [];
	const reader = Bun.stdin.stream().getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) chunks.push(value);
	}
	const total = chunks.reduce((n, c) => n + c.length, 0);
	const buf = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		buf.set(chunk, offset);
		offset += chunk.length;
	}
	if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
		throw new UsageError(`${label}: UTF-8 BOM is not allowed`);
	}
	return new TextDecoder("utf-8", { fatal: true }).decode(buf);
}

export async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}
