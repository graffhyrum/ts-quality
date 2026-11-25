import { expect, test } from "bun:test";
import { createStore } from "./lib/store.ts";
import type { TodoId } from "./lib/validation.ts";

test("deleteTodo returns true when the todo exists and is owned", () => {
  const store = createStore();
  const tenant = store.createTenant("Acme");
  if (tenant === undefined) throw new Error("tenant creation failed");
  const todo = store.createTodo(tenant.id, "Task");
  if (todo === undefined) throw new Error("todo creation failed");
  expect(store.deleteTodo(todo.id, tenant.id)).toBe(true);
});

test("deleteTodo returns false for an unknown todo", () => {
  const store = createStore();
  const tenant = store.createTenant("Acme");
  if (tenant === undefined) throw new Error("tenant creation failed");
  expect(store.deleteTodo("unknown" as TodoId, tenant.id)).toBe(false);
});

test("deleteTodo returns false for a wrong-tenant todo", () => {
  const store = createStore();
  const a = store.createTenant("A");
  const b = store.createTenant("B");
  if (a === undefined || b === undefined)
    throw new Error("tenant creation failed");
  const todo = store.createTodo(a.id, "secret");
  if (todo === undefined) throw new Error("todo creation failed");
  expect(store.deleteTodo(todo.id, b.id)).toBe(false);
});
