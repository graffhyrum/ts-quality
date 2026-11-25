import { expect, test } from "bun:test";
import { createApiHandler } from "../server.ts";

type Handler = ReturnType<typeof createApiHandler>;
type Tenant = { id: string; name: string };
type Todo = { id: string; tenantId: string; title: string; done: boolean };

function handler(): Handler {
  return createApiHandler();
}

async function createTenant(h: Handler, name: string): Promise<Tenant> {
  const res = await call(h, "POST", "/api/tenants", { name });
  expect(res.status).toBe(201);
  return (await res.json()) as Tenant;
}

async function createTodo(
  h: Handler,
  tenantId: string,
  title: string,
): Promise<Todo> {
  const res = await call(h, "POST", "/api/todos", { tenantId, title });
  expect(res.status).toBe(201);
  return (await res.json()) as Todo;
}

async function call(
  h: Handler,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return h(new Request(`http://localhost${path}`, init));
}

test("creates a tenant with a trimmed name", async () => {
  const tenant = await createTenant(handler(), "  Acme  ");
  expect(tenant.name).toBe("Acme");
});

test("rejects empty and whitespace-only tenant names", async () => {
  const h = handler();
  expect((await call(h, "POST", "/api/tenants", { name: "" })).status).toBe(
    400,
  );
  expect((await call(h, "POST", "/api/tenants", { name: "   " })).status).toBe(
    400,
  );
});

test("lists created tenants", async () => {
  const h = handler();
  await createTenant(h, "Acme");
  await createTenant(h, "Globex");
  const res = await call(h, "GET", "/api/tenants");
  const tenants = (await res.json()) as Tenant[];
  expect(tenants.map((tenant) => tenant.name)).toEqual(["Acme", "Globex"]);
});

test("creates a todo for an existing tenant", async () => {
  const h = handler();
  const tenant = await createTenant(h, "Acme");
  const todo = await createTodo(h, tenant.id, "  Buy milk  ");
  expect(todo.title).toBe("Buy milk");
  expect(todo.done).toBe(false);
});

test("rejects a todo for an unknown tenant", async () => {
  const res = await call(handler(), "POST", "/api/todos", {
    tenantId: "unknown",
    title: "x",
  });
  expect(res.status).toBe(404);
});

test("rejects empty and whitespace-only todo titles", async () => {
  const h = handler();
  const tenant = await createTenant(h, "Acme");
  expect(
    (await call(h, "POST", "/api/todos", { tenantId: tenant.id, title: "" }))
      .status,
  ).toBe(400);
  expect(
    (
      await call(h, "POST", "/api/todos", {
        tenantId: tenant.id,
        title: "   ",
      })
    ).status,
  ).toBe(400);
});

test("lists todos only for the given tenant", async () => {
  const h = handler();
  const a = await createTenant(h, "A");
  const b = await createTenant(h, "B");
  await createTodo(h, a.id, "A todo");
  await createTodo(h, a.id, "Second A todo");
  await createTodo(h, b.id, "B todo");

  const aRes = await call(h, "GET", `/api/todos?tenantId=${a.id}`);
  const aTodos = (await aRes.json()) as Todo[];
  expect(aTodos.map((todo) => todo.title)).toEqual(["A todo", "Second A todo"]);

  const bRes = await call(h, "GET", `/api/todos?tenantId=${b.id}`);
  const bTodos = (await bRes.json()) as Todo[];
  expect(bTodos.map((todo) => todo.title)).toEqual(["B todo"]);
});

test("toggles a todo done state", async () => {
  const h = handler();
  const tenant = await createTenant(h, "Acme");
  const todo = await createTodo(h, tenant.id, "Task");
  const path = `/api/todos/${todo.id}?tenantId=${tenant.id}`;

  const first = await call(h, "PATCH", path);
  expect(((await first.json()) as Todo).done).toBe(true);
  const second = await call(h, "PATCH", path);
  expect(((await second.json()) as Todo).done).toBe(false);
});

test("toggle returns 404 for an unknown todo", async () => {
  const h = handler();
  const tenant = await createTenant(h, "Acme");
  const res = await call(
    h,
    "PATCH",
    `/api/todos/unknown?tenantId=${tenant.id}`,
  );
  expect(res.status).toBe(404);
});

test("deletes a todo", async () => {
  const h = handler();
  const tenant = await createTenant(h, "Acme");
  const todo = await createTodo(h, tenant.id, "Task");
  const res = await call(
    h,
    "DELETE",
    `/api/todos/${todo.id}?tenantId=${tenant.id}`,
  );
  expect(res.status).toBe(204);

  const list = await call(h, "GET", `/api/todos?tenantId=${tenant.id}`);
  expect(await list.json()).toEqual([]);
});

test("delete returns 404 for an unknown todo", async () => {
  const h = handler();
  const tenant = await createTenant(h, "Acme");
  const res = await call(
    h,
    "DELETE",
    `/api/todos/unknown?tenantId=${tenant.id}`,
  );
  expect(res.status).toBe(404);
});

test("cross-tenant todo changes are denied", async () => {
  const h = handler();
  const a = await createTenant(h, "A");
  const b = await createTenant(h, "B");
  const todo = await createTodo(h, a.id, "secret");
  const path = `/api/todos/${todo.id}?tenantId=${b.id}`;

  expect((await call(h, "PATCH", path)).status).toBe(404);
  expect((await call(h, "DELETE", path)).status).toBe(404);
});
