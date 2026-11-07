import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export async function bunCopyFile(from: string, to: string): Promise<void> {
    if (!(await bunExists(from)))
        throw new Error(`copy source missing: ${from}`);
    mkdirSync(dirname(to), { recursive: true });
    await Bun.write(to, Bun.file(from), { createPath: false });
}
export function bunExists(path: string): Promise<boolean> {
    return Bun.file(path).exists();
}
export function bunReadText(path: string): Promise<string> {
    return Bun.file(path).text();
}
export async function bunWriteText(path: string, contents: string): Promise<void> {
    await Bun.write(path, contents);
}
export function bunMkdirp(path: string): void {
    mkdirSync(path, { recursive: true });
}
export function whichBun(command: string): string | null {
    return Bun.which(command) ?? (command === "bun" ? process.execPath : null);
}
export async function spawnCaptured(command: string, args: string[], cwd: string): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
}> {
    const argv = command === "bunx"
        ? [process.execPath, "x", ...args]
        : command === "bun"
            ? [process.execPath, ...args]
            : [command, ...args];
    const proc = Bun.spawn(argv, {
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
        cwd,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    return { exitCode, stdout, stderr };
}
