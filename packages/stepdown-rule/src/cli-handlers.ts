import { emitCliError } from "./cli-errors";
import { ExitInternal } from "./exit-codes";
import { createReporter, type Reporter } from "./reporter";

export function handleUnexpectedError(
	error: unknown,
	reporter: Reporter = createReporter("human"),
): void {
	const message = error instanceof Error ? error.message : String(error);
	const payload = {
		code: "INTERNAL_ERROR" as const,
		message,
		hint: "Report this issue with the command and file patterns used.",
	};
	emitCliError(payload);
	process.exitCode = reporter.reportEarlyFailure("analyze", [payload], {
		command: agentsCommand(reporter, "analyze"),
	});
	if (process.exitCode === undefined) {
		process.exitCode = ExitInternal;
	}
}

function agentsCommand(reporter: Reporter, kind: "analyze" | "fix"): string {
	return reporter.format === "agents" ? `agents/${kind}` : kind;
}
