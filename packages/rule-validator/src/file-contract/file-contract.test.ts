import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	allowedCount,
	applyRenamesInMemory,
	assertBaselineAbsent,
	assertBaselinePresent,
	buildSeedBaseline,
	DEFAULT_BASELINE_PATH,
	pruneMissingKeys,
	readBaselineFile,
	serializeBaseline,
	validateRenamePairsExist,
	writeBaselineIfChanged,
} from "./baseline.ts";
import { buildQualityReport, printQualityReport } from "./quality-report.ts";
import { QUALITY_REPORT_SCHEMA } from "./types.ts";
import { hasExplicitListExtension, hasFullScanExtension } from "./extensions.ts";
import { shouldProcessExplicitListFile, shouldProcessFullScanFile } from "./file-filter.ts";
import { normalizeBaselineKey, UsageError } from "./path-key.ts";
import { pathExists, readPathLines, readRenamePairs, readStdinUtf8 } from "./read-inputs.ts";
import {
	buildFileSelection,
	DEFAULT_SCAN_PATTERN,
	discoverFullScanKeys,
	resolveSelectionMode,
} from "./selection.ts";
import { runAstRules, runAstRulesForFiles } from "../ast-scan.ts";
import { main } from "../cli.ts";

const dirtySource = `const a = document.getElementById("app")!;
const b = document.getElementById("b")!;
export { a, b };
`;

describe.serial("file-contract units", () => {
	const cwd = process.cwd();

	afterEach(() => {
		process.chdir(cwd);
	});

	it("normalizes baseline keys", () => {
		expect(String(normalizeBaselineKey("./src/a.ts"))).toBe("src/a.ts");
		expect(() => normalizeBaselineKey("../escape.ts")).toThrow(UsageError);
	});

	it("resolves selection modes", () => {
		expect(
			resolveSelectionMode({
				filesFlags: [],
				filesFromPresent: false,
				filesFromEmpty: false,
				legacyPatternPresent: false,
			}),
		).toBe("full");
		expect(
			resolveSelectionMode({
				filesFlags: [],
				filesFromPresent: true,
				filesFromEmpty: true,
				legacyPatternPresent: false,
			}),
		).toBe("full");
		expect(
			resolveSelectionMode({
				filesFlags: ["a.ts"],
				filesFromPresent: false,
				filesFromEmpty: false,
				legacyPatternPresent: false,
			}),
		).toBe("scoped");
	});

	it("rejects invalid rename graphs", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "rv-fc-cycle-"));
		process.chdir(dir);
		await writeFile("a.ts", "export {};\n");
		await writeFile("b.ts", "export {};\n");
		const doc = { version: 1 as const, files: { "a.ts": 1, "b.ts": 1 } };
		await expect(
			applyRenamesInMemory(doc, [
				{ from: "a.ts", to: "b.ts" },
				{ from: "b.ts", to: "a.ts" },
			]),
		).rejects.toThrow(UsageError);
		await rm(dir, { recursive: true, force: true });
	});

	it("rejects malformed baseline and rename input", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "rv-fc-bad-"));
		const baseline = path.join(dir, "bad.json");
		await writeFile(baseline, "not-json\n");
		await expect(readBaselineFile(baseline)).rejects.toThrow(UsageError);
		await expect(readRenamePairs(path.join(dir, "ren.txt"), "renames")).rejects.toThrow(UsageError);
		await writeFile(path.join(dir, "ren.txt"), "no-tab-line\n");
		await expect(readRenamePairs(path.join(dir, "ren.txt"), "renames")).rejects.toThrow(UsageError);
		await rm(dir, { recursive: true, force: true });
	});

	it("reads stdin when the stream is already closed", async () => {
		expect(await readStdinUtf8()).toBe("");
	});

	it("readStdinUtf8 aggregates chunks and rejects BOM in-process", async () => {
		const encoder = new TextEncoder();
		const parts = [encoder.encode("src/"), encoder.encode("a.ts\n")];
		let index = 0;
		const reader = {
			read: async () => {
				if (index >= parts.length) return { done: true as const, value: undefined };
				const value = parts[index];
				index += 1;
				return { done: false as const, value };
			},
		};
		const originalStream = Bun.stdin.stream;
		Bun.stdin.stream = () =>
			({
				getReader: () => reader,
			}) as ReturnType<typeof Bun.stdin.stream>;
		try {
			expect(await readStdinUtf8("paths")).toBe("src/a.ts\n");
		} finally {
			Bun.stdin.stream = originalStream;
		}

		const bomParts = [new Uint8Array([0xef, 0xbb, 0xbf, ...encoder.encode("a.ts")])];
		let bomIndex = 0;
		const bomReader = {
			read: async () => {
				if (bomIndex >= bomParts.length) return { done: true as const, value: undefined };
				const value = bomParts[bomIndex];
				bomIndex += 1;
				return { done: false as const, value };
			},
		};
		Bun.stdin.stream = () =>
			({
				getReader: () => bomReader,
			}) as ReturnType<typeof Bun.stdin.stream>;
		try {
			await expect(readStdinUtf8("stdin")).rejects.toThrow(UsageError);
		} finally {
			Bun.stdin.stream = originalStream;
		}
	});

	it("runs pattern-based rule scans", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "rv-fc-pattern-"));
		const file = path.join(dir, "x.ts");
		await writeFile(file, "export const ok = 1;\n");
		expect((await runAstRules(file)).errorCount).toBe(0);
		await rm(dir, { recursive: true, force: true });
	});

	it("rejects missing list files and runs AST rules for explicit paths", async () => {
		await expect(readPathLines(path.join(os.tmpdir(), "missing-paths.txt"), "list")).rejects.toThrow(
			UsageError,
		);
		const dir = await mkdtemp(path.join(os.tmpdir(), "rv-fc-ast-"));
		process.chdir(dir);
		await writeFile("sample.ts", "export const value = 1;\n");
		const cleanAst = await runAstRules("sample.ts", { json: true });
		expect(cleanAst.violations).toEqual([]);
		expect((await runAstRules("sample.ts")).violations).toBeUndefined();
		await writeFile("dirty.ts", dirtySource);
		const ast = await runAstRulesForFiles(["dirty.ts"], { json: true });
		expect(ast.violations?.length).toBeGreaterThan(0);
		await rm(dir, { recursive: true, force: true });
	});

	it("reads path lists and rename maps from files", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "rv-fc-"));
		const list = path.join(dir, "paths.txt");
		const renames = path.join(dir, "renames.txt");
		await writeFile(list, "src/a.ts\r\n\nsrc/b.ts\n");
		await writeFile(renames, "old.ts\tnew.ts\n");
		expect(await readPathLines(list, "paths")).toEqual(["src/a.ts", "src/b.ts"]);
		expect(await readRenamePairs(renames, "renames")).toEqual([{ from: "old.ts", to: "new.ts" }]);
		await writeFile(path.join(dir, "bom.txt"), `\uFEFFsrc/a.ts\n`);
		await expect(readPathLines(path.join(dir, "bom.txt"), "list")).rejects.toThrow(UsageError);
		await writeFile(path.join(dir, "nul.txt"), "src/a.ts\u0000\n");
		await expect(readPathLines(path.join(dir, "nul.txt"), "list")).rejects.toThrow(UsageError);
		await writeFile(path.join(dir, "ren-bom.txt"), `\uFEFFold.ts\tnew.ts\n`);
		await expect(readRenamePairs(path.join(dir, "ren-bom.txt"), "renames")).rejects.toThrow(UsageError);
		await writeFile(path.join(dir, "ren-dtab.txt"), "a.ts\tb.ts\tc.ts\n");
		await expect(readRenamePairs(path.join(dir, "ren-dtab.txt"), "renames")).rejects.toThrow(UsageError);
		expect(await pathExists(list)).toBe(true);
		expect(await pathExists(path.join(dir, "missing-file.txt"))).toBe(false);
		await writeFile(path.join(dir, "invalid-utf8.bin"), new Uint8Array([0xff, 0xfe, 0x00]));
		await expect(readPathLines(path.join(dir, "invalid-utf8.bin"), "list")).rejects.toThrow(UsageError);
		await rm(dir, { recursive: true, force: true });
	});

	it("readStdinUtf8 decodes piped bytes", async () => {
		const pkgRoot = path.resolve(import.meta.dir, "..", "..");
		const proc = Bun.spawn(
			[
				"bun",
				"-e",
				"import { readStdinUtf8 } from './src/file-contract/read-inputs.ts'; console.log(JSON.stringify(await readStdinUtf8()));",
			],
			{
				cwd: pkgRoot,
				stdin: new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode("line1\nline2"));
						controller.close();
					},
				}),
				stdout: "pipe",
			},
		);
		const out = await new Response(proc.stdout).text();
		expect(await proc.exited).toBe(0);
		expect(JSON.parse(out.trim())).toBe("line1\nline2");
	});

	it("readPathLines and readRenamePairs read stdin when source is -", async () => {
		const pkgRoot = path.resolve(import.meta.dir, "..", "..");
		const readPaths = Bun.spawn(
			[
				"bun",
				"-e",
				`import { readPathLines } from './src/file-contract/read-inputs.ts';
const paths = await readPathLines('-', 'paths');
console.log(JSON.stringify(paths));`,
			],
			{
				cwd: pkgRoot,
				stdin: new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode("a.ts\nb.ts"));
						controller.close();
					},
				}),
				stdout: "pipe",
			},
		);
		expect(JSON.parse((await new Response(readPaths.stdout).text()).trim())).toEqual([
			"a.ts",
			"b.ts",
		]);

		const readBom = Bun.spawn(
			[
				"bun",
				"-e",
				`import { readPathLines } from './src/file-contract/read-inputs.ts';
try {
  await readPathLines('-', 'stdin');
  console.log('unexpected-ok');
} catch (e) {
  console.log(e instanceof Error ? e.message : String(e));
}`,
			],
			{
				cwd: pkgRoot,
				stdin: new ReadableStream({
					start(controller) {
						controller.enqueue(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("a.ts\n")]));
						controller.close();
					},
				}),
				stdout: "pipe",
			},
		);
		expect((await new Response(readBom.stdout).text()).trim()).toContain("UTF-8 BOM is not allowed");

		const readRenames = Bun.spawn(
			[
				"bun",
				"-e",
				`import { readRenamePairs } from './src/file-contract/read-inputs.ts';
const pairs = await readRenamePairs('-', 'renames');
console.log(JSON.stringify(pairs));`,
			],
			{
				cwd: pkgRoot,
				stdin: new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode("old.ts\tnew.ts\n"));
						controller.close();
					},
				}),
				stdout: "pipe",
			},
		);
		expect(JSON.parse((await new Response(readRenames.stdout).text()).trim())).toEqual([
			{ from: "old.ts", to: "new.ts" },
		]);
	});

	it("builds file selections and discovers keys in a temp tree", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "rv-fc-tree-"));
		process.chdir(dir);
		await writeFile("clean.ts", "export const x = 1;\n");
		await writeFile("dirty.ts", "const n = document.getElementById('a')!;\n");
		const scoped = await buildFileSelection(
			{
				filesFlags: ["clean.ts"],
				filesFromPresent: false,
				filesFromEmpty: false,
				legacyPatternPresent: false,
			},
			["clean.ts"],
		);
		expect(scoped.mode).toBe("scoped");
		expect(scoped.scopedKeys).toEqual(["clean.ts"]);
		const keys = await discoverFullScanKeys(DEFAULT_SCAN_PATTERN);
		expect(keys).toContain("clean.ts");
		expect(keys).toContain("dirty.ts");
		await rm(dir, { recursive: true, force: true });
	});

	it("manages baseline documents", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "rv-fc-base-"));
		process.chdir(dir);
		const baselinePath = path.join(dir, DEFAULT_BASELINE_PATH);
		await assertBaselineAbsent(baselinePath);
		const seeded = buildSeedBaseline(new Map([["a.ts", 2]]));
		await writeBaselineIfChanged(baselinePath, seeded);
		const loaded = await readBaselineFile(baselinePath);
		assertBaselinePresent(loaded);
		expect(allowedCount(loaded, "a.ts")).toBe(2);
		await writeFile("b.ts", "export {};\n");
		const renamed = await applyRenamesInMemory(loaded, [{ from: "a.ts", to: "b.ts" }]);
		await validateRenamePairsExist([{ from: "a.ts", to: "b.ts" }]);
		expect(renamed.files["b.ts"]).toBe(2);
		const pruned = pruneMissingKeys(renamed, new Set(["b.ts"]));
		expect(serializeBaseline(pruned)).toContain('"b.ts": 2');
		const report = buildQualityReport(
			[{ path: "b.ts", violations: 1, baseline: 2, status: "ok" }],
			0,
		);
		expect(report.schema).toBe("ts-quality/quality-report/v1");
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		printQualityReport(report);
		expect(logSpy.mock.calls[0]?.[0]).toContain(QUALITY_REPORT_SCHEMA);
		logSpy.mockRestore();
		await rm(dir, { recursive: true, force: true });
	});

	it("filters extensions", () => {
		expect(hasExplicitListExtension("a.mjs")).toBe(true);
		expect(hasFullScanExtension("a.mjs")).toBe(false);
		expect(shouldProcessExplicitListFile("x.cjs")).toBe(true);
		expect(shouldProcessFullScanFile("x.cjs")).toBe(false);
	});

	it("covers additional CLI and IO branches", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "rv-fc-branches-"));
		process.chdir(dir);
		await writeFile("src.ts", "export const ok = 1;\n");
		const exit = async (...args: string[]) =>
			runMainExpectExit(["bun", "cli.ts", ...args]);
		expect(await exit("doctor", "--report", "json")).toBe(2);
		expect(await exit("--report", "json", "--json")).toBe(2);
		const listPath = path.join(dir, "list.txt");
		await writeFile(listPath, "\uFEFFsrc.ts\n");
		expect(await exit("--report", "json", "--files-from", listPath)).toBe(2);
		await rm(dir, { recursive: true, force: true });
	});
});

async function runMainExpectExit(argv: string[]): Promise<number> {
	let code = 0;
	const spy = spyOn(process, "exit").mockImplementation((c) => {
		code = Number(c);
		throw new Error("exit");
	});
	try {
		await main(argv);
	} catch {
		// process.exit stub
	} finally {
		spy.mockRestore();
	}
	return code;
}