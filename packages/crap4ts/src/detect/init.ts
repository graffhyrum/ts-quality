import { configureRunner } from "./configure";
import { detectRunners } from "./index";

export async function runInit(projectRoot: string): Promise<number> {
  const adapters = await detectRunners(projectRoot);
  if (adapters.length === 0) return reportNoneFound();
  await Promise.allSettled(adapters.map((a) => configureRunner(a, projectRoot)));
  return 0;
}

function reportNoneFound(): number {
  console.error("No supported test runner detected.");
  console.error("Supported runners: bun");
  return 1;
}
