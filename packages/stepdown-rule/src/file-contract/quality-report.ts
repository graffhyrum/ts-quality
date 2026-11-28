import { comparePath } from "./compare-path";
import { QUALITY_REPORT_SCHEMA, type QualityReport, type QualityReportFile } from "./types";

export function buildQualityReport(rows: QualityReportFile[], exitCode: number): QualityReport {
	const failed = rows.filter((r) => r.status === "fail").length;
	const violations = rows.reduce((sum, r) => sum + r.violations, 0);
	return {
		schema: QUALITY_REPORT_SCHEMA,
		tool: "stepdown-rule",
		exitCode,
		ok: exitCode === 0,
		files: [...rows].sort((a, b) => comparePath(a.path, b.path)),
		totals: { files: rows.length, violations, failed },
	};
}

export function printQualityReport(report: QualityReport): void {
	console.log(JSON.stringify(report));
}
