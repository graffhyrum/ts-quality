# Building the deslop-please Model from the TypeScript compiler API

Research ticket #2. Foundational: how to turn a TypeScript project into deslop-please's `Model` (modules, items, references, wrappers) using the TypeScript compiler API, and how that compares to ts-morph.

Sources: TypeScript wiki "Using the Compiler API" (microsoft/TypeScript), TypeScript `program.ts`/`checker.ts`, ts-morph docs, ts-archunit ADR 002, and the Rust deslop-please source (`/tmp/opencode/deslop-please`) for the target model shape.

## 1. Target model shape (from Rust deslop-please)

`Model` = `Tree` (package/module hierarchy) + `files: Vec<File>` + `items: Vec<Item>` + `references: Vec<Reference>` + `wrappers: HashMap<ItemId, Wrapper>`.

- **Module = file (ESM).** Directories are layout only (wide-directory lint). `File { path, module: NodeId, test, lines }`.
- **Item** = named declaration: `Module | Type | Impl | Function | Field | Variant | Constant | Other`, with `owner` (module node), `parent` (owning type for members), `file`.
- **Reference** = a use of an item from code: `{ file, line, from (module node), holder (innermost item), item, copies: bool, test }`.
- **Wrapper** = `Forwarder { target, fields }` (calls target passing params/self fields) or `Accessor { lent, copied, to_read }` (hands out/overwrites fields of `self`, computes nothing).
- `copies` = the reference only reads the value (takes a copy / borrows plain data / calls method on a number); never writes or reaches into it. For an accessor call, reads what it lends.

So the TS job: discover files, enumerate declarations as items, enumerate uses as references with `copies`, resolve identity across files, classify wrappers.

## 2. Project / file discovery (tsconfig-driven)

Use the canonical tsconfig pipeline; do not hand-assemble options (path aliases, `strict`, `extends` chains get dropped otherwise).

```ts
import * as ts from "typescript";
import path from "node:path";

const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(
  config,
  ts.sys,
  path.dirname(configPath),
);
const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: parsed.options,
});
```

- `program.getSourceFiles()` returns every file transitively pulled in (roots + imports + `@types` + lib `.d.ts`).
- `createProgram` expands the input set by walking imports and triple-slash references depth-first (`processImportedModules` -> `resolveModuleNames` -> `findSourceFile`).
- Filter to **project-owned** files: skip `isDeclarationFile` (lib/`.d.ts`/node_modules) unless you want external items. Module = file; directories are not modules.

Caveat: `findConfigFile` walks ancestors; `readConfigFile` returns `any`-ish config; must run through `parseJsonConfigFileContent` (or `convertCompilerOptionsFromJson`) to resolve `include`/`exclude`/`extends` and get `fileNames` + `options`. (microsoft/TypeScript wiki; issue #56050.)

TS 6.0 and earlier API. TS 7.x has a completely different (Go-based) API — pin a version and abstract behind a seam (see §7).

## 3. Enumerating items (declarations)

Walk each `SourceFile` with `ts.forEachChild` / `ts.forEachChild` recursively. Classify by `ts.is*` guards and kind:

| TS construct                                  | ItemKind          | Notes                             |
| --------------------------------------------- | ----------------- | --------------------------------- |
| `SourceFile`/module                           | Module            | one per file; module node in Tree |
| `class` / `interface` / `type` alias / `enum` | Type              |                                   |
| `function` declaration/expression             | Function          |                                   |
| class/interface method                        | Function (member) | `parent` = owning type item       |
| property/field                                | Field             | `parent` = owning type            |
| `const`/`let`/`var` at module scope           | Constant          |                                   |
| enum member                                   | Variant/Constant  |                                   |
| `namespace`/`module`                          | Module (inline)   | maps to Tree child node           |

Use `ts.getCombinedModifierFlags(node)` for export/visibility; `node.name` (Identifier) for the name. `checker.getSymbolAtLocation(name)` gives the symbol; record `symbol` -> ItemId in a `Map<ts.Symbol, ItemId>` for identity. For merged declarations (overloads, interface merging) the same symbol appears multiple times — dedupe by symbol, or record `None` definition (Rust does this for multi-defined items).

## 4. Enumerating references (uses)

Every reference is an identifier (or property access) whose resolved symbol is a workspace item. Walk the AST; at each `Identifier` / `PropertyAccessExpression` / `ElementAccessExpression` / `CallExpression`:

- `const sym = checker.getSymbolAtLocation(node)` (or `.name` for property access).
- If `sym` is an **alias** (import binding), resolve with `checker.getAliasedSymbol(sym)` to the original declaration's symbol.
- Look up `ItemId` in the symbol->item map. If found, record a `Reference`:
  - `from` = the module node of the containing file.
  - `holder` = innermost item whose definition range contains this node (function/type/field/constant); `None` if top-level module scope or impl-block header.
  - `copies` = true iff this use only reads the value (see §5).
  - `test` = whether containing file is a test file.
  - `line` = `ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line`.

Also capture **imports** as references to the imported item (module specifier -> resolved file's module symbol) and **calls** (CallExpression's callee resolves to a Function item).

To find references to a symbol across the program, the compiler's internal `findAllReferences` (Language Service) does the global scan; for a model build, the AST-walk + symbol resolution above is simpler and gives holders/`from` directly. Language Service `findReferences(fileName, position)` is the alternative when you need IDE-grade reference sets (handles string literals, JSDoc, etc.) but is heavier and position-based.

## 5. Cross-file symbol identity

- `ts.Symbol` is the type-system view; `getSymbolAtLocation` resolves an AST node to it.
- Aliases: import specifiers produce alias symbols. `checker.getAliasedSymbol(alias)` returns the original. For namespace re-exports, follow `checker.getExportSymbolOfSymbol` / module symbol.
- Merged symbols: `checker.getMergedSymbol(symbol)`.
- Declarations: `symbol.getDeclarations()` (or `.valueDeclaration` / `.declarations`). Map each declaration node to its ItemId; if multiple declarations, treat as one item (or `None` definition).
- Exported item identity across files: resolve via the module's export symbol (`sourceFile.symbol` -> `checker.getExportsOfModule`) and `checker.getSymbolAtLocation` on export specifiers.

Key: keep one `Map<ts.Symbol, ItemId>` per `Program`. Symbols are object-identity stable within a program.

## 6. `copies` (read-only use)

`copies = true` when the reference only reads the value: it takes a copy, borrows plain data to read, or calls a method on a number; it neither writes the field nor reaches into it. Determine from the **syntactic context** of the identifier:

- Read contexts → copies: RHS of assignment, argument to a call, return expression, condition, member access base that is immediately consumed as a value, template interpolation.
- Write/reach contexts → not copies: LHS of assignment, `obj.field = x`, `obj.field.push(...)`, `delete`, compound assignment `+=`, property access chained further (`x.field.nested`), spread into object being mutated, passing to a function that takes `&mut`.

Implementation: inspect `node.parent` kind. `BinaryExpression` with `node === left` and operator is assignment → not copy. `PropertyAccessExpression` where this node is the `.expression` and the whole access is used as a value → need check if the access is further member-accessed; if `parent` is another `PropertyAccessExpression`/`ElementAccessExpression` → reach (not copy). Call argument → copy (unless the callee is a known mutating method — heuristic: method name in a small set `push/splice/set/...`). Conservative default: if unsure, `copies = false` (matches Rust's "neither writes nor reaches").

For accessor calls: a reference to an accessor item has `copies = true` iff the call's result is only read (same context rules applied to the call expression).

## 7. Wrappers (forwarders & accessors)

No built-in "is wrapper" in the TS API. Heuristic over the **function body AST** and the **names it references** (mirroring Rust's `forwarders.rs`/`accessors.rs`).

**Forwarder**: a function whose body is a single call to another workspace function, passing its own parameters on (possibly through a field of `this`), and nothing else. Algorithm:

1. Collect the identifiers/names referenced inside the function body in source order.
2. Split leading signature (params + types) from body.
3. Find the first call expression in the body; its callee resolves to a workspace Function item.
4. Check that all arguments are parameters (or field paths of `this`), the receiver is at most one parameter/`this`-field path, no literals are passed, and the callee != itself.
5. Operand count must equal the target's parameter count.
6. No forwarder chain cycles (`reaches` check).

TS-specific: receiver may be `this.field` (field path of self). `this` is implicit; detect `ThisKeyword`. Parameters are the function's parameter identifiers.

**Accessor**: an inherent method with a `self`/`this` receiver whose body only hands out or overwrites fields of `this`: names one or more fields of its own type and nothing else of the workspace but types; each field's type is written in the signature. Algorithm:

1. Method's first parameter is `this` (implicit for methods) or an explicit `this: T` param.
2. Collect referenced identifiers; all must be `OwnField` (a field of the method's owning type) or `Type`.
3. Body must not compute (no calls other than field access, no arithmetic, no `len()`). Heuristic: `computes = false` unless body contains call expressions beyond property access, binary ops beyond assignment, or control flow.
4. Each field's declared type must appear in the signature text (so `fn items(&self) -> &Vec<u32>` matches `items: Vec<u32>`; `fn len(&self) -> usize { self.items.len() }` does not).
5. Partition fields into `copied` (values only handed out) vs `lent` (handed out by reference / overwritten), using `copies` of the references inside the body and whether the signature returns a reference (`&`/return type contains the field type) vs owned value. `to_read = true` if it takes `&this` and overwrites nothing.

`text.computes`, `text.returns_copies`, `text.lends_to_read`, `text.whole`, `text.function(range)`, `text.field_types(range)` from Rust need TS equivalents: parse the function's text with the TS scanner/parser or regex over the body. Simpler: use the AST body node directly — check `ts.isBlock`, enumerate statements; a single `ReturnStatement` whose expression is a `PropertyAccessExpression` on `this` → accessor candidate; an `ExpressionStatement` that is an assignment `this.x = param` → setter accessor. Compute flag = any statement not matching these shapes, or any nested call.

## 8. Performance & correctness tradeoffs vs ts-morph

- **Raw compiler API**: fastest, no wrapper overhead, direct access to all internals, uses the project's own `typescript` (no version coupling). Cost: extremely verbose (3-5x code), manual tree walking, position math, unstable internal helpers between TS versions. Best for read-only batch indexing (this tool).
- **ts-morph**: ergonomic wrappers (`getClasses()`, `findReferencesAsNodes()`), Project-from-tsconfig, manipulation tracking. Cost: wraps every node in a class (memory overhead), program reset between manipulations, slower for 5000+ files, pins a TS version range, pulls ~40MB `typescript`. Good for codegen/refactoring; overkill for read-only lint.
- For a linter that only reads, use the raw compiler API. Reuse one `Program`/`TypeChecker` for the whole run; do not recreate per file. `oldProgram` reuse helps incremental but not required for a one-shot CLI.
- TypeScript 7 (Go) will change the API; keep compiler access behind an adapter seam and target TS 6.x for now. ts-morph tracks TS releases within weeks.
- For 500-file projects overhead is negligible for both; for 5000+ files, lazy source loading / file-set narrowing (ts-archunit pattern) matters.

## 9. Recommended architecture for deslop-please-ts

Mirror Rust layout: `workspace` (tsconfig discovery) → `indexing` (build Program + TypeChecker) → `model` (items/refs/wrappers) → `graph` → `lint`. Drop the `scip` layer; the compiler API is the canonical source of module/item/reference identity. Keep `Model` identical in shape to Rust for lint parity. Put all `ts.*` calls in `indexing.ts`/`model/from_index/*`; expose a narrow `ProgramHandle { program, checker, sourceFile(path) }` to the rest.

## 10. Open questions / risks

- TS has no exact `Reference.copies` analogue; syntactic-context heuristic needed (§6). Validate against fixture projects.
- Wrapper detection by AST shape is heuristic; test against `tests/fixtures` clean/sloppy variants.
- TS 7 API migration: abstract compiler access.
- `findReferences` via Language Service vs AST walk: AST walk loses string-literal/JSDoc references; acceptable for architectural lints (code references only).
