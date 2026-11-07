# Packages

Copy `example/` when you add a package. Delete it when you no longer need the template.

```
src/packages/<name>/
  index.ts
  lib/impl.ts
  tests/<name>.test.ts
```

Root files are the entry points. `index.ts` is the public entry in the template. Another root file, such as `client.ts`, is public too. A package can expose several small entry points. Do not re-export a whole subtree through one `index.ts`. That barrel makes every internal file part of the interface.

`lib/` holds the implementation. `tests/` holds the tests. Any other subfolder is private too. The boundary rules are enforced by convention (and code review), not by a tool.

## Entry-point boundary

Code outside a package imports only that package's root files. It does not import `lib/` or any other subfolder. A package's own files import each other freely.

## Tests through the entry points

A file in `<name>/tests/` imports any package's root files and its own `tests/` fixtures. It does not import a package's internals, including its own `lib/`.

## No cycles

Packages do not form a dependency cycle.

## Check

`bun run check` runs `tsc`.
