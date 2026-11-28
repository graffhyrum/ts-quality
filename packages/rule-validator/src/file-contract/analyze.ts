import type { ProjectConfig } from "../config.ts";
import { runAstRules, runAstRulesForFiles } from "../ast-scan.ts";
import { combineRegexAndAstScanResults, type CombinedScanResult } from "../scan-dedup.ts";
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
	const combined = combineRegexAndAstScanResults(regex, ast);
	const errorCountByFile = countErrorViolationsByFile(combined.violations);
	return { reportKeys, errorCountByFile, warningCount: combined.warningCount, combined };
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
