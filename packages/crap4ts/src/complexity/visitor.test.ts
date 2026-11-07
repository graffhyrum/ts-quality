import { test, expect, describe } from "bun:test";
import { analyzeComplexity } from "./analyze";

describe("complexity analysis", () => {
  test("simple function has complexity 1", () => {
    const code = `function simple() { return 1; }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result).toHaveLength(1);
    expect(result[0].complexity).toBe(1);
    expect(result[0].name).toBe("simple");
  });

  test("if statement adds 1", () => {
    const code = `function withIf(x: number) {
      if (x > 0) return x;
      return -x;
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].complexity).toBe(2);
  });

  test("nested if adds 1 each", () => {
    const code = `function nested(x: number, y: number) {
      if (x > 0) {
        if (y > 0) return x + y;
      }
      return 0;
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].complexity).toBe(3);
  });

  test("for loop adds 1", () => {
    const code = `function loop(arr: number[]) {
      for (const x of arr) console.log(x);
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].complexity).toBe(2);
  });

  test("while loop adds 1", () => {
    const code = `function loop() {
      let i = 0;
      while (i < 10) i++;
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].complexity).toBe(2);
  });

  test("do-while loop adds 1", () => {
    const code = `function loop() {
      let i = 0;
      do { i++; } while (i < 10);
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].complexity).toBe(2);
  });

  test("logical operators add 1 each", () => {
    const code = `function logic(a: boolean, b: boolean) {
      return a && b || !a;
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].complexity).toBe(3);
  });

  test("nullish coalescing adds 1", () => {
    const code = `function nullish(a: string | null) {
      return a ?? "default";
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].complexity).toBe(2);
  });

  test("ternary adds 1", () => {
    const code = `function ternary(x: number) {
      return x > 0 ? x : -x;
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].complexity).toBe(2);
  });

  test("switch/case adds 1 per case (not default)", () => {
    const code = `function sw(x: string) {
      switch (x) {
        case "a": return 1;
        case "b": return 2;
        default: return 0;
      }
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].complexity).toBe(3);
  });

  test("catch clause adds 1", () => {
    const code = `function tryCatch() {
      try { JSON.parse("x"); } catch (e) { console.error(e); }
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].complexity).toBe(2);
  });

  test("logical assignment operators add 1", () => {
    const code = `function logicalAssign(a: number, b: number) {
      a &&= b;
      return a;
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].complexity).toBe(2);
  });

  test("nested function counted separately", () => {
    const code = `function outer(x: number) {
      if (x > 0) {
        const inner = (y: number) => {
          if (y > 10) return y * 2;
          return y;
        };
        return inner(x);
      }
      return 0;
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result).toHaveLength(2);
    const outer = result.find((f) => f.name === "outer");
    const inner = result.find((f) => f.name === "inner");
    expect(outer?.complexity).toBe(2);
    expect(inner?.complexity).toBe(2);
  });

  test("arrow function derives name from variable", () => {
    const code = `const greet = (name: string) => "hello " + name;`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].name).toBe("greet");
  });

  test("anonymous function gets file:line name", () => {
    const code = `export default function(x: number) { return x; }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].name).toContain("<anonymous>");
  });

  test("method declaration", () => {
    const code = `class Foo {
      bar(x: number) {
        if (x > 0) return x;
        return 0;
      }
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].name).toBe("bar");
    expect(result[0].complexity).toBe(2);
  });

  test("getter and setter", () => {
    const code = `class Foo {
      private _x = 0;
      get x() { return this._x; }
      set x(val: number) { if (val >= 0) this._x = val; }
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result).toHaveLength(2);
    const getter = result.find((f) => f.name === "x" && f.complexity === 1);
    const setter = result.find((f) => f.name === "x" && f.complexity === 2);
    expect(getter).toBeDefined();
    expect(setter).toBeDefined();
  });

  test("overloaded function (signature without body) is skipped", () => {
    const code = `function foo(x: string): string;
    function foo(x: number): number;
    function foo(x: string | number): string | number {
      if (typeof x === "string") return x.toUpperCase();
      return x * 2;
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result).toHaveLength(1);
    expect(result[0].complexity).toBe(2);
  });

  test("constructor", () => {
    const code = `class Foo {
      constructor(private x: number) {
        if (x < 0) throw new Error("negative");
      }
    }`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("constructor");
    expect(result[0].complexity).toBe(2);
  });

  test("reports startLine and endLine", () => {
    const code = `function foo() {
  return 1;
}`;
    const result = analyzeComplexity(code, "test.ts");
    expect(result[0].startLine).toBe(1);
    expect(result[0].endLine).toBe(3);
  });
});
