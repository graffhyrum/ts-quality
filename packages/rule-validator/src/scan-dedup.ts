import type { DisplayViolation, JsonViolation, ScanResult } from "./index.ts";
import { toRelativePosix } from "./paths.ts";

export type CombinedScanResult = {
	errorCount: number;
	warningCount: number;
	fileCount: number;
	violations: JsonViolation[] | DisplayViolation[];
};

type ScanLike = Pick<
	ScanResult,
	"errorCount" | "warningCount" | "fileCount" | "violations" | "displayViolations"
>;

export function combineRegexAndAstScanResults(regex: ScanLike, ast: ScanLike): CombinedScanResult {
	const regexDisplay = regex.displayViolations ?? [];
	const astDisplay = ast.displayViolations ?? [];
	const dedupedDisplay = deduplicateDisplayViolations(regexDisplay, astDisplay);
	const regexViolations = regex.violations ?? [];
	const astViolations = ast.violations ?? [];
	const dedupedJson = deduplicateJsonViolations(regexViolations, astViolations);
	const { errorCount, warningCount } = countCombinedSeverities({
		dedupedDisplay,
		dedupedJson,
		regex,
		ast,
	});
	return {
		errorCount,
		warningCount,
		fileCount: (regex.fileCount ?? 0) + (ast.fileCount ?? 0),
		violations: dedupedJson.length > 0 ? dedupedJson : dedupedDisplay,
	};
}

function countCombinedSeverities(context: {
	dedupedDisplay: DisplayViolation[];
	dedupedJson: JsonViolation[];
	regex: { errorCount: number; warningCount: number };
	ast: { errorCount: number; warningCount: number };
}): { errorCount: number; warningCount: number } {
	const { dedupedDisplay, dedupedJson, regex, ast } = context;
	if (dedupedDisplay.length > 0) {
		let errorCount = 0;
		let warningCount = 0;
		for (const v of dedupedDisplay) {
			if (v.rule.severity === "error") errorCount++;
			else warningCount++;
		}
		return { errorCount, warningCount };
	}
	if (dedupedJson.length > 0) {
		let errorCount = 0;
		let warningCount = 0;
		for (const v of dedupedJson) {
			if (v.severity === "error") errorCount++;
			else warningCount++;
		}
		return { errorCount, warningCount };
	}
	return {
		errorCount: regex.errorCount + ast.errorCount,
		warningCount: regex.warningCount + ast.warningCount,
	};
}

export function deduplicateDisplayViolations(
	regexDisplay: DisplayViolation[],
	astDisplay: DisplayViolation[],
): DisplayViolation[] {
	const deduped = new Map<string, DisplayViolation>();
	for (const v of regexDisplay) {
		const normalizedFile = toRelativePosix(v.file);
		const key = `${normalizedFile}:${v.line}:${v.column}:${v.rule.name}`;
		deduped.set(key, { ...v, file: normalizedFile });
	}
	for (const v of astDisplay) {
		const normalizedFile = toRelativePosix(v.file);
		const key = `${normalizedFile}:${v.line}:${v.column}:${v.rule.name}`;
		if (!deduped.has(key)) {
			deduped.set(key, { ...v, file: normalizedFile });
		}
	}
	return Array.from(deduped.values());
}

export function deduplicateJsonViolations(
	regexViolations: JsonViolation[],
	astViolations: JsonViolation[],
): JsonViolation[] {
	const deduped = new Map<string, JsonViolation>();
	for (const v of regexViolations) {
		const file = toRelativePosix(v.file);
		const key = `${file}:${v.line}:${v.column}:${v.rule}`;
		deduped.set(key, { ...v, file });
	}
	for (const v of astViolations) {
		const file = toRelativePosix(v.file);
		const key = `${file}:${v.line}:${v.column}:${v.rule}`;
		if (!deduped.has(key)) {
			deduped.set(key, { ...v, file });
		}
	}
	return Array.from(deduped.values());
}
