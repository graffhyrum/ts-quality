export const CONTRACT_FLAG_PREFIXES = [
	"--files",
	"--files-from",
	"--renames-from",
	"--report",
	"--baseline",
	"--update-baseline",
	"--seed",
] as const;

export function argvUsesContractFlags(argv: string[]): boolean {
	return argv.some((arg) =>
		CONTRACT_FLAG_PREFIXES.some((prefix) => arg === prefix || arg.startsWith(`${prefix}=`)),
	);
}
