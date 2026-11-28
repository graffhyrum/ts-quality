import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildFileSelection } from "./selection.ts";

const { runPerFileScan } = (await import("./analyze.ts?fresh" as never)) as typeof import("./analyze.ts");

describe.serial("runPerFileScan", () => {
	const root = process.cwd();

	afterEach(() => {
		process.chdir(root);
	});

	it("scans scoped selections", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "rv-analyze-scoped-"));
		process.chdir(dir);
		await writeFile("clean.ts", "export const value = 1;\n");
		const selection = await buildFileSelection(
			{
				filesFlags: ["clean.ts"],
				filesFromPresent: false,
				filesFromEmpty: false,
				legacyPatternPresent: false,
			},
			["clean.ts"],
		);
		const result = await runPerFileScan(selection, {}, { json: true });
		expect(result.reportKeys).toEqual(["clean.ts"]);
		expect(result.combined.errorCount).toBe(0);
		await rm(dir, { recursive: true, force: true });
	});

	it("scans full selections in a temp tree", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "rv-analyze-full-"));
		await mkdir(path.join(dir, "pkg"), { recursive: true });
		const saved = process.cwd();
		process.chdir(dir);
		await writeFile("pkg/ok.ts", "export const ok = 1;\n");
		const selection = await buildFileSelection(
			{
				filesFlags: [],
				filesFromPresent: false,
				filesFromEmpty: false,
				legacyPatternPresent: false,
			},
			[],
		);
		const result = await runPerFileScan(selection, {}, { json: false });
		expect(result.reportKeys).toContain("pkg/ok.ts");
		process.chdir(saved);
		await rm(dir, { recursive: true, force: true });
	});
});