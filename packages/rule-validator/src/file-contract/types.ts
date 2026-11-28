export const QUALITY_REPORT_SCHEMA = "ts-quality/quality-report/v1" as const;
export const BASELINE_VERSION = 1 as const;

export type QualityReportFile = {
	path: string;
	violations: number;
	baseline: number;
	status: "ok" | "fail";
};

export type QualityReport = {
	schema: typeof QUALITY_REPORT_SCHEMA;
	tool: "rule-validator";
	exitCode: number;
	ok: boolean;
	files: QualityReportFile[];
	totals: { files: number; violations: number; failed: number };
};

export type BaselineDocument = {
	version: typeof BASELINE_VERSION;
	files: Record<string, number>;
};

export type RenamePair = { from: string; to: string };
