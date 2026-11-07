# crap4ts Agent Instructions

## Error Propagation

**CLI tools: throw typed errors in library code, catch only at entry point.**
All library functions throw `CrapError` (or subclasses). `process.exit` is only called in `src/index.ts`. This was the unanimous #1 finding across three independent expert reviews of this codebase.

## Dependency Injection

**Existing `FileSystem` interface is the standard seam for I/O.**
`src/detect/types.ts` exports `FileSystem` with `exists()`, `readText()`, and `realPath()`. Any new module that reads files must accept `fs: FileSystem = bunFileSystem` as a parameter. This enables unit tests with zero real I/O and zero temp files — use the `makeFs()` factory pattern from `src/detect/runners/bun.test.ts`.

## Adding Required Fields to `Config`

Before adding a required field to `src/types.ts::Config`, run:
```bash
grep -r 'coveragePath:\|files:\|include:\|skipGitignore:' src/**/*.test.ts
```
Any match means a test constructs a `Config` literal directly and will fail tsc. Update those fixtures first.

Packages are deep modules: see [src/packages/README.md](./src/packages/README.md) before adding or importing one.
