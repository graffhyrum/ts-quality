import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
export type GateConfig = {
    version: 1;
    coverageCommand: string;
    crapArgs: string[];
    threshold: number;
    projectThreshold: number;
};
export type GateCode = "ready" | "needs-bun" | "needs-token" | "needs-runner" | "wrote-config";
export type BootstrapResult = {
    version: 1;
    code: GateCode;
    message: string;
    reference: "github-packages.md" | null;
};
export type GateResult = {
    version: 1;
    exit: 0 | 1 | 2;
    isFlagged: boolean;
    crappyCount: number;
    crappyPercent: number;
    report: string;
    message: string;
};
export type ActionKind = "fix-join" | "split" | "test";
type TriageActionBase = {
    filePath: string;
    startLine: number;
    endLine: number;
    name: string;
    complexity: number;
    crapScore: number;
};
export type TriageAction = (TriageActionBase & {
    kind: "fix-join";
    coverage: null;
    reference: "join.md";
}) | (TriageActionBase & {
    kind: "split";
    coverage: number;
    reference: "split.md";
}) | (TriageActionBase & {
    kind: "test";
    coverage: number;
    reference: "test.md";
});
export type TriageResult = {
    version: 1;
    isFlagged: boolean;
    crappyPercent: number;
    action: TriageAction | null;
    remaining: number;
    report: string;
};
export type FunctionSummary = {
    name: string;
    filePath: string;
    startLine: number;
    endLine: number;
    complexity: number;
    coverage: number | null;
    crapScore: number;
    isCrappy: boolean;
};
export type ProjectSummary = {
    functions: FunctionSummary[];
    totalFunctions: number;
    crappyCount: number;
    crappyPercent: number;
    isFlagged: boolean;
};
const FORMAT_CHARS = /[\u0080-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/;
const ACTION_REFERENCE = {
    "fix-join": "join.md",
    split: "split.md",
    test: "test.md",
} as const;
export function scrubText(text: string, fallback: string): string {
    const shown = clampText(text, fallback);
    if (isUnsafeText(shown) || /_authToken|ghp_|gho_|Bearer /.test(shown))
        return fallback;
    return shown;
}
export function isUnsafeText(value: string): boolean {
    return unsafeText(value);
}
export function parseProjectSummary(raw: unknown): ProjectSummary | null {
    if (!isRecord(raw))
        return null;
    if (!Array.isArray(raw.functions))
        return null;
    if (!isWhole(raw.totalFunctions) || raw.totalFunctions < 0)
        return null;
    if (!isWhole(raw.crappyCount) || raw.crappyCount < 0)
        return null;
    if (!isNumber(raw.crappyPercent) || raw.crappyPercent < 0 || raw.crappyPercent > 100) {
        return null;
    }
    if (typeof raw.isFlagged !== "boolean")
        return null;
    const functions: FunctionSummary[] = [];
    for (const item of raw.functions) {
        const fn = parseFunction(item);
        if (fn === null)
            return null;
        functions.push(fn);
    }
    const crappyInList = functions.filter((fn) => fn.isCrappy).length;
    if (crappyInList !== raw.crappyCount)
        return null;
    if (functions.length > raw.totalFunctions)
        return null;
    if (raw.crappyCount > raw.totalFunctions)
        return null;
    const expectedPercent = raw.totalFunctions === 0 ? 0 : (raw.crappyCount / raw.totalFunctions) * 100;
    if (raw.crappyPercent !== expectedPercent)
        return null;
    return {
        functions,
        totalFunctions: raw.totalFunctions,
        crappyCount: raw.crappyCount,
        crappyPercent: raw.crappyPercent,
        isFlagged: raw.isFlagged,
    };
}
function parseFunction(raw: unknown): FunctionSummary | null {
    if (!isRecord(raw))
        return null;
    if (typeof raw.name !== "string" || unsafeText(raw.name))
        return null;
    if (typeof raw.filePath !== "string" || unsafeText(raw.filePath))
        return null;
    if (!isWhole(raw.startLine) || raw.startLine < 1)
        return null;
    if (!isWhole(raw.endLine) || raw.endLine < raw.startLine)
        return null;
    if (!isWhole(raw.complexity) || raw.complexity < 1)
        return null;
    if (!(raw.coverage === null || (isNumber(raw.coverage) && raw.coverage >= 0 && raw.coverage <= 1))) {
        return null;
    }
    if (!isNumber(raw.crapScore) || raw.crapScore < 0)
        return null;
    if (typeof raw.isCrappy !== "boolean")
        return null;
    return {
        name: raw.name,
        filePath: raw.filePath,
        startLine: raw.startLine,
        endLine: raw.endLine,
        complexity: raw.complexity,
        coverage: raw.coverage,
        crapScore: raw.crapScore,
        isCrappy: raw.isCrappy,
    };
}
export function parseGateConfig(raw: unknown): GateConfig | null {
    if (!isRecord(raw))
        return null;
    if (raw.version !== 1)
        return null;
    if (typeof raw.coverageCommand !== "string" || raw.coverageCommand.trim() === "")
        return null;
    if (unsafeText(raw.coverageCommand))
        return null;
    if (!isStringArray(raw.crapArgs) || raw.crapArgs.some((arg) => unsafeText(arg)))
        return null;
    if (!isWhole(raw.threshold) || raw.threshold < 0 || raw.threshold > 1000)
        return null;
    if (!isWhole(raw.projectThreshold) || raw.projectThreshold < 0 || raw.projectThreshold >= 100) {
        return null;
    }
    return {
        version: 1,
        coverageCommand: raw.coverageCommand,
        crapArgs: raw.crapArgs,
        threshold: raw.threshold,
        projectThreshold: raw.projectThreshold,
    };
}
export function parseTriageResult(raw: unknown, cwd: string): TriageResult | null {
    if (!isRecord(raw))
        return null;
    if (raw.version !== 1)
        return null;
    if (typeof raw.isFlagged !== "boolean")
        return null;
    if (!isNumber(raw.crappyPercent) || raw.crappyPercent < 0 || raw.crappyPercent > 100) {
        return null;
    }
    if (!isWhole(raw.remaining) || raw.remaining < 0)
        return null;
    if (typeof raw.report !== "string" || unsafeReportPath(raw.report))
        return null;
    if (!isInsideRepo(raw.report, cwd))
        return null;
    if (raw.action !== null) {
        const action = parseTriageAction(raw.action, cwd);
        if (action === null)
            return null;
        return {
            version: 1,
            isFlagged: raw.isFlagged,
            crappyPercent: raw.crappyPercent,
            action,
            remaining: raw.remaining,
            report: raw.report,
        };
    }
    if (raw.remaining !== 0)
        return null;
    return {
        version: 1,
        isFlagged: raw.isFlagged,
        crappyPercent: raw.crappyPercent,
        action: null,
        remaining: raw.remaining,
        report: raw.report,
    };
}
function unsafeReportPath(value: string): boolean {
    if (value.length > 4096 || hasControlChar(value))
        return true;
    return FORMAT_CHARS.test(value) || /[;|&`]/.test(value);
}
function parseTriageAction(raw: unknown, cwd: string): TriageAction | null {
    if (!isRecord(raw))
        return null;
    if (raw.kind !== "fix-join" && raw.kind !== "split" && raw.kind !== "test")
        return null;
    if (raw.reference !== ACTION_REFERENCE[raw.kind])
        return null;
    if (typeof raw.filePath !== "string" || unsafeText(raw.filePath))
        return null;
    if (!isInsideRepo(raw.filePath, cwd))
        return null;
    if (typeof raw.name !== "string" || unsafeText(raw.name))
        return null;
    if (!isWhole(raw.startLine) || raw.startLine < 1)
        return null;
    if (!isWhole(raw.endLine) || raw.endLine < raw.startLine)
        return null;
    if (!isWhole(raw.complexity) || raw.complexity < 1)
        return null;
    if (!isNumber(raw.crapScore) || raw.crapScore < 0)
        return null;
    const base = {
        filePath: raw.filePath,
        startLine: raw.startLine,
        endLine: raw.endLine,
        name: raw.name,
        complexity: raw.complexity,
        crapScore: raw.crapScore,
    };
    if (raw.kind === "fix-join") {
        if (raw.coverage !== null)
            return null;
        return { ...base, kind: "fix-join", coverage: null, reference: "join.md" };
    }
    if (!(isNumber(raw.coverage) && raw.coverage >= 0 && raw.coverage <= 1))
        return null;
    if (raw.kind === "split") {
        return { ...base, kind: "split", coverage: raw.coverage, reference: "split.md" };
    }
    return { ...base, kind: "test", coverage: raw.coverage, reference: "test.md" };
}
function isWhole(value: unknown): value is number {
    return isNumber(value) && Number.isInteger(value);
}
function unsafeText(value: string): boolean {
    if (value.length > 240 || hasControlChar(value))
        return true;
    return FORMAT_CHARS.test(value) || /[;|&`]/.test(value);
}
export function isInsideRepo(filePath: string, cwd: string): boolean {
    const root = canonicalize(resolve(cwd));
    const target = canonicalize(resolve(root, filePath));
    const rel = relative(root, target);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel))
        return false;
    return true;
}
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}
function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function hasControlChar(value: string): boolean {
    return /[\u0000-\u001f]/.test(value);
}
function canonicalize(filePath: string): string {
    try {
        return realpathSync(filePath);
    }
    catch {
        return filePath;
    }
}
export function clampText(text: string, fallback: string): string {
    const cleaned = text
        .replace(/[\u0000-\u001f]/g, " ")
        .slice(0, 240)
        .trim();
    return cleaned.length > 0 ? cleaned : fallback;
}
