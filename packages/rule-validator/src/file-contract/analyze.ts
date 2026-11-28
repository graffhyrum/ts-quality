import type { ProjectConfig } from "../config.ts";
import { runAstRules, runAstRulesForFiles } from "../ast-scan.ts";
import {
	type CombinedScanResult,
	deduplicateDisplayViolations,
	deduplicateJsonViolations,
} from "../scan-dedup.ts";
import type { DisplayViolation, JsonViolation } from "../index.ts";
import { scanFiles, scanFilesList } from "../index.ts";
import { toRelativePosix } from "../paths.ts";
import type { FileSelection } from "./selection.ts";
import { discoverFullScanKeys } from "./selection.ts";

export type PerFileScan = {
	reportKeys: string[];
	errorCountByFile: Map<string, number>;
	warningCount: number;
	combined: CombinedScanResult;
};

export async function runPerFileScan(
	selection: FileSelection,
	config: ProjectConfig,
	options: { json?: boolean; collectLegacyJson?: boolean },
): Promise<PerFileScan> {
	const json = options.json ?? options.collectLegacyJson ?? false;
	const reportKeys =
		selection.mode === "full"
			? await discoverFullScanKeys(selection.pattern)
			: [...selection.scopedKeys];
	const [regex, ast] = await Promise.all([
		selection.mode === "full"
			? scanFiles(selection.pattern, { json, config })
			: scanFilesList(reportKeys, { json, config }),
		selection.mode === "full"
			? runAstRules(selection.pattern, { json, config })
			: runAstRulesForFiles(reportKeys, { json, config }),
	]);
	const combined = mergeScanResults(regex, ast);
	const errorCountByFile = countErrorViolationsByFile(combined.violations);
	return { reportKeys, errorCountByFile, warningCount: combined.warningCount, combined };
}

function mergeScanResults(
	regex: Awaited<ReturnType<typeof scanFiles>>,
	ast: Awaited<ReturnType<typeof runAstRules>>,
): CombinedScanResult {
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

function countErrorViolationsByFile(
	violations: JsonViolation[] | DisplayViolation[],
): Map<string, number> {
	const map = new Map<string, number>();
	for (const v of violations) {
		const file = toRelativePosix(v.file);
		const severity = "severity" in v ? v.severity : v.rule.severity;
		if (severity !== "error") continue;
		map.set(file, (map.get(file) ?? 0) + 1);
	}
	return map;
}
