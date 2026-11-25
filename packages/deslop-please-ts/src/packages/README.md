# Packages

Each directory here is a **deep module**: a lot of behaviour behind a small interface. Implementation is hidden in subfolders; the public surface is the package's **entry points** (the files at the package root).

## Layout

```
src/packages/<name>/
  index.ts        ← an entry point (public). Import this from outside.
  client.ts       ← another entry point. A package may expose several.
  lib/            ← implementation: hidden, free to import each other.
  tests/          ← co-located tests + fixtures (a subfolder, so private).
```

## Rules

1. **Entry-point boundary**: code outside a package may import only that package's entry points (its root files), never anything in its subfolders.
2. **Intra-package freedom**: a package's own files import each other freely.
3. **Tests through the entry points**: tests may import any package's entry points and their own `tests/` fixtures, but never any package's internals, not even their own.
4. **No cycles**: no dependency cycles.

Import only through a package's entry points (its root files). Anything in any subfolder is private.

## Barrels discouraged

Because every root file is an entry point, expose several small entry points (`index.ts`, `client.ts`, `server.ts`) instead of funnelling everything through one giant `index.ts` that re-exports a whole subtree.

## Running the boundary check

```
bun run lint:boundaries
```

This runs `depcruise src/packages`. See `.dependency-cruiser.cjs` at the repo root.
