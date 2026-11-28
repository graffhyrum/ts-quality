import type { AnalysisResult } from "../types";
export function buildViolationCountMap(results: AnalysisResult[]): Map<string, number> {
	const map = new Map<string, number>();
	for (const result of results) {
		map.set(result.file, violationCountForFile(result));
	}
	return map;
}
export function violationCountForFile(result: AnalysisResult): number {
	return (
		result.violations.length +
		result.nestedFunctionViolations.length +
		result.circularDependencies.length
	);
}
