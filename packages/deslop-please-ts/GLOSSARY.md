# deslop-please-ts

A linter that finds architectural sloppiness in TypeScript projects, following Ousterhout's "deep modules, narrow interfaces".

## Language

**Module**:
A source file. A directory only groups modules and is never a module.
_Avoid_: package, component

**Declaration**:
A top-level function, class, interface, type alias, enum or constant of a module. Members and nested functions belong to their enclosing declaration.
_Avoid_: item (in user-facing text), symbol

**Knows**:
Declaration A knows declaration B when code inside A refers to B, in a value position or a type position.
_Avoid_: depends on, uses

**Held in mind**:
The number of things a reader can keep in view at once. The default is 7.

**Module cycle**:
Modules that import each other in a circle. Every import form counts.

**Tangle**:
More than the held-in-mind number of declarations that all know each other in a circle and sit in at least two modules.
_Avoid_: cycle (a cycle is the module-level finding)
