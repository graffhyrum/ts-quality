# Triage patterns: moves that lower a CRAP score

Source note for `plugin/skills/crap4ts-triage/split.md` and `test.md`. Copy short rules from here. Do not copy the whole note.

## 1. How to use this note

1. `split` (complexity ≥ threshold): remove decisions from the named function. Tests cannot clear it: at 100% coverage the score equals complexity. Use section 2.
2. `test` (complexity < threshold, coverage is a number, including 0): run more lines of the named span from a test file. Do not edit the function. Use section 3.
3. `join` (coverage is null): fix the coverage path or format. A join fix does not change the function, so this note has no join patterns.
4. Do not recompute CRAP. Make one move, then run the gate again. The gate decides.
5. Examples are small. They show the move and the change in count, not a real failing function.

### What crap4ts counts

These facts come from the scorer source, not from the books. Every "why" below refers to them.

- `CRAP = C² × (1 − cov)³ + C`. A function is crappy when the score is ≥ threshold. The default threshold is 30 (`src/crap/score.ts`, `src/cli.ts`).
- C = 1 + one per `if`, `for`, `for…in`, `for…of`, `while`, `do`, `case`, `?:`, `catch`, `&&`, `||`, `??`, `&&=`, `||=`, `??=` (`src/complexity/nodes.ts`).
- Not counted: `else`, `default:`, `?.`, default parameter values, `try`, `finally`, `throw`, early `return`, object or map lookups.
- A nested function (arrow, function expression, method) is not counted in its parent. It is scored on its own (`src/complexity/visitor.ts`).
- cov = covered statements / all statements in the function span, from line-based data. Statements inside nested functions are removed from the parent before the division. The hit count does not matter; `hits > 0` is the only test (`src/mapping/match.ts`).
- If there are no statements in the span, cov is 0, not null. Null means the file is not in the coverage data at all.

Two sizing facts follow from the formula at the default threshold:

- A new helper with C ≤ 4 can never be crappy: at 0% coverage it scores at most 4² + 4 = 20.
- A helper with C = 5 at 0% coverage scores 25 + 5 = 30, which is crappy. Such a helper will return from the next triage as a `test` action.

---

## 2. Split patterns

These patterns remove decisions from the scored function. Each one edits production code, so none of them is a `test` move.

Scope note: `split.md` allows a helper in the same file outside the named function's span. Do not edit other files. A nested helper is also allowed.

Split rule for every pattern below: the move must take away at least one counted token from the named function. If the count does not drop, the move is not a split.

### S1. Extract a decision with its body ("Find Sequences")

- **Source:** Michael Feathers, *Working Effectively with Legacy Code* (2004), Ch. 22 "I Need to Change a Monster Method…", strategy sections "Find Sequences" and "Extract Small Pieces" (named techniques; TOC checked on the publisher's sample PDF, page text not opened). Robert C. Martin, "One Thing: Extract till you Drop" (Object Mentor blog, 11 Sep 2009), and *Clean Code* (2008) Ch. 3 "Functions", sections "Do One Thing" and "One Level of Abstraction per Function".
- **Serves:** split.
- **Move:** Find an `if` (or loop) together with its body that does one job. Move the condition and the body together into a new function. Leave one call in the scored function. Pass the locals the block reads as parameters; return the value it writes.
- **Why it lowers CRAP:** The `if` and every `&&`, `||`, `??`, or loop inside the block leave the scored function. Its C drops by that count. C is squared in the formula, so each removed decision matters most when coverage is low.
- **Example:**

```ts
// before: priceOrder C = 6 (for, if, &&, if, ||)
function priceOrder(order: Order): number {
  let total = 0;
  for (const line of order.lines) total += line.qty * line.unitPrice;
  if (order.coupon && order.coupon.active) total -= order.coupon.amount;
  if (order.country === "DE" || order.country === "FR") total *= 1.2;
  return total;
}

// after: priceOrder C = 1
function priceOrder(order: Order): number {
  const total = applyCoupon(subtotal(order.lines), order.coupon);
  return applyVat(total, order.country);
}
function applyCoupon(total: number, coupon: Coupon | undefined): number {
  if (coupon && coupon.active) return total - coupon.amount; // C = 3
  return total;
}
// subtotal (C = 2) and applyVat (C = 3) are built the same way.
```

- **Stop rule:** Do not extract a block that holds no counted token (for example, a log line or a plain assignment). The count stays the same. Do not move so many decisions into one helper that the helper is at or above the threshold; that only moves the failure.

### S2. Skeletonize: extract conditions and bodies, keep the control structure

- **Source:** Feathers, *WELC* Ch. 22, strategy section "Skeletonize Methods" (named technique; TOC checked, page text not opened).
- **Serves:** split.
- **Move:** Keep the `if` in the scored function. Extract its condition into a predicate. Extract its body into a second function. The scored function then shows only the control structure and calls.
- **Why it lowers CRAP:** It removes the `&&`, `||`, `??` and nested decisions inside the condition and the body. The `if` itself stays, so the drop is smaller than S1.
- **Example:**

```ts
// before: route C = 4 (if, &&, ??)
function route(req: Req): Res {
  if (req.method === "GET" && req.path.startsWith("/api")) {
    return fetchApi(req.query.id ?? "all");
  }
  return notFound();
}

// after: route C = 2 (the if stays)
function route(req: Req): Res {
  if (isApiRead(req)) return readApi(req);
  return notFound();
}
// isApiRead holds the && (C = 2). readApi holds the ?? (C = 2).
```

- **Stop rule:** If the condition is one comparison and the body holds no decision, skeletonizing removes nothing. Use S1 instead. Skeletonize is the right choice when the branch shape must stay visible in the scored function and S1 would hide too much.

### S3. Encapsulate a compound condition

- **Source:** Martin, *Clean Code* Ch. 17 "Smells and Heuristics", General heuristic "Encapsulate Conditionals" (heuristic title from the book; not visible in the public TOC, so the page was not checked).
- **Serves:** split.
- **Move:** Find an `if` whose condition joins two or more tests with `&&`, `||`, or `??`. Move the whole condition into a function with a name that says the rule. Call it from the `if`.
- **Why it lowers CRAP:** Each `&&`, `||`, `??` counts as one decision. The `if` stays (+1), but all operators leave the scored function.
- **Example:**

```ts
// before: saveDoc C = 5 (if, ||, &&, ||)
function saveDoc(user: User, doc: Doc): void {
  if (user.role === "admin" || (user.role === "owner" && !user.suspended) || user.id === doc.authorId) {
    store.put(doc);
  }
}

// after: saveDoc C = 2
function saveDoc(user: User, doc: Doc): void {
  if (canEdit(user, doc)) store.put(doc);
}
function canEdit(user: User, doc: Doc): boolean {
  return user.role === "admin" || (user.role === "owner" && !user.suspended) || user.id === doc.authorId; // C = 4
}
```

- **Stop rule:** A condition with one comparison and no operator gives nothing to remove. Do not wrap `x > 0` in `isPositive(x)` for CRAP.

### S4. Replace a switch or if-chain with a lookup table

- **Source:** Martin, *Clean Code* Ch. 3, section "Switch Statements". Martin, "The Open Closed Principle" (Clean Coder Blog, 12 May 2014), and "Solid Relevance" (Clean Coder Blog, 18 Oct 2020), where he says a poor abstraction makes `if`/`switch` statements spread through code. *Clean Architecture* (2017) Ch. 8 "OCP: The Open-Closed Principle".
- **Serves:** split.
- **Move:** When each `case` (or each `else if`) maps a key to a value or to one call, put the pairs in a `Record<Key, Value>` next to the function. The function does one lookup. When the cases hold real logic, map each key to a handler function.
- **Why it lowers CRAP:** Each `case` counts as one decision. `default:` does not count. A property lookup counts as zero. A `Record<Union, …>` type keeps compile-time exhaustiveness, which does the same job as the `never` check in the old `default`.
- **Example:**

```ts
// before: statusLabel C = 5 (4 case)
function statusLabel(s: Status): string {
  switch (s) {
    case "open": return "Open";
    case "closed": return "Closed";
    case "draft": return "Draft";
    case "archived": return "Archived";
    default: { const never: never = s; throw new Error(never); }
  }
}

// after: statusLabel C = 1
const STATUS_LABEL: Record<Status, string> = {
  open: "Open", closed: "Closed", draft: "Draft", archived: "Archived",
};
function statusLabel(s: Status): string {
  return STATUS_LABEL[s];
}
```

- **Stop rule:** Martin's book answer to a switch is polymorphism behind a factory. Do not build a class hierarchy for a triage split. A map of values or a map of functions removes the same `case` tokens with less code. Use classes only when the handlers need shared state that a function cannot hold (see S10).

### S5. Replace a loop with a pipeline

- **Source:** Martin Fowler, "Replace Loop with Pipeline", refactoring catalog, https://refactoring.com/catalog/replaceLoopWithPipeline.html (author's own catalog; not one of the required authors, cited because it owns the move). The CRAP effect comes from the crap4ts rule that nested functions are scored separately.
- **Serves:** split.
- **Move:** Replace a `for` that filters or maps into an array with `.filter`, `.map`, or `.flatMap`. The test and the transform go into arrow callbacks.
- **Why it lowers CRAP:** The loop keyword and the `if` inside it leave the scored function. The callbacks are nested functions, so crap4ts scores them on their own and removes their lines from the parent's coverage.
- **Example:**

```ts
// before: activeEmails C = 4 (for, if, &&)
function activeEmails(users: User[]): string[] {
  const out: string[] = [];
  for (const u of users) {
    if (u.active && u.email) out.push(u.email);
  }
  return out;
}

// after: activeEmails C = 1; the callback is scored on its own (C = 3)
function activeEmails(users: User[]): string[] {
  return users.flatMap((u) => (u.active && u.email ? [u.email] : []));
}
```

- **Stop rule:** A loop with `break`, `continue`, early `return`, or `await` in order does not map cleanly to a pipeline. Use S1 on the loop body instead. The callback also needs coverage. If existing tests never pass a non-empty array, the callback scores at 0%. Keep the callback at C ≤ 4.

### S6. Extract the try/catch

- **Source:** Martin, *Clean Code* Ch. 3, under "Prefer Exceptions to Returning Error Codes", sub-sections "Extract Try/Catch Blocks" and "Error Handling Is One Thing" (sub-section titles from the book; the public TOC shows only the parent section, so the page was not checked). *Clean Code* Ch. 7 "Error Handling".
- **Serves:** split.
- **Move:** Move the `try` block and its `catch` into a function whose only job is that one risky call and its error mapping. The scored function calls it and continues with the happy path. In this repo, the helper throws a typed `CrapError` subclass (see `AGENTS.md`).
- **Why it lowers CRAP:** `catch` counts as one decision, plus any `if` inside the catch. `try` and `throw` count as zero, so the helper stays small.
- **Example:**

```ts
// before: loadConfig C = 3 (catch, if)
async function loadConfig(path: string): Promise<Config> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new ConfigError(`cannot read ${path}`);
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isConfig(parsed)) throw new ConfigError("bad shape");
  return parsed;
}

// after: loadConfig C = 2, readOrThrow C = 2
async function loadConfig(path: string): Promise<Config> {
  const parsed: unknown = JSON.parse(await readOrThrow(path));
  if (!isConfig(parsed)) throw new ConfigError("bad shape");
  return parsed;
}
async function readOrThrow(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); }
  catch { throw new ConfigError(`cannot read ${path}`); }
}
```

- **Stop rule:** Do not remove a `catch` by letting the error escape when a caller depends on the mapped error type. That is a behavior change, not a split.

### S7. Define the special case out of existence

- **Source:** John Ousterhout, *A Philosophy of Software Design* (2018; 2nd ed. 2021), Ch. 10 "Define Errors Out Of Existence", sections "Design special cases out of existence" and "Example: Java substring method" (chapter and section names checked in a library TOC scan; book text not opened). Pocock cites this book for deep modules (see S8), not for this chapter.
- **Serves:** split.
- **Move:** Look for guard `if`s that handle edge values (negative index, empty input, out-of-range end). Check if a built-in already gives the right result for those values (`slice` clamps its bounds; `Math.max` and `Math.min` bound a number). If yes, delete the guards and let the general path handle them.
- **Why it lowers CRAP:** Each deleted guard is one `if` fewer. No new function is created, so no new score appears.
- **Example:**

```ts
// before: page C = 4 (3 if)
function page<T>(items: T[], start: number, size: number): T[] {
  if (start < 0) start = 0;
  if (start >= items.length) return [];
  if (start + size > items.length) return items.slice(start);
  return items.slice(start, start + size);
}

// after: page C = 1 (slice already clamps both ends and returns [] past the end)
function page<T>(items: T[], start: number, size: number): T[] {
  const from = Math.max(0, start);
  return items.slice(from, from + size);
}
```

- **Stop rule:** Use it only when the new code gives the same result for every input the old guards handled. Check each deleted guard by hand. If a caller expects an error for a bad input, keep the guard.

### S8. Hide a decision behind a small interface (deep-module extraction)

- **Source:** Matt Pocock, "How To Make Codebases AI Agents Love", AI Hero, https://www.aihero.dev/how-to-make-codebases-ai-agents-love. He defines deep modules as a lot of implementation behind a simple interface, and he credits the idea to Ousterhout's book. John Ousterhout, *A Philosophy of Software Design*, Ch. 4 "Modules Should Be Deep" (sections "Deep modules", "Shallow modules", "Classitis") and Ch. 8 "Pull Complexity Downwards". Martin, "The Single Responsibility Principle" (Clean Coder Blog, 8 May 2014), which quotes Parnas: each module hides a design decision.
- **Serves:** split.
- **Move:** When several decisions answer one question (which format? which runner? which rate?), move all of them into one function with a narrow signature. The scored function asks the question once and uses the answer. Pick the question so that the caller does not need to know any of the cases.
- **Why it lowers CRAP:** All decisions that answer the question leave the scored function in one edit. A deep module helps CRAP **only because the decision moves**. The interface alone removes nothing.
- **Example:**

```ts
// before: loadCoverage C = 6 (3 if, ||, &&)
function loadCoverage(path: string, text: string): FileCoverage[] {
  if (path.endsWith(".info") || text.startsWith("TN:")) return parseLcov(text);
  if (text.includes('"statementMap"')) return parseIstanbul(text);
  if (text.includes('"functions"') && text.includes('"ranges"')) return parseV8(text);
  throw new CoverageFormatError(path);
}

// after: loadCoverage C = 1
function loadCoverage(path: string, text: string): FileCoverage[] {
  return parserFor(path, text)(text);
}
// parserFor(path, text): Parser holds the same 5 decisions and the throw (C = 6).
// The shallow alternative, isLcov/isIstanbul/isV8 predicates, leaves 3 if in the caller (C = 4).
```

- **Stop rule:** The deep helper takes all the decisions with it. `parserFor` at C = 6 and 0% coverage scores 42, so the next triage will name it as a `test` action. That is the intended next step: Pocock's point is that tests lock the module at its interface. Do not make the helper so deep that it reaches the threshold. Then it becomes a new `split` action, and nothing is gained.

### S9. Sprout Method (and Sprout Class)

- **Source:** Feathers, *WELC* Ch. 6 "I Don't Have Much Time and I Have to Change It", sections "Sprout Method" (p. 59) and "Sprout Class" (p. 63) (named techniques; TOC with page numbers checked on the publisher's sample PDF, page text not opened).
- **Serves:** split. It edits production code, so it is never a `test` move.
- **Move:** Use it when the gate fails because of a change you are making, and that change adds a branch to an existing function. Write the new logic in a new function. Put only one call to it in the old function. Use Sprout Class only when the new logic needs state or dependencies that a plain function cannot receive as parameters.
- **Why it lowers CRAP:** It does not lower the old count. It stops the count from going up: the new decisions go to the new function, which starts small and can be tested alone.
- **Example:**

```ts
// planned inline edit would add if + && to shippingCost (+2)
function shippingCost(o: Order): number {
  let cost = baseRate(o.weight);
  if (o.member && o.total > 50) cost = 0;
  return cost;
}

// sprouted: shippingCost C = 1, applyMemberDiscount C = 3
function shippingCost(o: Order): number {
  return applyMemberDiscount(o, baseRate(o.weight));
}
function applyMemberDiscount(o: Order, cost: number): number {
  return o.member && o.total > 50 ? 0 : cost;
}
```

- **Stop rule:** For a function that is already over the threshold with no new change pending, sprout has nothing to sprout. Use S1 to S8. Feathers writes the sprouted function test-first. `split.md` forbids edits to other files, so that test belongs to a later `test` action.

### S10. Break Out Method Object (closure first)

- **Source:** Feathers, *WELC* Ch. 22, manual refactoring section with "Break Out Method Object" (p. 304), and Ch. 25 "Dependency-Breaking Techniques", "Break Out Method Object" (p. 330) (named technique; TOC and index checked on the publisher's sample PDF, page text not opened). The closure form is this note's TypeScript mapping. It works because crap4ts scores nested functions separately.
- **Serves:** split.
- **Move:** Use it when S1 would need many parameters because the blocks share several mutable locals. In TypeScript, first keep the locals in the scored function and extract nested arrow functions that close over them. Move to a class with a `run()` method only if the nested helpers also need to be called from outside.
- **Why it lowers CRAP:** Nested functions are not counted in the parent, and their lines are removed from the parent's coverage. The edit also stays inside the function's span, which fits the `split.md` scope rule.
- **Example:**

```ts
// before: summarize C = 5 (for, if, if, ?:)
function summarize(rows: Row[]): Summary {
  let sum = 0, max = -Infinity, bad = 0;
  for (const r of rows) {
    if (!Number.isFinite(r.v)) { bad++; continue; }
    sum += r.v;
    if (r.v > max) max = r.v;
  }
  const good = rows.length - bad;
  return { mean: good > 0 ? sum / good : 0, max, bad };
}

// after: summarize C = 3 (for, ?:); take C = 3, scored on its own
function summarize(rows: Row[]): Summary {
  let sum = 0, max = -Infinity, bad = 0;
  const take = (v: number): void => {
    if (!Number.isFinite(v)) { bad++; return; }
    sum += v;
    if (v > max) max = v;
  };
  for (const r of rows) take(r.v);
  const good = rows.length - bad;
  return { mean: good > 0 ? sum / good : 0, max, bad };
}
```

- **Stop rule:** Do not start with a class. A class adds a constructor, fields, and a new name, and it removes no more decisions than the closure does. If the blocks share no locals, S1 is simpler.

### S11. Count-only rewrite: `&&` guard chain to optional chaining

- **Source:** crap4ts scorer, `src/complexity/nodes.ts`: `&&` is counted and `?.` is not. No author source; this is a fact about the tool.
- **Serves:** split.
- **Move:** Replace a guard chain `a && a.b && a.b.c` with `a?.b?.c` when every guarded value is an object, `null`, or `undefined`.
- **Why it lowers CRAP:** Each `&&` removed is one decision fewer. The runtime still has the same number of paths. Only the count changes.
- **Example:**

```ts
// before: cityOf C = 3 (&&, &&)
function cityOf(u: User | undefined): string | undefined {
  return u && u.address && u.address.city;
}

// after: cityOf C = 1
function cityOf(u: User | undefined): string | undefined {
  return u?.address?.city;
}
```

- **Stop rule:** If a guarded value can be `0`, `""`, or `false`, the two forms return different values. Do not use it then. Do not rewrite `x ?? d` to a default parameter: a default applies only to `undefined`, while `??` also catches `null`. Use this move only where optional chaining is also the normal style. It must not be the main split move for a function far over the threshold.

---

## 3. Test patterns

These patterns run more lines of the named span from a test file. None of them edits the scored function. A Feathers technique that needs a production edit is not in this section; see the table at the end of it.

Coverage need grows with C. At the default threshold, one covered line clears C = 5, but a C = 20 function needs about 71% of its lines covered. Values for the reference-file author (the agent reruns the gate and does not use this table):

| C | coverage needed to score below 30 |
|---|---|
| 5 | above 0% |
| 10 | above ~42% |
| 15 | above ~60% |
| 20 | above ~71% |
| 25 | above 80% |
| 29 | above ~89% |

### T1. Characterization test

- **Source:** Feathers, *WELC* Ch. 13 "I Need to Make a Change, but I Don't Know What Tests to Write", sections "Characterization Tests" (p. 186) and "A Heuristic for Writing Characterization Tests" (p. 195) (named technique; TOC checked, page text not opened). The steps below are summarized from the book's method as restated in Alberto Savoia, "Working Effectively With Characterization Tests" (Artima, 9 Mar 2007). Savoia is secondary here; he credits Feathers for the term.
- **Serves:** test.
- **Move:** Call the named function from a test with a plausible input. Write an assertion you expect to fail. Run it, read the actual value, and put that value in the assertion. Repeat with inputs that enter other branches. The test records what the code does now, not what it should do.
- **Why it lowers CRAP:** Each call runs lines of the span. cov goes up and C stays the same. You do not need to know the correct behavior to raise coverage.
- **Example:**

```ts
// src/tier.ts (unchanged): tierFor C = 6, 0% covered -> scores 42
export function tierFor(points: number, vip: boolean): Tier {
  if (vip && points > 0) return "gold";
  if (points >= 5000) return "gold";
  if (points >= 500) return "silver";
  return points < 0 ? "void" : "basic";
}

// src/tier.test.ts: expected values copied from the first failing run
test("tierFor: current behavior", () => {
  expect(tierFor(10, true)).toBe("gold");
  expect(tierFor(600, false)).toBe("silver");
  expect(tierFor(-1, false)).toBe("void");
});
```

- **Stop rule:** If the value you observe looks like a bug, record it in the test anyway. Report it to the user. Do not fix the function under a `test` action. A second call that runs only lines that are already covered adds nothing (the hit count does not matter).

### T2. Targeted test for the uncovered branch

- **Source:** Feathers, *WELC* Ch. 13, section "Targeted Testing" (p. 190) (named technique; TOC checked, page text not opened).
- **Serves:** test.
- **Move:** Read the lines from `action.startLine` to `action.endLine`. Find the condition that guards the lines that no test runs. Choose an input that makes that condition true. Write one test with that input.
- **Why it lowers CRAP:** Covered lines already count. Only lines that no test runs now can raise cov. This picks them on purpose.
- **Example:**

```ts
// src/retry.ts (unchanged): the cap branch is never run
export function backoff(attempt: number, capMs = 30_000): number {
  if (attempt <= 0) return 0;
  const ms = 100 * 2 ** attempt;
  if (ms > capMs) return capMs;
  return ms;
}

// src/retry.test.ts: 100 * 2^20 > 30_000, so the cap line runs
test("backoff caps at capMs", () => {
  expect(backoff(20)).toBe(30_000);
});
```

- **Stop rule:** If no input from outside can reach the guarded lines (dead code, or the guard reads a value that the function makes itself and never changes), a test cannot cover them. Stop and report. Do not edit the function to make the branch reachable.

### T3. Use an existing object seam (parameter or default parameter)

- **Source:** Feathers, "Testing Effectively With Legacy Code", excerpt of *WELC* Ch. 4 "The Seam Model", InformIT, 21 Jan 2005, https://www.informit.com/articles/article.aspx?p=359417 (publisher-hosted chapter). He defines a seam as a place where behavior can change without an edit at that place, and he prefers object seams to link and preprocessing seams. Repo standard: `AGENTS.md` and `makeFs()` in `src/detect/runners/bun.test.ts`.
- **Serves:** test.
- **Move:** Check whether the named function already takes its dependency as a parameter, often with a default such as `fs: FileSystem = bunFileSystem`. If yes, pass a fake from the test. The test call is the enabling point. The function code does not change.
- **Why it lowers CRAP:** The fake lets the test reach branches that depend on I/O results (file present, file missing, bad text). Those lines become covered.
- **Example:**

```ts
// src/detect/runner.ts (unchanged)
export async function detectRunner(root: string, fs: FileSystem = bunFileSystem): Promise<string | null> {
  if (await fs.exists(`${root}/bunfig.toml`)) return "bun";
  if (await fs.exists(`${root}/vitest.config.ts`)) return "vitest";
  return null;
}

// src/detect/runner.test.ts
const makeFs = (files: string[]): FileSystem => ({
  exists: async (p) => files.includes(p),
  readText: async () => null,
});
test("detects vitest", async () => {
  expect(await detectRunner("/r", makeFs(["/r/vitest.config.ts"]))).toBe("vitest");
});
```

- **Stop rule:** If the function has no such parameter, adding one is Feathers' "Parameterize Method" (Ch. 25, p. 383). That is a production edit, so it is not a `test` move. Try T4 or T5.

### T4. Use a module (link) seam

- **Source:** Feathers, *WELC* Ch. 4, "Seam Types": link seams, and his advice to keep them for cases with no better option (InformIT excerpt above). Bun docs, "Mocks", section "Module Mocks with mock.module()", https://bun.sh/docs/test/mocks. The JS-module-as-link-seam mapping is this note's own.
- **Serves:** test.
- **Move:** When the named function calls an imported function that blocks the branch (clock, network, file system) and has no parameter seam, replace that import in the test with `mock.module()`. Bun updates live bindings even after the module is imported. Then call the named function.
- **Why it lowers CRAP:** The real function body runs with a controlled input. The branch that depends on the mocked value becomes covered.
- **Example:**

```ts
// src/stamp.ts (unchanged)
import { now } from "./clock";
export function stampFor(id: string): string {
  return now().getUTCHours() < 12 ? `${id}-am` : `${id}-pm`;
}

// src/stamp.test.ts
import { expect, mock, test } from "bun:test";
import { stampFor } from "./stamp";

test("stampFor afternoon", () => {
  mock.module("./clock", () => ({ now: () => new Date("2026-01-01T15:00:00Z") }));
  expect(stampFor("a")).toBe("a-pm");
});
```

- **Stop rule:** Never mock the module that holds the named function. Its real lines then never run, and cov stays 0. Bun docs say `mock.restore()` does not reset `mock.module()`, so the mock can leak into other tests in the same run. Prefer T3 when a parameter seam exists.

### T5. Reach the function through its caller (interception point)

- **Source:** Feathers, *WELC* Ch. 12 "I Need to Make Many Changes in One Area…", sections "Interception Points" (p. 174) and "Judging Design with Pinch Points" (p. 182) (named techniques; TOC checked, page text not opened). The nested-callback detail comes from `src/mapping/match.ts`.
- **Serves:** test.
- **Move:** If the named function is not exported, or it is an arrow callback inside another function, do not export it. Call the nearest exported function whose path runs through the span. Choose inputs that make the caller actually call it: a non-empty array for a `.map` callback, a matching key for a handler table.
- **Why it lowers CRAP:** Coverage is per line, not per test target. Any test that runs the span's lines raises its cov, even if the test calls a different function.
- **Example:**

```ts
// src/report.ts (unchanged): formatRow is the named function, not exported
export function renderReport(rows: Row[]): string {
  return rows.map(formatRow).join("\n");
}
function formatRow(r: Row): string {
  if (r.score >= 30) return `! ${r.name} ${r.score}`;
  return `  ${r.name} ${r.score}`;
}

// src/report.test.ts: one row, so formatRow runs
test("renderReport flags a crappy row", () => {
  expect(renderReport([{ name: "f", score: 42 }])).toBe("! f 42");
});
```

- **Stop rule:** `renderReport([])` covers `renderReport` and runs no line of `formatRow`. Check that the input goes into the span. Making the function public only for a test is Feathers' hidden-method case (Ch. 10, p. 138) and is a production edit, so it is not a `test` move.

### Feathers techniques and the triage action they belong to

| Technique (WELC chapter) | Edits production code? | Action |
|---|---|---|
| Characterization Tests, Targeted Testing (Ch. 13) | No | test |
| Existing object seam, link seam (Ch. 4) | No, if the seam already exists | test |
| Interception Points, Pinch Points (Ch. 12) | No | test |
| Sprout Method, Sprout Class (Ch. 6) | Yes | split (S9) |
| Find Sequences, Skeletonize, Extract Small Pieces (Ch. 22) | Yes | split (S1, S2) |
| Break Out Method Object (Ch. 22, 25) | Yes | split (S10) |
| Wrap Method, Wrap Class (Ch. 6) | Yes | neither on its own (N3) |
| Parameterize Method, Extract and Override Call, Subclass and Override Method (Ch. 25) | Yes | not test; adds a seam, removes no decision (N2) |

---

## 4. Moves that look helpful and do not lower CRAP

### N1. Design a deep interface without moving a branch

- **Source:** Pocock and Ousterhout, as in S8. Ousterhout Ch. 7 "Different Layer, Different Abstraction", section "Pass-through methods".
- **Why no change:** A new module, type, or facade in front of the function changes no count in the function. If the `if`s stay in the named function, C stays the same. A new pass-through wrapper adds a function with C = 1 and changes nothing else.
- **Do instead:** S8. Move the decisions behind the interface in the same edit.

### N2. Add a seam or an interface to the function

- **Source:** Feathers, *WELC* Ch. 25 (Parameterize Method, Extract and Override Call, Extract Interface). Martin, *Clean Architecture* Ch. 11 "DIP".
- **Why no change:** These moves make the function easier to test later. They remove no decision, so C stays the same under `split`. Under `test` they are production edits, which `test.md` forbids.
- **Do instead:** Under `split`, pick S1 to S10. Under `test`, use an existing seam (T3, T4) or a caller (T5).

### N3. Wrap Method on the existing body

- **Source:** Feathers, *WELC* Ch. 6, "Wrap Method" (p. 67), "Wrap Class" (p. 71).
- **Why no change:** Wrap renames the old body and adds a new function with the old name that calls it. The decisions move to the renamed function, so its score equals the old score. The gate then names the renamed function.
- **Example:**

```ts
// the old body, C = 12, now named payInner, still scores the same
function pay(e: Employee): Money { logPayment(e); return payInner(e); } // C = 1
```

- **Do instead:** Use Wrap only to keep a new concern out of a function (like S9). It does not fix existing complexity.

### N4. Rename, comment, reformat, or split lines

- **Source:** Martin, *Clean Code* Ch. 2 "Meaningful Names", Ch. 4 "Comments", Ch. 5 "Formatting". These give real value for readers; they have zero effect on the score.
- **Why no change:** C comes from AST node kinds, not names or lines. cov is a ratio of covered to total statements, and a line split does not change which statements run. A rename can make the tool name a new function with the same score.

### N5. Extract a helper that takes no decision

- **Source:** Ousterhout Ch. 4, "Shallow modules" and "Classitis". Critics of "Extract till you drop" make the same point for readability.
- **Why no change:** If the extracted block holds no `if`, loop, `case`, `?:`, `catch`, `&&`, `||`, or `??`, the parent's C is the same. It only adds one more function.
- **Example:**

```ts
// C of report stays 7: formatDate held no decision
const formatDate = (d: Date): string => d.toISOString().slice(0, 10);
```

### N6. Tests that do not run the named span

- **Source:** crap4ts, `src/mapping/match.ts`.
- **Why no change:** Only statements inside the span with `hits > 0` count. These do not change cov:
  - A second test that runs lines that are already covered. The hit count does not matter.
  - A test for a different function in the same file.
  - A test that imports the module and never calls the function.
  - A caller test whose input skips the span (T5 stop rule).
  - A test that mocks the module that holds the function (T4 stop rule).

### N7. More tests when complexity is at or above the threshold

- **Source:** the formula. At cov = 1, `C² × 0 + C = C`.
- **Why no change:** The score cannot go below C. If C ≥ threshold, no test clears the function. That is why triage names `split` for it.

### N8. Ignore pragmas, excludes, and threshold changes

- **Source:** `plugin/skills/crap4ts-triage/SKILL.md` step 8 forbids new thresholds and `--exclude`.
- **Why it is out:** Coverage-ignore comments (for example `/* istanbul ignore next */` or `/* c8 ignore */`) may or may not change what the coverage file records. This note did not test them. They hide the function from the gate and do not reduce risk. Treat them like `--exclude`: do not use them.

### N9. Edit the function under a `test` action

- **Source:** `test.md` and `SKILL.md` step 5.
- **Why it is out:** It can change C, but the action is `test`. The agent must stay in the routed action. If a test cannot reach the span without a production edit, stop and report.

---

## 5. Sources

Verification key: **read** = I read the page. **TOC** = I checked the chapter or section name in a publisher or library table of contents, but not the page text. **named** = technique name from the book, not visible in any public TOC I could reach.

| Source | Used for | Status |
|---|---|---|
| Matt Pocock, "How To Make Codebases AI Agents Love", AI Hero, https://www.aihero.dev/how-to-make-codebases-ai-agents-love | Deep modules, seams, tests at the interface (S8, N1) | read |
| Matt Pocock, `mattpocock/skills` README, https://github.com/mattpocock/skills | Pocock quotes Ousterhout on deep modules | read (search extract) |
| John Ousterhout, *A Philosophy of Software Design* (Yaknyam Press, 2018; 2nd ed. 2021), Ch. 4, 7, 8, 10 | S7, S8, N1, N5 | TOC (library scan, dandelon.com); book not opened |
| Robert C. Martin, "The Single Responsibility Principle", Clean Coder Blog, 8 May 2014, https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html | S8 | read |
| Robert C. Martin, "The Open Closed Principle", Clean Coder Blog, 12 May 2014, https://blog.cleancoder.com/uncle-bob/2014/05/12/TheOpenClosedPrinciple.html | S4 | read |
| Robert C. Martin, "Solid Relevance", Clean Coder Blog, 18 Oct 2020, https://blog.cleancoder.com/uncle-bob/2020/10/18/Solid-Relevance.html | S4 (`if`/`switch` spread) | read |
| Robert C. Martin, "The Principles of OOD", http://butunclebob.com/ArticleS.UncleBob.PrinciplesOfOod | SOLID list | read |
| Robert C. Martin, "One Thing: Extract till you Drop", Object Mentor blog, 11 Sep 2009, http://blog.objectmentor.com/articles/category/clean-code/page/2 | S1 | read (category page; post permalink not checked) |
| Robert C. Martin, *Clean Code* (Prentice Hall, 2008), Ch. 2, 3, 4, 5, 7 | S1, S4, S6, N4 | TOC (InformIT) |
| *Clean Code* Ch. 3 sub-sections "Extract Try/Catch Blocks", "Error Handling Is One Thing"; Ch. 17 heuristic "Encapsulate Conditionals" | S3, S6 | named; not checked |
| Robert C. Martin, *Clean Architecture* (Prentice Hall, 2017), Ch. 8 OCP, Ch. 11 DIP | S4, N2 | TOC (InformIT) |
| Michael Feathers, *Working Effectively with Legacy Code* (Prentice Hall, 2004), Ch. 6, 10, 12, 13, 22, 25 | All T patterns; S1, S2, S9, S10; N2, N3 | TOC and index with page numbers (publisher sample PDF, https://ptgmedia.pearsoncmg.com/images/9780131177055/samplepages/0131177052.pdf; chapter list on InformIT) |
| Michael Feathers, "Testing Effectively With Legacy Code" (WELC Ch. 4 excerpt), InformIT, 21 Jan 2005, https://www.informit.com/articles/article.aspx?p=359417 | Seam definition, seam types, object seams preferred (T3, T4) | read (search extract of the publisher page) |
| Alberto Savoia, "Working Effectively With Characterization Tests", Artima, 9 Mar 2007, https://www.artima.com/weblogs/viewpost.jsp?thread=198296 | Steps of the characterization method (T1) | read; **secondary** for Feathers' steps, used because the book page was not opened |
| Alberto Savoia, "Pardon My French, But This Code Is C.R.A.P. (2)", Artima, 19 Jul 2007, https://www.artima.com/weblogs/viewpost.jsp?thread=210575 | Origin of the CRAP formula (Savoia and Bob Evans) | read (search extract) |
| Martin Fowler, "Replace Loop with Pipeline", https://refactoring.com/catalog/replaceLoopWithPipeline.html | S5 | read |
| Bun docs, "Mocks", https://bun.sh/docs/test/mocks | T4 (`mock.module`, live bindings, restore does not reset) | read |
| crap4ts source: `src/crap/score.ts`, `src/complexity/nodes.ts`, `src/complexity/visitor.ts`, `src/mapping/match.ts`, `src/cli.ts` | What is counted; coverage per function; default threshold | read |

Not used: an unlicensed full-text PDF of *WELC* that search results returned. I did not cite it.
