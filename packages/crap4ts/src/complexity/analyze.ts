import ts from "typescript";
import type { FunctionInfo } from "../types";
import { isFunctionLike } from "./nodes";
import { countComplexity } from "./visitor";

export function analyzeComplexity(content: string, filePath: string): FunctionInfo[] {
  const sourceFile = createSourceFile(filePath, content);
  const functions: FunctionInfo[] = [];
  collectFunctions(sourceFile, sourceFile, functions);
  return functions;
}

function collectFunctions(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  functions: FunctionInfo[],
): void {
  if (isFunctionWithBody(node)) functions.push(buildFunctionInfo(node, sourceFile));
  ts.forEachChild(node, (child) => {
    collectFunctions(child, sourceFile, functions);
    return undefined;
  });
}

function isFunctionWithBody(node: ts.Node): node is FunctionLikeWithBody {
  return isFunctionLike(node) && hasBody(node);
}

function buildFunctionInfo(node: FunctionLikeWithBody, sourceFile: ts.SourceFile): FunctionInfo {
  const name = deriveName(node, sourceFile);
  const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  const complexity = countComplexity(node.body);
  return { name, filePath: sourceFile.fileName, startLine, endLine, complexity };
}

function deriveName(node: FunctionLikeWithBody, sourceFile: ts.SourceFile): string {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (hasOwnName(node)) return node.name.getText(sourceFile);
  return deriveFromParent(node, sourceFile);
}

function deriveFromParent(node: ts.Node, sourceFile: ts.SourceFile): string {
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent)) return parent.name.getText(sourceFile);
  if (parent && ts.isPropertyAssignment(parent)) return parent.name.getText(sourceFile);
  if (parent && ts.isPropertyDeclaration(parent) && parent.name)
    return parent.name.getText(sourceFile);
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  return `<anonymous>:${sourceFile.fileName}:${line}`;
}

function hasOwnName(node: ts.Node): node is ts.Node & { name: ts.Identifier } {
  return "name" in node && node.name != null && ts.isIdentifier(node.name as ts.Node);
}

function createSourceFile(filePath: string, content: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    inferScriptKind(filePath),
  );
}

function inferScriptKind(filePath: string): ts.ScriptKind | undefined {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return undefined;
}

type FunctionLikeWithBody = ts.Node & { body: ts.Node };

function hasBody(node: ts.Node): node is FunctionLikeWithBody {
  return "body" in node && node.body !== undefined;
}
