#!/usr/bin/env bun
// Process entry point. Everything testable lives in src/cli.ts; this file only
// wires real stdio and process.exit, which a unit test cannot safely exercise.
import { main } from "../src/cli.ts";

main(process.argv.slice(2), {
  out: (text) => {
    process.stdout.write(text);
  },
  err: (text) => {
    process.stderr.write(text);
  },
  exit: (code) => {
    process.exit(code);
  },
});
