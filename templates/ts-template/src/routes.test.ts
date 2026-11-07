import { expect, test } from "bun:test";
import { createStore } from "./store.ts";
import { createApiHandler } from "./routes.ts";

function handler() {
  return createApiHandler(createStore());
}

async function call(
  h: (r: Request) => Promise<Response>,
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

test("GET /api/tenants returns empty list", async () => {
  const h = handler();
  const res = await call(h, "GET", "/api/tenants");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual([]);
});

test("POST /api/tenants creates tenant", async () => {
  const h = handler();
  const res = await call(h, "POST", "/api/tenants", { name: "Acme" });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { name: string };
  expect(body.name).toBe("Acme");
});

test("POST /api/tenants rejects empty name", async () => {
  const h = handler();
  const res = await call(h, "POST", "/api/tenants", { name: "" });
  expect(res.status).toBe(400);
});

test("POST /api/tenants rejects whitespace-only name", async () => {
  const h = handler();
  const res = await call(h, "POST", "/api/tenants", { name: "   " });
  expect(res.status).toBe(400);
});

test("GET /api/todos returns 404 for unknown tenant", async () => {
  const h = handler();
  const res = await call(h, "GET", "/api/todos?tenantId=unknown");
  expect(res.status).toBe(404);
});

test("GET /api/todos requires tenant", async () => {
  const h = handler();
  const res = await call(h, "GET", "/api/todos");
  expect(res.status).toBe(400);
});

test("full todo flow is tenant scoped", async () => {
  const h = handler();
  const tRes = await call(h, "POST", "/api/tenants", { name: "Acme" });
  const tenant = (await tRes.json()) as { id: string };
  const createRes = await call(h, "POST", "/api/todos", {
    tenantId: tenant.id,
    title: "Buy milk",
  });
  expect(createRes.status).toBe(201);
  const todo = (await createRes.json()) as { id: string; done: boolean };
  expect(todo.done).toBe(false);

  const listRes = await call(h, "GET", `/api/todos?tenantId=${tenant.id}`);
  const list = (await listRes.json()) as unknown[];
  expect(list).toHaveLength(1);

  const toggleRes = await call(
    h,
    "PATCH",
    `/api/todos/${todo.id}?tenantId=${tenant.id}`,
  );
  expect(toggleRes.status).toBe(200);
  const toggled = (await toggleRes.json()) as { done: boolean };
  expect(toggled.done).toBe(true);

  const delRes = await call(
    h,
    "DELETE",
    `/api/todos/${todo.id}?tenantId=${tenant.id}`,
  );
  expect(delRes.status).toBe(204);
});

test("POST /api/todos rejects invalid payload", async () => {
  const h = handler();
  const res = await call(h, "POST", "/api/todos", { tenantId: "", title: "x" });
  expect(res.status).toBe(400);
});

test("POST /api/todos rejects unknown tenant", async () => {
  const h = handler();
  const res = await call(h, "POST", "/api/todos", {
    tenantId: "unknown",
    title: "x",
  });
  expect(res.status).toBe(404);
});

test("POST /api/todos rejects whitespace title", async () => {
  const h = handler();
  const t = (await (
    await call(h, "POST", "/api/tenants", { name: "A" })
  ).json()) as { id: string };
  const res = await call(h, "POST", "/api/todos", {
    tenantId: t.id,
    title: "   ",
  });
  expect(res.status).toBe(400);
});

test("PATCH /api/todos requires tenant id", async () => {
  const h = handler();
  const t = (await (
    await call(h, "POST", "/api/tenants", { name: "A" })
  ).json()) as { id: string };
  const todo = (await (
    await call(h, "POST", "/api/todos", { tenantId: t.id, title: "x" })
  ).json()) as { id: string };
  const res = await call(h, "PATCH", `/api/todos/${todo.id}`, {});
  expect(res.status).toBe(400);
});

test("DELETE /api/todos requires tenant id", async () => {
  const h = handler();
  const t = (await (
    await call(h, "POST", "/api/tenants", { name: "A" })
  ).json()) as { id: string };
  const todo = (await (
    await call(h, "POST", "/api/todos", { tenantId: t.id, title: "x" })
  ).json()) as { id: string };
  const res = await call(h, "DELETE", `/api/todos/${todo.id}`);
  expect(res.status).toBe(400);
});

test("cross-tenant todo access is denied", async () => {
  const h = handler();
  const t1 = (await (
    await call(h, "POST", "/api/tenants", { name: "A" })
  ).json()) as {
    id: string;
  };
  const t2 = (await (
    await call(h, "POST", "/api/tenants", { name: "B" })
  ).json()) as {
    id: string;
  };
  const todo = (await (
    await call(h, "POST", "/api/todos", { tenantId: t1.id, title: "secret" })
  ).json()) as { id: string };

  const listRes = await call(h, "GET", `/api/todos?tenantId=${t2.id}`);
  const list = (await listRes.json()) as unknown[];
  expect(list).toHaveLength(0);

  const toggleRes = await call(
    h,
    "PATCH",
    `/api/todos/${todo.id}?tenantId=${t2.id}`,
  );
  expect(toggleRes.status).toBe(404);

  const delRes = await call(
    h,
    "DELETE",
    `/api/todos/${todo.id}?tenantId=${t2.id}`,
  );
  expect(delRes.status).toBe(404);
});

test("POST /api/tenants with invalid json returns 400", async () => {
  const h = handler();
  const res = await h(
    new Request("http://localhost/api/tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad",
    }),
  );
  expect(res.status).toBe(400);
});

test("unknown route returns 404", async () => {
  const h = handler();
  const res = await call(h, "GET", "/api/nope");
  expect(res.status).toBe(404);
});
