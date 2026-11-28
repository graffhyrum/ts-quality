import { hasExplicitListExtension } from "./extensions.ts";
import { toPosixPath } from "../paths.ts";
export function shouldProcessFullScanFile(file: string, excludeName = "rule-validator"): boolean {
	const isValidExtension =
		file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".js") || file.endsWith(".jsx");
	return isValidExtension && !isSelfPath(file, excludeName);
}
export function shouldProcessExplicitListFile(
	file: string,
	excludeName = "rule-validator",
): boolean {
	return hasExplicitListExtension(file) && !isSelfPath(file, excludeName);
}
function isSelfPath(file: string, excludeName: string): boolean {
	const segments = toPosixPath(file).split("/");
	return segments.some((s) => s === excludeName || s.startsWith(`${excludeName}.`));
}
