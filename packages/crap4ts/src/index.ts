#!/usr/bin/env bun
import { parseCli } from "./cli";
import { runInit } from "./detect/init";
import { runPipeline } from "./pipeline";
import { CrapError } from "./types";

export async function runCli(argv: string[]): Promise<number> {
  try {
    const config = parseCli(argv);
    return config.init ? await runInit(process.cwd()) : await runPipeline(config);
  } catch (error) {
    if (error instanceof CrapError) {
      console.error(error.message);
      return error.exitCode;
    }
    if (isParseArgsError(error)) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }
}

if (import.meta.main) process.exit(await runCli(process.argv));

function isParseArgsError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("ERR_PARSE_ARGS_")
  );
}
