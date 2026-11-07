import { type } from "arktype";

const StatementLocationSchema = type({
  start: { line: "number", column: "number" },
  end: { line: "number", column: "number" },
});

export const IstanbulFileSchema = type({
  statementMap: "Record<string, unknown>",
  s: "Record<string, number>",
  "fnMap?": "unknown",
  "branchMap?": "unknown",
  "f?": "unknown",
  "b?": "unknown",
  "path?": "string",
});

export { StatementLocationSchema };

export const V8RangeSchema = type({
  startOffset: "number.integer >= 0",
  endOffset: "number.integer >= 0",
  count: "number.integer >= 0",
}).narrow((range, ctx) =>
  range.endOffset >= range.startOffset ? true : ctx.reject("endOffset must be >= startOffset"),
);

export const V8FunctionSchema = type({
  functionName: "string",
  ranges: V8RangeSchema.array(),
  "isBlockCoverage?": "boolean",
});

export const V8ScriptSchema = type({
  scriptId: "string",
  url: "string",
  functions: V8FunctionSchema.array(),
});

export const V8CoverageSchema = type("string.json.parse").to(
  type({
    result: V8ScriptSchema.array(),
  }),
);

export const IstanbulJsonSchema = type("string.json.parse").to(type("Record<string, unknown>"));
