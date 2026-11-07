# ts-template

Personal TypeScript project template for Joshua Pendragon.

Clone the repo. Install dependencies. Run the quality gate. Then add your code.

```bash
bun install
bun run vet
```

Use [Bun](https://bun.sh) `1.4.4`. `packageManager` is `bun@1.4.4`.

## Quality gate

`bun run vet` runs the steps below in order. It prints nothing when they pass. It prints the failing step only.

| Step           | Command                                       |
| -------------- | --------------------------------------------- |
| fmt            | `bun fmt --check`                             |
| audit          | `bun audit`                                   |
| typecheck      | `bun check`                                   |
| lint           | `oxlint --type-aware`                         |
| rule-validator | `rule-validator`                              |
| stepdown       | `stepdown-rule`                               |
| crap4ts        | coverage, then `crap4ts`                      |
| mutate4ts      | mutation testing on `src/store.ts`            |
| test           | `bun test` with the sample coverage threshold |

The audit step asks the npm advisory registry for known problems, so `vet` (and the pre-commit hook) needs network access. A new advisory against any dependency, even a transitive one that your change did not touch, makes `vet` fail until you update that dependency (for example with `bun update`) and commit the new lockfile.

`bun run fmt` writes format fixes. `bun run lint:fix` writes lint fixes.

GitHub Actions runs `bun install --frozen-lockfile` and `bun run vet` on pull requests and on `main`.

The sample coverage baseline is 100% functions and 100% lines for gated files. `scripts/coverage-threshold.ts` holds that threshold.

## Commands

| Command                 | Description                                  |
| ----------------------- | -------------------------------------------- |
| `bun run dev`           | Run `src/index.ts` with reload               |
| `bun run build`         | Build for production                         |
| `bun run start`         | Run `src/index.ts`                           |
| `bun run test`          | Run tests                                    |
| `bun run test:coverage` | Run tests and enforce the coverage threshold |
| `bun run typecheck`     | Type-check with `bun check`                  |
| `bun run lint`          | Lint with oxlint (type-aware)                |
| `bun run fmt`           | Format with `bun fmt`                        |
| `bun run vet`           | Run the full quality gate                    |

The Husky pre-commit hook runs `bun run vet`.

## Sample

`src/` is a small multi-tenant web todo app (Bun + vanilla TS). `src/index.ts` serves it. `config.ts` reads `NODE_ENV` and `PORT` with arkenv. Replace with your code and keep `bun run vet` green.

## Code style

- Use ArkType for runtime values. Do not use `any`.
- Use arkenv in `config.ts` for environment variables.
- Use factory functions. Do not use classes for services.
- Use template literals. Do not build strings with `+`.
- Import from the source file. Do not add barrel `index.ts` re-exports.
- Put `*.test.ts` next to the source file. Use `bun:test`.

`AGENTS.md` has the same rules for coding agents.

## Project layout

```
.
├── src/                 # Sample source and tests
├── scripts/             # vet, crap4ts, and coverage threshold
├── config.ts            # arkenv environment config
├── tsconfig.json
├── .github/workflows/   # CI runs bun run vet
└── package.json
```

## Changesets

Changesets is included for apps that publish. A private app can ignore it.

```bash
bun changeset
bun run version-packages
bun run release
```

## Stack

- Bun `1.4.4` for the runtime, test runner, `bun check`, and `bun fmt`
- oxlint type-aware for lint (`oxlint-tsgolint`)
- `rule-validator` `v1.2.0`
- `stepdown-rule` `v0.4.5`
- `crap4ts` `v2.1.3`
- `mutate4ts` `v1.0.0`
- ArkType and arkenv
- Changesets and Husky
