import path from "node:path";

export function normalizeBaselineKey(raw: string, cwd = process.cwd()): string {
  const stripped = raw.replace(/\r$/, "");
  if (stripped.includes("\n") || stripped.includes("\0")) {
    throw new UsageError("path contains invalid characters");
  }
  let relative = stripped;
  if (path.isAbsolute(stripped)) {
    relative = path.relative(cwd, stripped);
    const escaped = relative.startsWith("..") || path.isAbsolute(relative);
    if (escaped) throw new UsageError("path escapes cwd");
  }
  const posix = path.posix.normalize(relative.replaceAll("\\", "/"));
  if (posix.startsWith("/") || posix === "" || posix === "." || posix.split("/").includes("..")) {
    throw new UsageError("invalid path");
  }
  return posix.startsWith("./") ? posix.slice(2) : posix;
}

export function absolutePathForKey(key: string, cwd = process.cwd()): string {
  return path.resolve(cwd, key);
}

/** Sort order for baseline keys and report paths (UTF-16 code units, not locale). */
export function comparePath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}
