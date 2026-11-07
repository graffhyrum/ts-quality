import ts from "typescript";
import { COMPLEXITY_NODES, COMPLEXITY_OPERATORS, isFunctionLike } from "./nodes";

export function countComplexity(body: ts.Node): number {
  let count = 1;
  walk(body);
  return count;

  function walk(node: ts.Node): void {
    count += scoreNode(node);
    ts.forEachChild(node, (child) => {
      if (!isFunctionLike(child)) walk(child);
      return undefined;
    });
  }
}

function scoreNode(node: ts.Node): number {
  if (COMPLEXITY_NODES.has(node.kind)) return 1;
  if (isBinaryWithComplexityOp(node)) return 1;
  return 0;
}

function isBinaryWithComplexityOp(node: ts.Node): boolean {
  return ts.isBinaryExpression(node) && COMPLEXITY_OPERATORS.has(node.operatorToken.kind);
}
