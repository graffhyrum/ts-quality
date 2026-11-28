import {
	allowedCount,
	buildSeedBaseline,
	pruneMissingKeys,
	writeBaselineIfChanged,
} from "./baseline";
import type { BaselineDocument } from "./types";
import { buildQualityReport } from "./quality-report";
import type { QualityReport, QualityReportFile } from "./types";

export type EvaluateOptions = {
	baselineOnDisk: BaselineDocument | null;
	effectiveBaseline: BaselineDocument | null;
	reportKeys: string[];
	violationCountByFile: Map<string, number>;
	updateBaseline: boolean;
	seed: boolean;
	fullScan: boolean;
	baselinePath: string;
};

export type EvaluateResult = {
	exitCode: number;
	report: QualityReport;
	seedBaseline?: BaselineDocument;
};

export async function evaluateAgainstBaseline(opts: EvaluateOptions): Promise<EvaluateResult> {
	const rows = buildReportRows(opts.reportKeys, opts.violationCountByFile, opts.effectiveBaseline);
	const failed = rows.some((r) => r.status === "fail");
	const exitCode = failed ? 1 : 0;
	const report = buildQualityReport(rows, exitCode);
	if (opts.seed) {
		return {
			exitCode: 0,
			report,
			seedBaseline: buildSeedBaseline(opts.violationCountByFile),
		};
	}
	if (opts.updateBaseline && opts.effectiveBaseline) {
		if (failed) {
			return { exitCode: 1, report };
		}
		let next = { ...opts.effectiveBaseline, files: { ...opts.effectiveBaseline.files } };
		for (const row of rows) {
			const previous = next.files[row.path];
			if (row.violations > 0) {
				if (previous === undefined || row.violations < previous) {
					next.files[row.path] = row.violations;
				}
			} else if (previous !== undefined) {
				delete next.files[row.path];
			}
		}
		if (opts.fullScan) {
			const existing = new Set(opts.reportKeys);
			next = pruneMissingKeys(next, existing);
		}
		await writeBaselineIfChanged(opts.baselinePath, next);
	}
	return { exitCode, report };
}

function buildReportRows(
	reportKeys: string[],
	violationCountByFile: Map<string, number>,
	baseline: BaselineDocument | null,
): QualityReportFile[] {
	return reportKeys.map((filePath) => {
		const violations = violationCountByFile.get(filePath) ?? 0;
		const baselineCount = allowedCount(baseline, filePath);
		const status = violations <= baselineCount ? "ok" : "fail";
		return { path: filePath, violations, baseline: baselineCount, status };
	});
}

export function exitCodeWithoutBaseline(
	violationCountByFile: Map<string, number>,
	reportKeys: string[],
): number {
	for (const key of reportKeys) {
		if ((violationCountByFile.get(key) ?? 0) > 0) return 1;
	}
	return 0;
}
