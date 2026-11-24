const MIN_TIMEOUT_MS = 5000;

function computeTimeoutMs(baselineDurationMs: number, timeoutFactor: number): number {
  // Bun.spawnSync rejects a fractional timeout, and performance.now() durations are fractional.
  return Math.ceil(Math.max(baselineDurationMs * timeoutFactor, MIN_TIMEOUT_MS));
}

export { computeTimeoutMs };
