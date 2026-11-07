import type { Store } from "./store.ts";
import type { TodoId } from "./validation.ts";
import {
  parseTenantId,
  parseTenantName,
  parseTodoId,
  parseTodoTitle,
} from "./validation.ts";

export type RouteResult = {
  readonly status: number;
  readonly body: unknown;
};

export function createApiHandler(
  store: Store,
): (request: Request) => Promise<Response> {
  return async (request: Request) => handleRequest(store, request);
}

async function handleRequest(
  store: Store,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/tenants" && method === "GET") {
    return jsonResponse(200, store.listTenants());
  }
  if (path === "/api/tenants" && method === "POST") {
    return handleCreateTenant(store, request);
  }
  if (path === "/api/todos" && method === "GET") {
    return handleListTodos(store, url);
  }
  if (path === "/api/todos" && method === "POST") {
    return handleCreateTodo(store, request);
  }
  const todoMatch = path.match(/^\/api\/todos\/([^/]+)$/);
  if (todoMatch !== null) {
    const id = parseTodoId(todoMatch[1]) as TodoId;
    if (method === "PATCH") return handleToggleTodo(store, id, url);
    if (method === "DELETE") return handleDeleteTodo(store, id, url);
  }
  return jsonResponse(404, { error: "not found" });
}

async function handleCreateTenant(
  store: Store,
  request: Request,
): Promise<Response> {
  const body = await readJson(request);
  const name = parseTenantName(body?.name);
  if (name === undefined)
    return jsonResponse(400, { error: "invalid tenant name" });
  const tenant = store.createTenant(name);
  if (tenant === undefined)
    return jsonResponse(400, { error: "could not create tenant" });
  return jsonResponse(201, tenant);
}

async function handleListTodos(store: Store, url: URL): Promise<Response> {
  const tenantId = parseTenantId(url.searchParams.get("tenantId"));
  if (tenantId === undefined)
    return jsonResponse(400, { error: "invalid tenant id" });
  if (store.getTenant(tenantId) === undefined) {
    return jsonResponse(404, { error: "tenant not found" });
  }
  return jsonResponse(200, store.listTodos(tenantId));
}

async function handleCreateTodo(
  store: Store,
  request: Request,
): Promise<Response> {
  const body = await readJson(request);
  const tenantId = parseTenantId(body?.tenantId);
  const title = parseTodoTitle(body?.title);
  if (tenantId === undefined || title === undefined) {
    return jsonResponse(400, { error: "invalid todo payload" });
  }
  if (store.getTenant(tenantId) === undefined) {
    return jsonResponse(404, { error: "tenant not found" });
  }
  const todo = store.createTodo(tenantId, title);
  if (todo === undefined)
    return jsonResponse(400, { error: "could not create todo" });
  return jsonResponse(201, todo);
}

async function handleToggleTodo(
  store: Store,
  id: TodoId,
  url: URL,
): Promise<Response> {
  const tenantId = parseTenantId(url.searchParams.get("tenantId"));
  if (tenantId === undefined)
    return jsonResponse(400, { error: "invalid tenant id" });
  if (!store.todoBelongsToTenant(id, tenantId)) {
    return jsonResponse(404, { error: "todo not found" });
  }
  const todo = store.toggleTodo(id, tenantId);
  if (todo === undefined) return jsonResponse(404, { error: "todo not found" });
  return jsonResponse(200, todo);
}

async function handleDeleteTodo(
  store: Store,
  id: TodoId,
  url: URL,
): Promise<Response> {
  const tenantId = parseTenantId(url.searchParams.get("tenantId"));
  if (tenantId === undefined)
    return jsonResponse(400, { error: "invalid tenant id" });
  if (!store.todoBelongsToTenant(id, tenantId)) {
    return jsonResponse(404, { error: "todo not found" });
  }
  const deleted = store.deleteTodo(id, tenantId);
  if (!deleted) return jsonResponse(404, { error: "todo not found" });
  return new Response(null, { status: 204 });
}

async function readJson(
  request: Request,
): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
