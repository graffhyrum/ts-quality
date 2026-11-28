import { emitCliError, type CliErrorPayload } from "../cli-errors";
import { buildConfigFromCliSafe, runAnalyze, runFix } from "../cli-runners";
import { ExitConfig, ExitUsage, ExitViolationsOrFixErrors } from "../exit-codes";
import { createReporter, resolveFormat, type Reporter } from "../reporter";
import { FileService } from "../services/FileService";
import type { AnalysisResult, FixResult } from "../types";
import {
	assertBaselineAbsent,
	assertBaselinePresent,
	applyRenamesInMemory,
	DEFAULT_BASELINE_PATH,
	readBaselineFile,
	writeBaselineIfChanged,
} from "./baseline";
import { evaluateAgainstBaseline, exitCodeWithoutBaseline } from "./evaluate";
import { normalizeBaselineKey, UsageError } from "./path-key";
import { printQualityReport } from "./quality-report";
import { readPathLines, readRenamePairs } from "./read-inputs";
import { buildFileSelection, discoverFullScanKeys, type TargetingInputs } from "./selection";
import { buildViolationCountMap } from "./violation-count";
export type ContractInvocation = {
	command: "analyze" | "fix";
	patterns: string[];
	options: ContractRunOptions;
};
export type ContractRunOptions = {
	ignore?: string[];
	json?: boolean;
	/** User-supplied --format only (not agents envelope injection). */
	format?: string;
	/** Agents subcommand output (envelope); not checked against --report json. */
	agentsEnvelope?: boolean;
	config?: string;
	rules?: string;
	verbose?: boolean;
	dryRun?: boolean;
	includeGraph?: boolean;
	includeContent?: boolean;
	files?: string[];
	filesFrom?: string;
	renamesFrom?: string;
	report?: string;
	baseline?: string;
	updateBaseline?: boolean;
	seed?: boolean;
};
const subcommandNames = ["fix", "analyze", "agents"];
export async function runContractCommand(invocation: ContractInvocation): Promise<void> {
	const { command, patterns, options } = invocation;
	const misplaced = patterns.find((p) => subcommandNames.includes(p));
	if (misplaced) {
		console.error(`Error: "${misplaced}" looks like a subcommand, not a file pattern.`);
		console.error(`Usage: stepdown-rule ${misplaced} <patterns...>`);
		process.exitCode = ExitUsage;
		return;
	}
	if (options.report !== undefined && options.report !== "json") {
		failUsage(`unknown --report format: ${options.report}`);
	}
	const reportJson = options.report === "json";
	const legacyJson = Boolean(options.json);
	const userFormat = options.format;
	const userLegacyFormat = userFormat === "json" || userFormat === "agents";
	if (reportJson && (legacyJson || userLegacyFormat)) {
		failUsage("cannot combine --report json with --json or --format");
	}
	if (
		options.seed &&
		((options.files?.length ?? 0) > 0 || options.filesFrom || patterns.length > 0)
	) {
		failUsage("--seed requires a full scan with no file targeting");
	}
	if (options.updateBaseline && options.seed) {
		failUsage("cannot combine --seed with --update-baseline");
	}
	if (options.filesFrom === "-" && options.renamesFrom === "-") {
		failUsage("cannot read --files-from and --renames-from from stdin at the same time");
	}
	const reporter = createReporter(options.agentsEnvelope ? "agents" : resolveFormat(options));
	const agentsCommand =
		options.agentsEnvelope || options.format === "agents" ? `agents/${command}` : command;
	const configOptions = options.agentsEnvelope ? { ...options, format: "agents" } : options;
	const built = await buildConfigFromCliSafe(configOptions);
	if ("error" in built) {
		emitCliError(built.error);
		process.exitCode = reportJson
			? ExitUsage
			: reporter.reportEarlyFailure(command, [built.error], { command: agentsCommand });
		return;
	}
	const baselinePath = options.baseline ?? DEFAULT_BASELINE_PATH;
	let literalPaths: string[] = [];
	for (const file of options.files ?? []) {
		try {
			literalPaths.push(normalizeBaselineKey(file));
		} catch (error) {
			handleFatal(error, reportJson);
		}
	}
	let filesFromEmpty = false;
	try {
		if (options.filesFrom) {
			const fromFile = await readPathLines(options.filesFrom, "--files-from");
			filesFromEmpty = fromFile.length === 0;
			literalPaths = literalPaths.concat(fromFile);
		}
	} catch (error) {
		handleFatal(error, reportJson);
	}
	const targeting: TargetingInputs = {
		filesFlags: options.files ?? [],
		filesFromPresent: Boolean(options.filesFrom),
		filesFromEmpty,
		legacyPatternsPresent: patterns.length > 0,
		legacyPatterns: patterns,
	};
	let renamePairs: Awaited<ReturnType<typeof readRenamePairs>> = [];
	try {
		if (options.renamesFrom) {
			renamePairs = await readRenamePairs(options.renamesFrom, "--renames-from");
		}
	} catch (error) {
		handleFatal(error, reportJson);
	}
	const fileService = new FileService({ ignore: built.config.ignore });
	let selection: Awaited<ReturnType<typeof buildFileSelection>>;
	try {
		selection = await buildFileSelection(targeting, literalPaths, fileService);
	} catch (error) {
		handleFatal(error, reportJson);
	}
	if (selection.legacyExpandedEmpty) {
		const noFiles: CliErrorPayload = {
			code: "NO_FILES",
			message: `No files matched: ${patterns.join(", ")}`,
			hint: "Quote globs for the shell, e.g. 'src/**/*.ts'. Check --ignore patterns.",
		};
		if (reportJson) {
			console.error(noFiles.message);
			process.exitCode = ExitUsage;
			return;
		}
		emitCliError(noFiles);
		process.exitCode = reporter.reportEarlyFailure(command, [noFiles], { command: agentsCommand });
		return;
	}
	try {
		if (options.seed) {
			await assertBaselineAbsent(baselinePath);
		}
		let baselineOnDisk: Awaited<ReturnType<typeof readBaselineFile>> = null;
		try {
			baselineOnDisk = await readBaselineFile(baselinePath);
		} catch (error) {
			handleFatal(error, reportJson);
		}
		if (options.updateBaseline) {
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
		const reportKeys =
			selection.mode === "full"
				? await discoverFullScanKeys(selection.patterns, fileService)
				: selection.scopedKeys;
		const legacyPatterns = selection.patterns;
		let analysisResults: AnalysisResult[];
		let fixResults: FixResult[] | undefined;
		if (command === "analyze") {
			analysisResults = await runAnalyze(legacyPatterns, built.config, fileService, reportKeys);
		} else {
			fixResults = await runFix(legacyPatterns, built.config, fileService, {
				resolvedFiles: reportKeys,
				dryRun: options.dryRun,
			});
			analysisResults = await runAnalyze(legacyPatterns, built.config, fileService, reportKeys);
		}
		const violationCountByFile = buildViolationCountMap(analysisResults);
		if (options.seed) {
			const seedDoc = (
				await evaluateAgainstBaseline({
					baselineOnDisk: null,
					effectiveBaseline: null,
					reportKeys,
					violationCountByFile,
					updateBaseline: false,
					seed: true,
					fullScan: selection.mode === "full",
					baselinePath,
				})
			).seedBaseline;
			if (seedDoc) await writeBaselineIfChanged(baselinePath, seedDoc);
			if (reportJson) {
				const seeded = await evaluateAgainstBaseline({
					baselineOnDisk: seedDoc ?? null,
					effectiveBaseline: seedDoc ?? null,
					reportKeys,
					violationCountByFile,
					updateBaseline: false,
					seed: false,
					fullScan: selection.mode === "full",
					baselinePath,
				});
				printQualityReport({ ...seeded.report, exitCode: 0, ok: true });
				process.exit(0);
			}
			process.exitCode = 0;
			return;
		}
		const evaluated = await evaluateAgainstBaseline({
			baselineOnDisk,
			effectiveBaseline,
			reportKeys,
			violationCountByFile,
			updateBaseline: Boolean(options.updateBaseline),
			seed: false,
			fullScan: selection.mode === "full",
			baselinePath,
		});
		const exitCode = resolveExitCode({
			baselineOnDisk,
			evaluatedExit: evaluated.exitCode,
			violationCountByFile,
			reportKeys,
		});
		if (reportJson) {
			printQualityReport({ ...evaluated.report, exitCode, ok: exitCode === 0 });
			process.exit(exitCode);
		}
		process.exitCode = emitLegacyOutput({
			command,
			analysisResults,
			fixResults,
			reporter,
			options,
			agentsCommand,
			exitCode,
			baselineOnDisk,
			violationCountByFile,
			reportKeys,
		});
	} catch (error) {
		handleFatal(error, reportJson);
	}
}
function resolveExitCode(context: {
	baselineOnDisk: Awaited<ReturnType<typeof readBaselineFile>>;
	evaluatedExit: number;
	violationCountByFile: Map<string, number>;
	reportKeys: string[];
}): number {
	if (context.baselineOnDisk) return context.evaluatedExit;
	return exitCodeWithoutBaseline(context.violationCountByFile, context.reportKeys);
}
function emitLegacyOutput(context: {
	command: "analyze" | "fix";
	analysisResults: AnalysisResult[];
	fixResults?: FixResult[];
	reporter: Reporter;
	options: ContractRunOptions;
	agentsCommand: string;
	exitCode: number;
	baselineOnDisk: Awaited<ReturnType<typeof readBaselineFile>>;
	violationCountByFile: Map<string, number>;
	reportKeys: string[];
}): number {
	const { command, analysisResults, fixResults, reporter, options, agentsCommand, baselineOnDisk } =
		context;
	if (command === "fix" && fixResults) {
		const code = reporter.reportFix(fixResults, {
			dryRun: options.dryRun,
			includeContent: options.includeContent,
			command: agentsCommand,
		});
		if (baselineOnDisk) {
			return context.exitCode;
		}
		return code;
	}
	const verbose = options.verbose || reporter.format === "json";
	const code = reporter.reportAnalyze(analysisResults, {
		verbose,
		includeGraph: options.includeGraph,
		command: agentsCommand,
	});
	if (baselineOnDisk) {
		return context.exitCode;
	}
	return code;
}
function failUsage(message: string): never {
	console.error(`stepdown-rule: ${message}`);
	process.exit(2);
}
function handleFatal(error: unknown, reportJson: boolean): never {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`stepdown-rule: ${message}`);
	let code = ExitViolationsOrFixErrors;
	if (error instanceof UsageError) code = ExitUsage;
	else if (reportJson) code = ExitUsage;
	else if (message.includes("config") || message.includes("Config")) code = ExitConfig;
	process.exit(code);
}
