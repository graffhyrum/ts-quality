import { Option } from "commander";

export const filesFromOption = new Option(
	"--files-from <path>",
	"newline-separated paths, or - for stdin",
);

export const renamesFromOption = new Option(
	"--renames-from <path>",
	"from<TAB>to rename map for baseline carry",
);

export const reportOption = new Option(
	"--report <format>",
	"structured report format (json)",
).choices(["json"]);

export const baselineOption = new Option(
	"--baseline <path>",
	"path to the violation baseline file",
);

export const updateBaselineOption = new Option(
	"--update-baseline",
	"shrink stored baseline counts after a clean run",
);

export const seedOption = new Option(
	"--seed",
	"create a baseline from the current violation counts (full scan)",
);

export function makeFilesOption(): Option {
	return new Option("--files <path>", "path to include in a scoped run (repeatable)").argParser(
		collectPaths,
	);
}

function collectPaths(value: string, previous: string[]): string[] {
	return previous.concat([value]);
}

export type ContractCliOptions = {
	files?: string[];
	filesFrom?: string;
	renamesFrom?: string;
	report?: string;
	baseline?: string;
	updateBaseline?: boolean;
	seed?: boolean;
};
