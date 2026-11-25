##

This repo is `deslop-please-ts`, a TypeScript architectural linter. The product is the CLI in `src/cli.ts`. The model is in `src/model.ts` and the six checks are in `src/lint.ts`. The todo app files under `src/` are sample fixtures, not the product.

## Commands

- `bun run deslop` - Run the linter on the current directory
- `bun run dev` - Run the CLI entry with reload
- `bun run build` - Bundle the CLI for Node
- `bun run test` - Run all tests
- `bun run test <pattern>` - Run specific tests matching pattern
- `bun run typecheck` - Type-check with `bun check`
- `bun run lint` - Lint with oxlint (type-aware)
- `bun run fmt` - Format with `bun fmt`
- `bun run vet` - Quiet quality gate. Order: fmt, audit, typecheck, lint, rule-validator, stepdown, crap4ts, test

## Code Style

### Types & Validation

- Use `ArkType` for runtime validation - NO `any` types
- Use `@arkenv/core` for environment variables
- Strict TypeScript enabled: noUncheckedIndexedAccess, noImplicitOverride

### Functions & Modules

- Use factory functions with revealing modules - NO ES6 classes
- `createUserService(db)` instead of `class UserServiceImpl`
- Export functions, not classes with static methods

### Strings

- Template literals only - NO string concatenation with `+`
- Use `${}` interpolation: `const msg = \`Hello ${name}\``
- Never: `const msg = "Hello " + name`

### Imports

- Direct imports only - NO barrel exports
- Import from source files, not index files
- Use `import { thing } from './thing'` not `import { thing } from './things'`

### Testing

- Use `bun test` with `import { test, expect } from "bun:test"`
- Test files named `*.test.ts` in same directory as source
- Write descriptive test names that explain behavior

### Configuration

- Use `@arkenv/core` from [`config.ts`](./config.ts) for environment variables - NEVER remove it
- Import: `import { CONFIG, type Config } from './config'`
- Access env: `CONFIG.isDevelopment`, `CONFIG.isProduction`, `CONFIG.nodeEnv`
- All env vars must be validated through @arkenv/core

## Bun APIs

Use Bun's native APIs instead of Node equivalents:

- `Bun.serve()` for HTTP/WebSockets - don't use `express`
- `bun:sqlite` for SQLite - don't use `better-sqlite3`
- `Bun.sql` for Postgres - don't use `pg`
- `Bun.file()` for file I/O - don't use `node:fs`
- `Bun.$` for shell commands - don't use `execa`
- Bun auto-loads `.env` - don't use `dotenv`
- For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Frontend

Use HTML imports with Bun, NOT vite:

```ts
import index from "./index.html";
Bun.serve({ routes: { "/": index } });
```

HTML can import `.tsx`/`.css` directly. Run with `bun --hot ./index.ts`

## Packages

Packages are deep modules: see [src/packages/README.md](./src/packages/README.md) before adding or importing one.

## Rule table

Each rule pairs with what enforces it. When a rule has no enforcer, that is a gap: fix it at the highest level that works before adding more text.

| Rule                                                                                                                                         | Enforcer                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Test-file recognition uses `isTestFile()` from `test-file.ts` (single owner). Never inline `.test.ts`/`.spec.ts` suffix checks.              | `test-file.ts` (centralized function); `src/lint.ts` and `scripts/coverage-threshold.ts` import it |
| Do not unify two types solely because they have identical fields. Unify only when they represent the same concept and would change together. | None yet (judgment). Revert if a shared type couples two domains.                                  |
| Direct imports only, no barrel exports.                                                                                                      | dependency-cruiser (`.dependency-cruiser.cjs`) + AGENTS.md                                         |
| Factory functions, not ES6 classes.                                                                                                          | oxlint (type-aware) + AGENTS.md                                                                    |
| ArkType for runtime validation; @arkenv/core for env.                                                                                        | AGENTS.md (config.ts is critical)                                                                  |
| Template literals, no `+` concatenation.                                                                                                     | AGENTS.md                                                                                          |
| `bun run deslop` must pass on the repo's own non-exempt source.                                                                              | `bun run deslop` (CI)                                                                              |
