import { homedir } from "node:os";
import { join } from "node:path";
import { bunCopyFile, bunExists, bunMkdirp, bunReadText, bunWriteText, spawnCaptured, whichBun, } from "./bun-io";
import { scrubText, type BootstrapResult, type GateConfig } from "./types";
export type WhichFn = (command: string) => string | null;
export type FileReader = {
    exists: (path: string) => boolean | Promise<boolean>;
    readText: (path: string) => string | Promise<string>;
};
export type CommandRunner = (command: string, args: string[], cwd: string) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
}>;
export type FileWriter = {
    writeText: (path: string, contents: string) => void | Promise<void>;
    mkdirp: (path: string) => void;
    copyFile: (from: string, to: string) => void | Promise<void>;
};
const INSTALL_MESSAGE = "bun add -d @graffhyrum/crap4ts";
const DEFAULT_GATE: GateConfig = {
    version: 1,
    coverageCommand: "bun test --coverage",
    crapArgs: ["-c", "coverage/lcov.info", "-f", "lcov"],
    threshold: 30,
    projectThreshold: 0,
};
if (import.meta.main)
    process.exit(await main(process.argv.slice(2), cliDeps()));
export async function main(argv: string[], deps: Parameters<typeof runBootstrap>[1]): Promise<number> {
    try {
        const { result, exit } = await runBootstrap(argv, deps);
        console.log(JSON.stringify(result));
        return exit;
    }
    catch (err) {
        const result: BootstrapResult = {
            version: 1,
            code: "needs-runner",
            message: err instanceof Error ? safeDetail(err.message, "bootstrap failed") : "bootstrap failed",
            reference: null,
        };
        console.log(JSON.stringify(result));
        return 2;
    }
}
export async function runBootstrap(argv: string[], deps: {
    which: WhichFn;
    reader: FileReader;
    runner: CommandRunner;
    writer: FileWriter;
    cwd: string;
    templatePath: string;
}): Promise<{
    result: BootstrapResult;
    exit: 0 | 2;
}> {
    const apply = argv.includes("--apply");
    const ci = argv.includes("--ci");
    const npmrcPath = join(homedir(), ".npmrc");
    const bunPath = deps.which("bun");
    let npmrcText: string | null = null;
    if (await deps.reader.exists(npmrcPath)) {
        npmrcText = await deps.reader.readText(npmrcPath);
    }
    const planned = planBootstrap({ bunPath, npmrcText, apply });
    if (planned.code === "needs-bun" || planned.code === "needs-token") {
        return { result: planned, exit: 2 };
    }
    if (apply && planned.code === "wrote-config") {
        try {
            const install = await deps.runner("bun", ["add", "-d", "@graffhyrum/crap4ts"], deps.cwd);
            if (install.exitCode !== 0) {
                return {
                    result: {
                        version: 1,
                        code: "needs-runner",
                        message: safeDetail(install.stderr, "bun add failed"),
                        reference: null,
                    },
                    exit: 2,
                };
            }
            const init = await deps.runner("bunx", ["@graffhyrum/crap4ts", "--init"], deps.cwd);
            if (init.exitCode !== 0) {
                return {
                    result: {
                        version: 1,
                        code: "needs-runner",
                        message: safeDetail(init.stderr, "crap4ts --init failed"),
                        reference: null,
                    },
                    exit: 2,
                };
            }
        }
        catch (err) {
            return {
                result: {
                    version: 1,
                    code: "needs-runner",
                    message: err instanceof Error ? safeDetail(err.message, "runner failed") : "runner failed",
                    reference: null,
                },
                exit: 2,
            };
        }
        const gateDir = join(deps.cwd, ".crap4ts");
        deps.writer.mkdirp(gateDir);
        await deps.writer.writeText(join(gateDir, "gate.json"), `${JSON.stringify(DEFAULT_GATE, null, 2)}\n`);
    }
    if (ci) {
        const workflowDir = join(deps.cwd, ".github", "workflows");
        deps.writer.mkdirp(workflowDir);
        await deps.writer.copyFile(deps.templatePath, join(workflowDir, "crap4ts.yml"));
    }
    return { result: planned, exit: 0 };
}
export function planBootstrap(input: {
    bunPath: string | null;
    npmrcText: string | null;
    apply: boolean;
}): BootstrapResult {
    if (input.bunPath === null) {
        return {
            version: 1,
            code: "needs-bun",
            message: "bun is not on PATH",
            reference: null,
        };
    }
    if (input.npmrcText === null || !hasGithubPackagesToken(input.npmrcText)) {
        return {
            version: 1,
            code: "needs-token",
            message: "GitHub Packages auth token is missing from npmrc",
            reference: "github-packages.md",
        };
    }
    if (!input.apply) {
        return {
            version: 1,
            code: "ready",
            message: INSTALL_MESSAGE,
            reference: null,
        };
    }
    return {
        version: 1,
        code: "wrote-config",
        message: "installed crap4ts and wrote .crap4ts/gate.json",
        reference: null,
    };
}
function safeDetail(text: string, fallback: string): string {
    return scrubText(text, fallback);
}
export function hasGithubPackagesToken(npmrc: string): boolean {
    for (const line of npmrc.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || trimmed === "")
            continue;
        if (trimmed.includes("npm.pkg.github.com") && /_authToken\s*=\s*\S+/.test(trimmed)) {
            return true;
        }
    }
    return false;
}
export function cliDeps(): Parameters<typeof runBootstrap>[1] {
    return {
        which: whichBun,
        reader: { exists: bunExists, readText: bunReadText },
        runner: spawnCaptured,
        writer: {
            writeText: bunWriteText,
            mkdirp: bunMkdirp,
            copyFile: bunCopyFile,
        },
        cwd: process.cwd(),
        templatePath: join(import.meta.dir, "..", "templates", "gate.yml"),
    };
}
