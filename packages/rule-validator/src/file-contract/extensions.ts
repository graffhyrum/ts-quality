const EXPLICIT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"] as const;

const FULL_SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"] as const;

export function hasExplicitListExtension(filePath: string): boolean {
	return EXPLICIT_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

export function hasFullScanExtension(filePath: string): boolean {
	return FULL_SCAN_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}
