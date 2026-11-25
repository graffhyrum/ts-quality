# Progress

## 2026-11-24 — Move the demo todo app into a package

Status: in progress

### Scope

- Move the demo app from `src/` into `src/packages/todo-app/`.
- Keep `index.ts`, `client.ts`, and `server.ts` as public entry points.
- Keep the store, routes, and validation under private `lib/` files.
- Move demo tests into the package's private `tests/` folder.
- Update callers, coverage exclusions, mutation targets, and documentation.

### Assumptions

- The package name is `todo-app`, as proposed in the architecture review.
- The demo's HTTP and browser behavior stays unchanged.
- Tests use only package entry points, as required by `src/packages/README.md`.
- The tenant service and UI controller candidates are not part of this change.

### Validation

- Baseline type check passed.
- Baseline package boundary check passed.
- Baseline linter reports the expected `src/` wide-directory finding plus unrelated existing findings.
