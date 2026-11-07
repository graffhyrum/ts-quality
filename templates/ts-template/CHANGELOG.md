# ts-template

## 0.3.0

### Minor Changes

- b3bbb8e: Replace the init CLI with a clone-and-vet project template. Add a quiet quality gate: bun fmt, bun check, oxlint, rule-validator, stepdown-rule, crap4ts, and a coverage threshold.
- e24a05a: Expand the template with a Bun + vanilla TS multi-tenant web todo app.

### Patch Changes

- 3f81280: Add mutate4ts to the quality gate and normalize quality gate dependency keys.
- 7234ef8: Pin mutate4ts to the v1.0.0 tag instead of main.
- 4d1e7b6: Bump rule-validator to v1.2.0 and add bun audit to the quality gate.

## 0.2.0

### Minor Changes

- 371dc8e: Add comprehensive project documentation including README with setup instructions, commands, and code style guidelines, plus AGENTS.md for AI development assistant best practices.
- 371dc8e: Add main entry point file with Bun "Hello World" example and corresponding unit test.

### Patch Changes

- cde6f86: Initial TypeScript toolchain configuration with Bun runtime, Biome linter, and strict TypeScript settings.
- cde6f86: Add arkenv environment configuration and custom rule validator for enforcing code style guidelines.
- 371dc8e: Configure Husky for git hooks with pre-commit validation using fastvet. Set up Changesets for version management.
