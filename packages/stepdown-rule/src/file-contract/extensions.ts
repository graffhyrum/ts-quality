const EXPLICIT_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"] as const;

export function hasExplicitListExtension(filePath: string): boolean {
	return EXPLICIT_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}
