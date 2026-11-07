type CoverageProc = {
    stdout: ReadableStream<Uint8Array>;
    stderr: ReadableStream<Uint8Array>;
    exited: Promise<number>;
};
export async function reportCoverageGap(spawn: (argv: string[]) => CoverageProc): Promise<number> {
    const proc = spawn([process.execPath, "test", "--coverage"]);
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    const parsed = parseCoverageGap(`${stdout}\n${stderr}`);
    if (parsed === null) {
        console.log("all funcs=missing lines=missing");
        console.log("failing_files=1");
        console.log("coverage table missing");
        console.log(`test_exit=${exitCode}`);
        return 1;
    }
    console.log(parsed.summary);
    console.log(`failing_files=${parsed.failing.length}`);
    for (const line of parsed.failing)
        console.log(line);
    console.log(`test_exit=${exitCode}`);
    return parsed.failing.length === 0 && exitCode === 0 ? 0 : 1;
}
export function parseCoverageGap(text: string): {
    summary: string;
    failing: string[];
} | null {
    const row = /^\s*(.+?)\s+\|\s+(\d+\.\d+)\s+\|\s+(\d+\.\d+)\s+\|/gm;
    const failing: string[] = [];
    let summary = "";
    for (const match of text.matchAll(row)) {
        const file = match[1]?.trim();
        const funcs = Number(match[2]);
        const lines = Number(match[3]);
        if (file === undefined || !Number.isFinite(funcs) || !Number.isFinite(lines))
            continue;
        if (file === "File" || file.startsWith("-"))
            continue;
        if (file === "All files") {
            summary = `all funcs=${funcs.toFixed(2)} lines=${lines.toFixed(2)}`;
            continue;
        }
        if (funcs < 95 || lines < 95) {
            failing.push(`${file} funcs=${funcs.toFixed(2)} lines=${lines.toFixed(2)}`);
        }
    }
    if (summary === "")
        return null;
    return { summary, failing };
}
