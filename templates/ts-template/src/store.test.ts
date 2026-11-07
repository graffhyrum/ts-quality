import { expect, test } from "bun:test";
import { createStore } from "./store.ts";
import type { TenantId, TodoId } from "./validation.ts";

test("creates a tenant with a trimmed name", () => {
  const store = createStore();
  const tenant = store.createTenant("  Acme  ");
  expect(tenant?.name).toBe("Acme");
});

test("rejects an empty tenant name", () => {
  const store = createStore();
  expect(store.createTenant("   ")).toBeUndefined();
});

test("lists created tenants", () => {
  const store = createStore();
  store.createTenant("Acme");
  store.createTenant("Globex");
  expect(store.listTenants()).toHaveLength(2);
});

test("gets a tenant by id", () => {
  const store = createStore();
  const tenant = store.createTenant("Acme");
  expect(store.getTenant(tenant!.id)?.name).toBe("Acme");
});

test("returns undefined for unknown tenant", () => {
  const store = createStore();
  expect(store.getTenant("nope" as TenantId)).toBeUndefined();
});

test("creates a todo for an existing tenant", () => {
  const store = createStore();
  const tenant = store.createTenant("Acme")!;
  const todo = store.createTodo(tenant.id, "Buy milk");
  expect(todo?.title).toBe("Buy milk");
  expect(todo?.done).toBe(false);
});

test("rejects todo for unknown tenant", () => {
  const store = createStore();
  expect(store.createTodo("nope" as TenantId, "x")).toBeUndefined();
});

test("rejects empty todo title", () => {
  const store = createStore();
  const tenant = store.createTenant("Acme")!;
  expect(store.createTodo(tenant.id, "   ")).toBeUndefined();
});

test("lists todos only for the given tenant", () => {
  const store = createStore();
  const a = store.createTenant("A")!;
  const b = store.createTenant("B")!;
  store.createTodo(a.id, "A todo");
  store.createTodo(b.id, "B todo");
  expect(store.listTodos(a.id)).toHaveLength(1);
  expect(store.listTodos(a.id)[0]?.title).toBe("A todo");
});

test("toggles a todo done state", () => {
  const store = createStore();
  const tenant = store.createTenant("Acme")!;
  const todo = store.createTodo(tenant.id, "Task")!;
  const toggled = store.toggleTodo(todo.id, tenant.id);
  expect(toggled?.done).toBe(true);
  expect(store.toggleTodo(todo.id, tenant.id)?.done).toBe(false);
});

test("toggle returns undefined for unknown todo", () => {
  const store = createStore();
  const tenant = store.createTenant("Acme")!;
  expect(store.toggleTodo("nope" as TodoId, tenant.id)).toBeUndefined();
});

test("deletes a todo", () => {
  const store = createStore();
  const tenant = store.createTenant("Acme")!;
  const todo = store.createTodo(tenant.id, "Task")!;
  expect(store.deleteTodo(todo.id, tenant.id)).toBe(true);
  expect(store.getTodo(todo.id)).toBeUndefined();
});

test("delete returns false for unknown todo", () => {
  const store = createStore();
  const tenant = store.createTenant("Acme")!;
  expect(store.deleteTodo("nope" as TodoId, tenant.id)).toBe(false);
});

test("todoBelongsToTenant checks ownership", () => {
  const store = createStore();
  const a = store.createTenant("A")!;
  const b = store.createTenant("B")!;
  const todo = store.createTodo(a.id, "A todo")!;
  expect(store.todoBelongsToTenant(todo.id, a.id)).toBe(true);
  expect(store.todoBelongsToTenant(todo.id, b.id)).toBe(false);
});

test("todoBelongsToTenant returns false for unknown todo", () => {
  const store = createStore();
  const a = store.createTenant("A")!;
  expect(store.todoBelongsToTenant("nope" as TodoId, a.id)).toBe(false);
});
