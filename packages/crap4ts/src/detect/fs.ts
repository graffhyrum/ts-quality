import { realpathSync } from "node:fs";
import type { FileSystem } from "./types";

export const bunFileSystem: FileSystem = {
  exists: async (p) => Bun.file(p).exists(),
  readText: async (p) => {
    const f = Bun.file(p);
    return (await f.exists()) ? f.text() : null;
  },
  realPath: async (p) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  },
};
