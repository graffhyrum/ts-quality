import { hasExplicitListExtension } from "./extensions";
import { toPosixPath } from "../services/file-service-common";

export function shouldProcessExplicitListFile(
	file: string,
	excludeName = "stepdown-rule",
): boolean {
	return hasExplicitListExtension(file) && !isSelfPath(file, excludeName);
}

function isSelfPath(file: string, excludeName: string): boolean {
	const segments = toPosixPath(file).split("/");
	return segments.some((s) => s === excludeName || s.startsWith(`${excludeName}.`));
}
