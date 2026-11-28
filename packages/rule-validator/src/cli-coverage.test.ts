import { describe, expect, it, spyOn } from "bun:test";
import { deduplicateAndPrint, main } from "./cli.ts";
import { asRelativePosix } from "./paths.ts";

describe("cli coverage", () => {
	it("deduplicateAndPrint counts json violations when display is empty", () => {
		const merged = deduplicateAndPrint(
			{
				errorCount: 1,
				warningCount: 1,
				violations: [
					{
						file: asRelativePosix("a.ts"),
						line: 1,
						column: 1,
						rule: "r1",
						message: "m",
						severity: "error",
						match: "x",
					},
				],
			},
			{
				errorCount: 0,
				warningCount: 1,
				violations: [
					{
						file: asRelativePosix("b.ts"),
						line: 2,
						column: 2,
						rule: "r2",
						message: "m",
						severity: "warning",
						match: "y",
					},
				],
			},
			false,
		);
		expect(merged.errorCount).toBe(1);
		expect(merged.warningCount).toBe(1);
	});

	it("rejects dual stdin contract sources", async () => {
		const spy = spyOn(process, "exit").mockImplementation((exitCode) => {
			expect(exitCode).toBe(2);
			throw new Error("exit");
		});
		try {
			await main(["bun", "cli.ts", "--files-from", "-", "--renames-from", "-"]);
		} catch (error) {
			if (!(error instanceof Error) || error.message !== "exit") throw error;
		} finally {
			spy.mockRestore();
		}
	});

	it("rejects seed with update-baseline", async () => {
		const spy = spyOn(process, "exit").mockImplementation((exitCode) => {
			expect(exitCode).toBe(2);
			throw new Error("exit");
		});
		try {
			await main(["bun", "cli.ts", "--seed", "--update-baseline"]);
		} catch (error) {
			if (!(error instanceof Error) || error.message !== "exit") throw error;
		} finally {
			spy.mockRestore();
		}
	});
	it("rejects incompatible seed flags", async () => {
		const spy = spyOn(process, "exit").mockImplementation((exitCode) => {
			expect(exitCode).toBe(2);
			throw new Error("exit");
		});
		try {
			await main(["bun", "cli.ts", "--seed", "--files", "a.ts"]);
		} catch (error) {
			if (!(error instanceof Error) || error.message !== "exit") throw error;
		} finally {
			spy.mockRestore();
		}
	});

	it("rejects incompatible json flags", async () => {
		const spy = spyOn(process, "exit").mockImplementation((exitCode) => {
			expect(exitCode).toBe(2);
			throw new Error("exit");
		});
		try {
			await main(["bun", "cli.ts", "--report", "json", "--json"]);
		} catch (error) {
			if (!(error instanceof Error) || error.message !== "exit") throw error;
		} finally {
			spy.mockRestore();
		}
	});
});