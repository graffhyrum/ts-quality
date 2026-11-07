import path from "node:path";
import { bunFileSystem } from "./fs";
import type { FileSystem, RunnerAdapter } from "./types";

type WriteFile = (path: string, content: string) => Promise<unknown>;

export async function configureRunner(
  adapter: RunnerAdapter,
  projectRoot: string,
  write: WriteFile = Bun.write,
  fs: FileSystem = bunFileSystem,
): Promise<void> {
  const dest = path.join(projectRoot, adapter.configFilename());
  if (await fs.exists(dest)) return warnSkipped(dest);
  await writeConfigFile(adapter, dest, write);
  printInstructions(adapter);
}

function warnSkipped(dest: string): void {
  console.warn(`Skipping: ${dest} already exists`);
}

async function writeConfigFile(
  adapter: RunnerAdapter,
  dest: string,
  write: WriteFile,
): Promise<void> {
  try {
    await write(dest, adapter.generateConfig());
    console.log(`Written: ${dest}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to write ${dest}: ${msg}`);
  }
}

function printInstructions(adapter: RunnerAdapter): void {
  console.log(`\nNext steps for ${adapter.name}:`);
  for (const instruction of adapter.getSetupInstructions()) {
    console.log(instruction);
  }
}
