import { promises as fs } from "node:fs";
import { normalizeBaselineKey, UsageError } from "./path-key";
import type { RenamePair } from "./types";

const UTF8_BOM = "\uFEFF";

export async function readPathLines(source: string, label: string): Promise<string[]> {
	const text = source === "-" ? await readStdinUtf8() : await readFileUtf8(source, label);
	if (text.startsWith(UTF8_BOM)) {
		throw new UsageError(`${label}: UTF-8 BOM is not allowed`);
	}
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
	const text = source === "-" ? await readStdinUtf8() : await readFileUtf8(source, label);
	if (text.startsWith(UTF8_BOM)) {
		throw new UsageError(`${label}: UTF-8 BOM is not allowed`);
	}
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
		return await Bun.file(filePath).text();
	} catch {
		throw new UsageError(`${label}: cannot read ${filePath}`);
	}
}

async function readStdinUtf8(): Promise<string> {
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
