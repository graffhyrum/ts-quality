import * as ts from "typescript";
import path from "node:path";
const ASSIGNMENT_OPS = new Set<number>([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
]);
export type ModuleId = number;
export type ItemId = number;
export type ItemKind =
  "module" | "type" | "function" | "field" | "constant" | "other";
export type ModuleInfo = {
  readonly id: ModuleId;
  readonly path: string;
  readonly lines: number;
};
export type Item = {
  readonly id: ItemId;
  readonly kind: ItemKind;
  readonly name: string;
  readonly owner: ModuleId;
  readonly parent: ItemId | null;
  readonly file: string;
  readonly line: number;
  readonly exported: boolean;
};
export type Reference = {
  readonly file: string;
  readonly line: number;
  readonly from: ModuleId;
  readonly holder: ItemId | null;
  readonly item: ItemId;
  readonly copies: boolean;
};
export type ImportEdge = {
  readonly from: ModuleId;
  readonly to: ModuleId;
  readonly typeOnly: boolean;
  readonly dynamic: boolean;
};
export type Model = {
  readonly root: string;
  readonly modules: readonly ModuleInfo[];
  readonly items: readonly Item[];
  readonly references: readonly Reference[];
  readonly imports: readonly ImportEdge[];
};
export function buildModel(root: string): Model {
  const configPath = ts.findConfigFile(
    root,
    (fileName) => ts.sys.fileExists(fileName),
    "tsconfig.json",
  );
  if (!configPath) throw new Error(`no tsconfig.json found under ${root}`);
  const { config, error } = ts.readConfigFile(configPath, (fileName) =>
    ts.sys.readFile(fileName),
  );
  if (error) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  }
  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    path.dirname(configPath),
  );
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
  const checker = program.getTypeChecker();
  const sourceFiles = program
    .getSourceFiles()
    .filter(
      (sf) => !sf.isDeclarationFile && !sf.fileName.includes("node_modules"),
    );
  const modules: ModuleInfo[] = [];
  const pathToModule = new Map<string, ModuleId>();
  for (const sf of sourceFiles) {
    const id = modules.length;
    modules.push({
      id,
      path: sf.fileName,
      lines: sf.getLineStarts().length,
    });
    pathToModule.set(sf.fileName, id);
  }
  const items: Item[] = [];
  const nodeToItem = new Map<ts.Node, ItemId>();
  const symbolToItem = new Map<ts.Symbol, ItemId>();
  for (const sf of sourceFiles) {
    const moduleId = pathToModule.get(sf.fileName);
    if (moduleId === undefined) continue;
    collectItems(sf, moduleId, checker, items, nodeToItem, symbolToItem);
  }
  const references: Reference[] = [];
  for (const sf of sourceFiles) {
    const moduleId = pathToModule.get(sf.fileName);
    if (moduleId === undefined) continue;
    collectReferences(
      sf,
      moduleId,
      checker,
      symbolToItem,
      nodeToItem,
      references,
    );
  }
  const imports: ImportEdge[] = [];
  for (const sf of sourceFiles) {
    const moduleId = pathToModule.get(sf.fileName);
    if (moduleId === undefined) continue;
    collectImports(sf, moduleId, checker, pathToModule, imports);
  }
  return { root, modules, items, references, imports };
}
export function formatModel(model: Model): string {
  const lines: string[] = [];
  lines.push(`Model root: ${model.root}`);
  lines.push(`Modules (${model.modules.length}):`);
  for (const m of model.modules) lines.push(`  [${m.id}] ${m.path}`);
  lines.push(`Items (${model.items.length}):`);
  for (const it of model.items) {
    lines.push(
      `  [${it.id}] ${it.kind} ${it.name} (module ${it.owner}, parent ${it.parent ?? "none"}, ${it.file}:${it.line})`,
    );
  }
  lines.push(`References (${model.references.length}):`);
  for (const r of model.references) {
    lines.push(
      `  ${r.file}:${r.line} module ${r.from} holder ${r.holder ?? "none"} -> item ${r.item} copies=${r.copies}`,
    );
  }
  lines.push(`Imports (${model.imports.length}):`);
  for (const e of model.imports) {
    lines.push(
      `  module ${e.from} -> module ${e.to} typeOnly=${e.typeOnly} dynamic=${e.dynamic}`,
    );
  }
  return lines.join("\n");
}
function collectItems(
  sourceFile: ts.SourceFile,
  moduleId: ModuleId,
  checker: ts.TypeChecker,
  items: Item[],
  nodeToItem: Map<ts.Node, ItemId>,
  symbolToItem: Map<ts.Symbol, ItemId>,
): void {
  function visit(node: ts.Node, parentItemId: ItemId | null): void {
    if (ts.isVariableStatement(node)) {
      const exported = isExported(node);
      for (const decl of node.declarationList.declarations) {
        const n = ts.isIdentifier(decl.name) ? decl.name.text : null;
        if (n) {
          addItem(
            items,
            nodeToItem,
            symbolToItem,
            checker,
            "constant",
            n,
            decl,
            sourceFile,
            moduleId,
            parentItemId,
            exported,
          );
        }
      }
      ts.forEachChild(node, (c) => visit(c, parentItemId));
      return;
    }
    const kind = classifyDeclaration(node);
    const name = kind ? nameOf(node) : null;
    if (kind && name) {
      const id = addItem(
        items,
        nodeToItem,
        symbolToItem,
        checker,
        kind,
        name,
        node,
        sourceFile,
        moduleId,
        parentItemId,
        isExported(node),
      );
      const childParent = kind === "type" ? id : parentItemId;
      ts.forEachChild(node, (c) => visit(c, childParent));
      return;
    }
    ts.forEachChild(node, (c) => visit(c, parentItemId));
  }
  visit(sourceFile, null);
}
function collectReferences(
  sourceFile: ts.SourceFile,
  moduleId: ModuleId,
  checker: ts.TypeChecker,
  symbolToItem: Map<ts.Symbol, ItemId>,
  nodeToItem: Map<ts.Node, ItemId>,
  refs: Reference[],
): void {
  function visit(node: ts.Node, holder: ItemId | null): void {
    const itemForNode = nodeToItem.get(node);
    const newHolder = itemForNode !== undefined ? itemForNode : holder;
    if (ts.isIdentifier(node)) {
      const parentNode = node.parent as ts.Node | undefined;
      const parentNodeWithName = parentNode as
        | {
            name?: ts.Node;
          }
        | undefined;
      const isDeclarationNode =
        parentNode !== undefined &&
        (ts.isClassDeclaration(parentNode) ||
          ts.isInterfaceDeclaration(parentNode) ||
          ts.isTypeAliasDeclaration(parentNode) ||
          ts.isEnumDeclaration(parentNode) ||
          ts.isFunctionDeclaration(parentNode) ||
          ts.isMethodDeclaration(parentNode) ||
          ts.isMethodSignature(parentNode) ||
          ts.isPropertyDeclaration(parentNode) ||
          ts.isPropertySignature(parentNode) ||
          ts.isGetAccessorDeclaration(parentNode) ||
          ts.isSetAccessorDeclaration(parentNode) ||
          ts.isVariableDeclaration(parentNode));
      const isDeclarationName =
        isDeclarationNode && parentNodeWithName?.name === node;
      if (!isDeclarationName) {
        const sym = checker.getSymbolAtLocation(node);
        if (sym) {
          const resolved =
            sym.flags & ts.SymbolFlags.Alias
              ? checker.getAliasedSymbol(sym)
              : sym;
          const itemId = symbolToItem.get(resolved);
          if (itemId !== undefined) {
            refs.push({
              file: sourceFile.fileName,
              line: lineOf(sourceFile, node),
              from: moduleId,
              holder,
              item: itemId,
              copies: computeCopies(node),
            });
          }
        }
      }
    }
    ts.forEachChild(node, (c) => visit(c, newHolder));
  }
  visit(sourceFile, null);
}
function collectImports(
  sourceFile: ts.SourceFile,
  moduleId: ModuleId,
  checker: ts.TypeChecker,
  pathToModule: Map<string, ModuleId>,
  edges: ImportEdge[],
): void {
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const typeOnly = clause?.isTypeOnly ?? false;
      addEdge(node.moduleSpecifier, typeOnly, false);
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier)
        addEdge(node.moduleSpecifier, node.isTypeOnly, false);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) addEdge(arg, false, true);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  function addEdge(
    specifier: ts.Expression,
    typeOnly: boolean,
    dynamic: boolean,
  ): void {
    const sym = checker.getSymbolAtLocation(specifier);
    if (!sym) return;
    const decl = sym.declarations?.[0];
    if (!decl || !ts.isSourceFile(decl)) return;
    const to = pathToModule.get(decl.fileName);
    if (to === undefined) return;
    edges.push({ from: moduleId, to, typeOnly, dynamic });
  }
}
function addItem(
  items: Item[],
  nodeToItem: Map<ts.Node, ItemId>,
  symbolToItem: Map<ts.Symbol, ItemId>,
  checker: ts.TypeChecker,
  kind: ItemKind,
  name: string,
  node: ts.Node,
  sourceFile: ts.SourceFile,
  moduleId: ModuleId,
  parent: ItemId | null,
  exported: boolean,
): ItemId {
  const id = items.length;
  items.push({
    id,
    kind,
    name,
    owner: moduleId,
    parent,
    file: sourceFile.fileName,
    line: lineOf(sourceFile, node),
    exported,
  });
  nodeToItem.set(node, id);
  const nameNode = (
    node as {
      name?: ts.Node;
    }
  ).name;
  if (nameNode) {
    const sym = checker.getSymbolAtLocation(nameNode);
    if (sym) symbolToItem.set(sym, id);
  }
  return id;
}
function classifyDeclaration(node: ts.Node): ItemKind | null {
  if (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return "type";
  }
  if (ts.isFunctionDeclaration(node)) return "function";
  if (
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    return "function";
  }
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
    return "field";
  }
  return null;
}
function isExported(node: ts.Node): boolean {
  const flags = ts.getCombinedModifierFlags(node as ts.Declaration);
  return (flags & ts.ModifierFlags.Export) !== 0;
}
function nameOf(node: ts.Node): string | null {
  const n = (
    node as {
      name?: ts.Node;
    }
  ).name;
  if (!n) return null;
  if (ts.isIdentifier(n)) return n.text;
  if (ts.isLiteralExpression(n)) {
    return String((n as ts.LiteralExpression).text);
  }
  return null;
}
function computeCopies(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return true;
  const accessNode =
    ts.isPropertyAccessExpression(parent) && parent.name === node
      ? parent
      : ts.isElementAccessExpression(parent) &&
          parent.argumentExpression === node
        ? parent
        : node;
  const container = accessNode.parent;
  if (
    ts.isBinaryExpression(container) &&
    container.left === accessNode &&
    isAssignmentOp(container.operatorToken.kind)
  ) {
    return false;
  }
  if (
    (ts.isPropertyAccessExpression(container) ||
      ts.isElementAccessExpression(container)) &&
    container.expression === accessNode
  ) {
    return false;
  }
  return true;
}
function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1;
}
function isAssignmentOp(kind: number): boolean {
  return ASSIGNMENT_OPS.has(kind);
}
