# mutate4ts

## 2.0.0

### Major Changes

- 382229b: Exit codes changed. Usage errors now exit 2 (they exited 1 before, the same as surviving mutants).
  Errored mutations now exit 3. Timed-out mutations now count as killed.
  When a run has both survivors and errors, the exit code is the highest one (3).
  A failed source restore now exits 4, because the file may still contain a mutation.
  See docs/adr/0001-mutation-exit-codes.md.

## 1.0.1

### Patch Changes

- 9c1d9c2: Released from the ts-quality monorepo: the `mutate4ts` bin runs from the shipped TypeScript source (so it links on a fresh install before any build), the mutator registry uses `isTarget` for its node predicate, and the dev-tool graph is audit-clean.
