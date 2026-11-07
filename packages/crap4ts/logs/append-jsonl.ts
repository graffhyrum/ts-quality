import { appendFileSync } from "node:fs";

const file = Bun.argv.includes("--file")
  ? Bun.argv[Bun.argv.indexOf("--file") + 1]
  : "logs/findings.jsonl";

const text = await Bun.stdin.text();
const line = text.trim();
if (line.length === 0) {
  throw new Error("empty jsonl record");
}
const parsed: unknown = JSON.parse(line);
if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
  throw new Error("jsonl record must be an object");
}
appendFileSync(file ?? "logs/findings.jsonl", `${JSON.stringify(parsed)}\n`);
