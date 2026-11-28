import { promises as fs } from "node:fs";
import { hasFullScanExtension, isExcludedFromDiscovery } from "./extensions.ts";
import { pathExists } from "./read-inputs.ts";

const DISCOVERY_GLOB = "**/*.{ts,tsx,mts,cts}";

export async function discoverFullScanKeys(): Promise<string[]> {
  const keys: string[] = [];
  for await (const file of fs.glob(DISCOVERY_GLOB)) {
    const key = file.replaceAll("\\", "/");
    if (isExcludedFromDiscovery(key)) continue;
    if (!hasFullScanExtension(key)) continue;
    if (!(await pathExists(key))) continue;
    keys.push(key);
  }
  return keys.sort((a, b) => a.localeCompare(b));
}
