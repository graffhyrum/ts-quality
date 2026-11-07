import { expect, test } from "bun:test";
import {
  parseTenantId,
  parseTenantName,
  parseTodoId,
  parseTodoTitle,
} from "./validation.ts";

test("parseTenantName accepts non-empty", () => {
  expect(parseTenantName("Acme")).toBe("Acme");
});

test("parseTenantName rejects empty string", () => {
  expect(parseTenantName("")).toBeUndefined();
});

test("parseTenantName rejects non-string", () => {
  expect(parseTenantName(42)).toBeUndefined();
  expect(parseTenantName(null)).toBeUndefined();
});

test("parseTodoTitle accepts non-empty", () => {
  expect(parseTodoTitle("Buy milk")).toBe("Buy milk");
});

test("parseTodoTitle rejects empty", () => {
  expect(parseTodoTitle("")).toBeUndefined();
});

test("parseTenantId returns branded string for non-empty", () => {
  expect(parseTenantId("t1")).toBe("t1" as never);
});

test("parseTenantId rejects empty", () => {
  expect(parseTenantId("")).toBeUndefined();
});

test("parseTodoId returns branded string for non-empty", () => {
  expect(parseTodoId("x")).toBe("x" as never);
});

test("parseTodoId rejects empty", () => {
  expect(parseTodoId("")).toBeUndefined();
});
