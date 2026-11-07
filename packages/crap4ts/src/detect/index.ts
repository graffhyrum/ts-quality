import { bunAdapter } from "./runners/bun";
import type { RunnerAdapter } from "./types";

const ADAPTERS: readonly RunnerAdapter[] = [bunAdapter];

export async function detectRunners(projectRoot: string): Promise<RunnerAdapter[]> {
  const pairs = await Promise.all(
    ADAPTERS.map(async (a) => ({ a, ok: await a.detect(projectRoot) })),
  );
  return pairs.filter((p) => p.ok).map((p) => p.a);
}
