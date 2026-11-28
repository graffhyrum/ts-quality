import { promises as fs } from "node:fs";
import { REGEX_SCAN_DEFAULT_EXCLUDES } from "../exclude-patterns.ts";
import { hasFullScanExtension } from "./extensions.ts";
import { shouldProcessExplicitListFile, shouldProcessFullScanFile } from "./file-filter.ts";
import { pathExists } from "./read-inputs.ts";
export const DEFAULT_SCAN_PATTERN = "**/*.{ts,tsx,js,jsx}";
export type SelectionMode = "full" | "scoped";
export type FileSelection = {
	mode: SelectionMode;
	/** Glob pattern for full discovery, or legacy pattern when scoped via positional. */
	pattern: string;
	/** Resolved baseline keys to analyze when scoped; empty means zero files to report. */
	scopedKeys: string[];
	legacyPatternPresent: boolean;
};
export type TargetingInputs = {
	filesFlags: string[];
	filesFromPresent: boolean;
	filesFromEmpty: boolean;
	legacyPatternPresent: boolean;
	legacyPattern?: string;
};
export async function buildFileSelection(
	inputs: TargetingInputs,
	literalPaths: string[],
): Promise<FileSelection> {
	const mode = resolveSelectionMode(inputs);
	const pattern =
		inputs.legacyPatternPresent && inputs.legacyPattern
			? inputs.legacyPattern
			: DEFAULT_SCAN_PATTERN;
	if (mode === "full") {
		return { mode, pattern, scopedKeys: [], legacyPatternPresent: false };
	}
	const raw = new Set<string>(literalPaths);
	if (inputs.legacyPatternPresent && inputs.legacyPattern) {
		for await (const file of fs.glob(inputs.legacyPattern, {
			exclude: REGEX_SCAN_DEFAULT_EXCLUDES,
		})) {
			raw.add(file.replaceAll("\\", "/"));
		}
	}
	const scopedKeys = await filterScopedKeys([...raw].sort((a, b) => a.localeCompare(b)));
	return {
		mode: "scoped",
		pattern: inputs.legacyPattern ?? DEFAULT_SCAN_PATTERN,
		scopedKeys,
		legacyPatternPresent: inputs.legacyPatternPresent,
	};
}
export function resolveSelectionMode(inputs: TargetingInputs): SelectionMode {
	const hasFiles = inputs.filesFlags.length > 0;
	const hasLegacy = inputs.legacyPatternPresent;
	const hasFilesFrom = inputs.filesFromPresent;
	if (!hasFiles && !hasFilesFrom && !hasLegacy) {
		return "full";
	}
	if (hasFilesFrom && !hasFiles && !hasLegacy && inputs.filesFromEmpty) {
		return "full";
	}
	return "scoped";
}
async function filterScopedKeys(keys: string[]): Promise<string[]> {
	const out: string[] = [];
	for (const key of keys) {
		if (!shouldProcessExplicitListFile(key)) continue;
		if (!(await pathExists(key))) continue;
		out.push(key);
	}
	return out;
}
export async function discoverFullScanKeys(pattern: string): Promise<string[]> {
	const keys: string[] = [];
	for await (const file of fs.glob(pattern, { exclude: REGEX_SCAN_DEFAULT_EXCLUDES })) {
		const key = file.replaceAll("\\", "/");
		if (!hasFullScanExtension(key)) continue;
		if (!shouldProcessFullScanFile(key)) continue;
		if (!(await pathExists(key))) continue;
		keys.push(key);
	}
	return keys.sort((a, b) => a.localeCompare(b));
}
