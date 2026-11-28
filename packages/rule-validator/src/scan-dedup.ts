import type { DisplayViolation, JsonViolation } from "./index.ts";
import { toRelativePosix } from "./paths.ts";

export type CombinedScanResult = {
	errorCount: number;
	warningCount: number;
	fileCount: number;
	violations: JsonViolation[] | DisplayViolation[];
};

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
