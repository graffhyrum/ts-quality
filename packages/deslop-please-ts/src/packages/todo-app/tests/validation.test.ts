import { expect, test } from "bun:test";
import { createApiHandler } from "../server.ts";

type Handler = ReturnType<typeof createApiHandler>;

function handler(): Handler {
  return createApiHandler();
}

async function createTenant(h: Handler): Promise<string> {
  const res = await call(h, "POST", "/api/tenants", { name: "Acme" });
  expect(res.status).toBe(201);
  const tenant = (await res.json()) as { id: string };
  return tenant.id;
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

test("tenant name accepts a non-empty string", async () => {
  const res = await call(handler(), "POST", "/api/tenants", { name: "Acme" });
  expect(res.status).toBe(201);
  expect(((await res.json()) as { name: string }).name).toBe("Acme");
});

test("tenant name rejects empty, whitespace, and non-string values", async () => {
  const h = handler();
  for (const name of ["", "   ", null, 42]) {
    expect((await call(h, "POST", "/api/tenants", { name })).status).toBe(400);
  }
});

test("invalid tenant JSON returns 400", async () => {
  const res = await handler()(
    new Request("http://localhost/api/tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad",
    }),
  );
  expect(res.status).toBe(400);
});

test("todo title accepts a non-empty string", async () => {
  const h = handler();
  const tenantId = await createTenant(h);
  const res = await call(h, "POST", "/api/todos", {
    tenantId,
    title: "Buy milk",
  });
  expect(res.status).toBe(201);
});

test("todo title rejects empty, whitespace, and non-string values", async () => {
  const h = handler();
  const tenantId = await createTenant(h);
  for (const title of ["", "   ", null, 42]) {
    expect(
      (await call(h, "POST", "/api/todos", { tenantId, title })).status,
    ).toBe(400);
  }
});

test("tenant id is required and must not be empty", async () => {
  const h = handler();
  expect((await call(h, "GET", "/api/todos")).status).toBe(400);
  expect((await call(h, "GET", "/api/todos?tenantId=")).status).toBe(400);
});

test("unknown but non-empty tenant id returns 404", async () => {
  const res = await call(handler(), "GET", "/api/todos?tenantId=unknown");
  expect(res.status).toBe(404);
});

test("non-empty todo id reaches the store and returns 404 when unknown", async () => {
  const h = handler();
  const tenantId = await createTenant(h);
  const res = await call(h, "PATCH", `/api/todos/unknown?tenantId=${tenantId}`);
  expect(res.status).toBe(404);
});
