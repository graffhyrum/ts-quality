import path from "node:path";
import { type } from "arktype";
import type { FileSystem } from "./types";

const PackageJsonSchema = type({
  name: "string",
  "scripts?": type("Record<string, string>"),
  "dependencies?": type("Record<string, string>"),
  "devDependencies?": type("Record<string, string>"),
});

export type PackageJson = typeof PackageJsonSchema.infer;

const parsePackageJson = type("string.json.parse").to(PackageJsonSchema);

export async function readPackageJson(
  projectRoot: string,
  fs: FileSystem,
): Promise<PackageJson | null> {
  const text = await fs.readText(path.join(projectRoot, "package.json"));
  if (text === null) return null;
  const result = parsePackageJson(text);
  if (result instanceof type.errors) return null;
  return result;
}
