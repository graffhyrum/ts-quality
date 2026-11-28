#!/usr/bin/env bun
import "./register-default-rules";
import { createProgram } from "./cli-program";
import { argvUsesContractFlags } from "./file-contract/contract-flags";
import { ExitUsage } from "./exit-codes";

const argv = process.argv;
if (argv.some((arg) => arg === "doctor") && argvUsesContractFlags(argv)) {
	console.error("stepdown-rule: file-scoped flags are not supported with doctor");
	process.exit(ExitUsage);
}

await createProgram().parseAsync(argv);
