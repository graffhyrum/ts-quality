const EXPLICIT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"] as const;

export function hasExplicitListExtension(filePath: string): boolean {
  return EXPLICIT_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}
