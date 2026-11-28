import {
	allowedCount,
	type BaselineDocument,
	buildSeedBaseline,
	pruneMissingKeys,
	writeBaselineIfChanged,
} from "./baseline.ts";
import { buildQualityReport } from "./quality-report.ts";
import type { QualityReport, QualityReportFile } from "./types.ts";

export type EvaluateOptions = {
	baselineOnDisk: BaselineDocument | null;
	effectiveBaseline: BaselineDocument | null;
	reportKeys: string[];
	errorCountByFile: Map<string, number>;
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
	const rows = buildReportRows(opts.reportKeys, opts.errorCountByFile, opts.effectiveBaseline);
	const failed = rows.some((r) => r.status === "fail");
	const exitCode = failed ? 1 : 0;
	const report = buildQualityReport(rows, exitCode);
	if (opts.seed) {
		return { exitCode: 0, report, seedBaseline: buildSeedBaseline(opts.errorCountByFile) };
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
	errorCountByFile: Map<string, number>,
	baseline: BaselineDocument | null,
): QualityReportFile[] {
	return reportKeys.map((path) => {
		const violations = errorCountByFile.get(path) ?? 0;
		const baselineCount = allowedCount(baseline, path);
		const status = violations <= baselineCount ? "ok" : "fail";
		return { path, violations, baseline: baselineCount, status };
	});
}

export function exitCodeWithoutBaseline(
	errorCountByFile: Map<string, number>,
	reportKeys: string[],
): number {
	for (const key of reportKeys) {
		if ((errorCountByFile.get(key) ?? 0) > 0) return 1;
	}
	return 0;
}
