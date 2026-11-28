#!/usr/bin/env bun
import { createCommand, type Command } from "commander";
import packageJson from "../package.json";
import { runPerFileScan } from "./file-contract/analyze.ts";
import {
	assertBaselineAbsent,
	assertBaselinePresent,
	applyRenamesInMemory,
	DEFAULT_BASELINE_PATH,
	readBaselineFile,
	writeBaselineIfChanged,
} from "./file-contract/baseline.ts";
import { evaluateAgainstBaseline, exitCodeWithoutBaseline } from "./file-contract/evaluate.ts";
import { normalizeBaselineKey, UsageError } from "./file-contract/path-key.ts";
import { printQualityReport } from "./file-contract/quality-report.ts";
import { readPathLines, readRenamePairs } from "./file-contract/read-inputs.ts";
import {
	buildFileSelection,
	DEFAULT_SCAN_PATTERN,
	type TargetingInputs,
} from "./file-contract/selection.ts";
import { loadProjectConfig } from "./config.ts";
import { runDoctorCli } from "./doctor/cli.ts";
import {
	exitWithResult,
	type DisplayViolation,
	type JsonViolation,
	printViolations,
	type ScanResult,
} from "./index.ts";
import { printRunFooter, printRunHeader } from "./run-frame.ts";
import { combineRegexAndAstScanResults, type CombinedScanResult } from "./scan-dedup.ts";
const CONTRACT_FLAG_PREFIXES = [
	"--files",
	"--files-from",
	"--renames-from",
	"--report",
	"--baseline",
	"--update-baseline",
	"--seed",
] as const;
if (import.meta.main) {
	try {
		await main();
	} catch (e) {
		console.error(e instanceof Error ? e.message : e);
		process.exit(1);
	}
}
type CliOptions = {
	files: string[];
	filesFrom?: string;
	renamesFrom?: string;
	report?: string;
	baseline?: string;
	updateBaseline?: boolean;
	seed?: boolean;
	json?: boolean;
};
export function deduplicateAndPrint(
	regex: ScanResult,
	ast: ScanResult,
	shouldPrint: boolean = true,
): CombinedScanResult {
	const combined = combineRegexAndAstScanResults(regex, ast);
	if (shouldPrint && !isJsonViolationList(combined.violations) && combined.violations.length > 0) {
		printDedupedDisplay(combined.violations);
	}
	return combined;
}
export async function main(argv?: string[]): Promise<void> {
	const effectiveArgv = argv ?? process.argv;
	if (effectiveArgv[2] === "doctor") {
		if (argvUsesContractFlags(effectiveArgv)) {
			console.error("rule-validator: file-scoped flags are not supported with doctor");
			process.exit(2);
		}
		await runDoctorCli(effectiveArgv.slice(3));
		return;
	}
	const program = buildProgram();
	program.parse(effectiveArgv);
	const opts = program.opts<CliOptions>();
	if (opts.report !== undefined && opts.report !== "json") {
		failUsage("unsupported --report format (choices: json)");
	}
	const reportJson = opts.report === "json";
	const legacyJson = Boolean(opts.json);
	if (reportJson && legacyJson) {
		failUsage("cannot combine --report json with --json");
	}
	if (opts.seed && (opts.files.length > 0 || opts.filesFrom || program.args.length > 0)) {
		failUsage("--seed requires a full scan with no file targeting");
	}
	if (opts.updateBaseline && opts.seed) {
		failUsage("cannot combine --seed with --update-baseline");
	}
	if (opts.filesFrom && opts.renamesFrom && opts.filesFrom === "-" && opts.renamesFrom === "-") {
		failUsage("cannot read --files-from and --renames-from from stdin at the same time");
	}
	const legacyPatternPresent = program.args.length > 0;
	const legacyPattern = legacyPatternPresent ? program.args[0] : undefined;
	const baselinePath = opts.baseline ?? DEFAULT_BASELINE_PATH;
	let literalPaths: string[] = [];
	for (const file of opts.files) {
		try {
			literalPaths.push(normalizeBaselineKey(file));
		} catch (error) {
			handleFatal(error, reportJson);
		}
	}
	let filesFromEmpty = false;
	try {
		if (opts.filesFrom) {
			const fromFile = await readPathLines(opts.filesFrom, "--files-from");
			filesFromEmpty = fromFile.length === 0;
			literalPaths = literalPaths.concat(fromFile);
		}
	} catch (error) {
		handleFatal(error, reportJson);
	}
	const targeting: TargetingInputs = {
		filesFlags: opts.files,
		filesFromPresent: Boolean(opts.filesFrom),
		filesFromEmpty,
		legacyPatternPresent,
		legacyPattern,
	};
	let renamePairs: Awaited<ReturnType<typeof readRenamePairs>> = [];
	try {
		if (opts.renamesFrom) {
			renamePairs = await readRenamePairs(opts.renamesFrom, "--renames-from");
		}
	} catch (error) {
		handleFatal(error, reportJson);
	}
	const config = await loadProjectConfig();
	let selection: Awaited<ReturnType<typeof buildFileSelection>>;
	try {
		selection = await buildFileSelection(targeting, literalPaths);
	} catch (error) {
		handleFatal(error, reportJson);
	}
	try {
		if (opts.seed) {
			await assertBaselineAbsent(baselinePath);
		}
		let baselineOnDisk: Awaited<ReturnType<typeof readBaselineFile>> = null;
		try {
			baselineOnDisk = await readBaselineFile(baselinePath);
		} catch (error) {
			handleFatal(error, reportJson);
		}
		if (opts.updateBaseline) {
			try {
				assertBaselinePresent(baselineOnDisk);
			} catch (error) {
				handleFatal(error, reportJson);
			}
		}
		let effectiveBaseline = baselineOnDisk;
		if (baselineOnDisk && renamePairs.length > 0) {
			try {
				effectiveBaseline = await applyRenamesInMemory(baselineOnDisk, renamePairs);
			} catch (error) {
				handleFatal(error, reportJson);
			}
		}
		const perFile = await runPerFileScan(selection, config, {
			json: reportJson || legacyJson,
		});
		const evaluated = await evaluateAgainstBaseline({
			baselineOnDisk,
			effectiveBaseline,
			reportKeys: perFile.reportKeys,
			errorCountByFile: perFile.errorCountByFile,
			updateBaseline: Boolean(opts.updateBaseline),
			seed: false,
			fullScan: selection.mode === "full",
			baselinePath,
		});
		if (opts.seed) {
			const seedDoc = (
				await evaluateAgainstBaseline({
					baselineOnDisk: null,
					effectiveBaseline: null,
					reportKeys: perFile.reportKeys,
					errorCountByFile: perFile.errorCountByFile,
					updateBaseline: false,
					seed: true,
					fullScan: true,
					baselinePath,
				})
			).seedBaseline;
			if (seedDoc) await writeBaselineIfChanged(baselinePath, seedDoc);
			if (reportJson) {
				const seeded = await evaluateAgainstBaseline({
					baselineOnDisk: seedDoc ?? null,
					effectiveBaseline: seedDoc ?? null,
					reportKeys: perFile.reportKeys,
					errorCountByFile: perFile.errorCountByFile,
					updateBaseline: false,
					seed: false,
					fullScan: selection.mode === "full",
					baselinePath,
				});
				printQualityReport({ ...seeded.report, exitCode: 0, ok: true });
				process.exit(0);
			}
			exitWithResult(0, perFile.combined.warningCount, perFile.combined.fileCount);
		}
		const exitCode = resolveExitCode({
			baselineOnDisk,
			perFile,
			evaluatedExit: evaluated.exitCode,
		});
		if (reportJson) {
			printQualityReport({ ...evaluated.report, exitCode, ok: exitCode === 0 });
			process.exit(exitCode);
		}
		if (!legacyJson) printRunHeader();
		printLegacyViolations(perFile.combined);
		if (legacyJson) {
			outputJsonAndExit(perFile.combined);
		}
		let reportedErrors = perFile.combined.errorCount;
		if (baselineOnDisk) reportedErrors = exitCode === 1 ? 1 : 0;
		exitWithResult(reportedErrors, perFile.combined.warningCount, perFile.combined.fileCount);
	} catch (error) {
		if (!opts.json && !reportJson) printRunFooter({ kind: "crashed" });
		handleFatal(error, reportJson);
	}
}
function printLegacyViolations(result: CombinedScanResult): void {
	const violations = result.violations;
	if (!Array.isArray(violations) || violations.length === 0) return;
	if (isJsonViolationList(violations)) return;
	printDedupedDisplay(violations);
}
function buildProgram(): Command {
	const program = createCommand("rule-validator");
	program.description("Validate TypeScript/JavaScript files against lint rules");
	program.version(packageJson.version, "-V, --version");
	program.argument("[pattern]", "glob pattern for files to scan");
	program
		.option("--files <path>", "file to include in a scoped run", collectPaths, [])
		.option("--files-from <path>", "newline-separated paths, or - for stdin")
		.option("--renames-from <path>", "from<TAB>to rename map for baseline carry")
		.option("--report <format>", "structured report format (choices: json)")
		.option("--baseline <path>", "path to the violation baseline file")
		.option("--update-baseline", "shrink stored baseline counts after a clean run")
		.option("--seed", "create a baseline from the current violation counts (full scan)")
		.option("--json", "output results as JSON (legacy scan format)");
	return program;
}
function collectPaths(value: string, previous: string[]): string[] {
	return previous.concat([value]);
}
function argvUsesContractFlags(argv: string[]): boolean {
	return argv.some((arg) =>
		CONTRACT_FLAG_PREFIXES.some((prefix) => arg === prefix || arg.startsWith(`${prefix}=`)),
	);
}
function failUsage(message: string): never {
	console.error(`rule-validator: ${message}`);
	process.exit(2);
}
function handleFatal(error: unknown, reportJson: boolean): never {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`rule-validator: ${message}`);
	let code = 1;
	if (error instanceof UsageError) code = 2;
	else if (reportJson) code = 2;
	process.exit(code);
}
function resolveExitCode(context: {
	baselineOnDisk: Awaited<ReturnType<typeof readBaselineFile>>;
	perFile: Awaited<ReturnType<typeof runPerFileScan>>;
	evaluatedExit: number;
}): number {
	if (context.baselineOnDisk) return context.evaluatedExit;
	return exitCodeWithoutBaseline(context.perFile.errorCountByFile, context.perFile.reportKeys);
}
function isJsonViolationList(
	violations: JsonViolation[] | DisplayViolation[],
): violations is JsonViolation[] {
	const first = violations[0];
	return (
		violations.length > 0 &&
		first !== undefined &&
		"rule" in first &&
		typeof first.rule === "string"
	);
}
function printDedupedDisplay(violations: DisplayViolation[]): void {
	const sorted = [...violations].sort((a, b) => {
		if (a.file !== b.file) return a.file.localeCompare(b.file);
		if (a.line !== b.line) return a.line - b.line;
		return a.column - b.column;
	});
	const byFile = new Map<string, DisplayViolation[]>();
	for (const v of sorted) {
		const group = byFile.get(v.file) ?? [];
		if (!byFile.has(v.file)) byFile.set(v.file, group);
		group.push(v);
	}
	for (const [file, viols] of byFile) {
		const printable = viols.map((v) => ({
			line: v.line,
			column: v.column,
			rule: v.rule,
			match: v.match,
			sourceLine: v.sourceLine,
		}));
		printViolations(file, printable);
	}
}
function outputJsonAndExit(result: CombinedScanResult): never {
	console.log(JSON.stringify(result));
	process.exit(result.errorCount > 0 ? 1 : 0);
}
export type { CombinedScanResult };
export { DEFAULT_SCAN_PATTERN as DEFAULT_PATTERN };
