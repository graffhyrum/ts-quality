import type { IFileService } from "../services/types";
import { shouldProcessExplicitListFile } from "./file-filter";
import { normalizeBaselineKey } from "./path-key";
import { pathExists } from "./read-inputs";
export const DEFAULT_SCAN_PATTERN = "src/**/*.ts";
export type SelectionMode = "full" | "scoped";
export type FileSelection = {
	mode: SelectionMode;
	patterns: string[];
	scopedKeys: string[];
	legacyPatternsPresent: boolean;
	/** Legacy patterns were given but glob expansion found no paths. */
	legacyExpandedEmpty: boolean;
};
export type TargetingInputs = {
	filesFlags: string[];
	filesFromPresent: boolean;
	filesFromEmpty: boolean;
	legacyPatternsPresent: boolean;
	legacyPatterns: string[];
};
export async function buildFileSelection(
	inputs: TargetingInputs,
	literalPaths: string[],
	fileService: IFileService,
): Promise<FileSelection> {
	const mode = resolveSelectionMode(inputs);
	if (mode === "full") {
		return {
			mode,
			patterns: [DEFAULT_SCAN_PATTERN],
			scopedKeys: [],
			legacyPatternsPresent: false,
			legacyExpandedEmpty: false,
		};
	}
	const raw = new Set<string>(literalPaths.map((p) => normalizeBaselineKey(p)));
	let legacyExpandedEmpty = false;
	if (inputs.legacyPatternsPresent && inputs.legacyPatterns.length > 0) {
		const expanded = await fileService.resolveFiles(inputs.legacyPatterns);
		if (expanded.length === 0 && literalPaths.length === 0) {
			legacyExpandedEmpty = true;
		}
		for (const file of expanded) {
			raw.add(normalizeBaselineKey(file));
		}
	}
	const scopedKeys = await filterScopedKeys([...raw].sort((a, b) => a.localeCompare(b)));
	return {
		mode: "scoped",
		patterns: inputs.legacyPatterns.length > 0 ? inputs.legacyPatterns : [DEFAULT_SCAN_PATTERN],
		scopedKeys,
		legacyPatternsPresent: inputs.legacyPatternsPresent,
		legacyExpandedEmpty,
	};
}
export function resolveSelectionMode(inputs: TargetingInputs): SelectionMode {
	const hasFiles = inputs.filesFlags.length > 0;
	const hasLegacy = inputs.legacyPatternsPresent;
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
export async function discoverFullScanKeys(
	patterns: string[],
	fileService: IFileService,
): Promise<string[]> {
	const files = await fileService.resolveFiles(patterns);
	return files.map((f) => normalizeBaselineKey(f));
}
