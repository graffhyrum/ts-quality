const EXPLICIT_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"] as const;

export function hasFullScanExtension(filePath: string): boolean {
  return hasExplicitListExtension(filePath);
}

export function hasExplicitListExtension(filePath: string): boolean {
  return EXPLICIT_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

export function isExcludedFromDiscovery(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized.endsWith(".d.ts")) return true;
  if (/\/node_modules\//.test(normalized)) return true;
  if (/\/dist\//.test(normalized)) return true;
  if (/\/coverage\//.test(normalized)) return true;
  if (/\.(test|spec)\.(ts|tsx|mts|cts)$/.test(normalized)) return true;
  return false;
}
