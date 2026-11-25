import type { TenantId, TodoId } from "./validation.ts";

type Tenant = {
  readonly id: TenantId;
  readonly name: string;
};

type Todo = {
  readonly id: TodoId;
  readonly tenantId: TenantId;
  readonly title: string;
  readonly done: boolean;
  readonly createdAt: number;
};

export type Store = {
  readonly createTenant: (name: string) => Tenant | undefined;
  readonly listTenants: () => readonly Tenant[];
  readonly getTenant: (id: TenantId) => Tenant | undefined;
  readonly createTodo: (tenantId: TenantId, title: string) => Todo | undefined;
  readonly listTodos: (tenantId: TenantId) => readonly Todo[];
  readonly toggleTodo: (id: TodoId, tenantId: TenantId) => Todo | undefined;
  readonly deleteTodo: (id: TodoId, tenantId: TenantId) => boolean;
};

export function createStore(): Store {
  const tenants = new Map<TenantId, Tenant>();
  const todos = new Map<TodoId, Todo>();
  const tenantTodos = new Map<TenantId, Set<TodoId>>();

  return {
    createTenant: (name) => createTenantRecord(name, tenants),
    listTenants: () => [...tenants.values()],
    getTenant: (id) => tenants.get(id),
    createTodo: (tenantId, title) =>
      createTodoRecord(tenantId, title, todos, tenantTodos),
    listTodos: (tenantId) => listTodosForTenant(tenantId, todos, tenantTodos),
    toggleTodo: (id, tenantId) => toggleTodoRecord(id, tenantId, todos),
    deleteTodo: (id, tenantId) =>
      deleteTodoRecord(id, tenantId, todos, tenantTodos),
  };
}

function createTenantRecord(
  name: string,
  tenants: Map<TenantId, Tenant>,
): Tenant | undefined {
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  const tenant: Tenant = { id: newTenantId(), name: trimmed };
  tenants.set(tenant.id, tenant);
  return tenant;
}

function createTodoRecord(
  tenantId: TenantId,
  title: string,
  todos: Map<TodoId, Todo>,
  tenantTodos: Map<TenantId, Set<TodoId>>,
): Todo | undefined {
  const trimmed = title.trim();
  if (trimmed.length === 0) return undefined;
  const todo: Todo = {
    id: newTodoId(),
    tenantId,
    title: trimmed,
    done: false,
    createdAt: Date.now(),
  };
  todos.set(todo.id, todo);
  let ids = tenantTodos.get(tenantId);
  if (ids === undefined) {
    ids = new Set<TodoId>();
    tenantTodos.set(tenantId, ids);
  }
  ids.add(todo.id);
  return todo;
}

function listTodosForTenant(
  tenantId: TenantId,
  todos: Map<TodoId, Todo>,
  tenantTodos: Map<TenantId, Set<TodoId>>,
): readonly Todo[] {
  const ids = tenantTodos.get(tenantId);
  if (ids === undefined) return [];
  const result: Todo[] = [];
  for (const id of ids) {
    const todo = todos.get(id);
    if (todo !== undefined) result.push(todo);
  }
  return result;
}

function toggleTodoRecord(
  id: TodoId,
  tenantId: TenantId,
  todos: Map<TodoId, Todo>,
): Todo | undefined {
  const existing = todos.get(id);
  if (existing === undefined || existing.tenantId !== tenantId)
    return undefined;
  const updated: Todo = { ...existing, done: !existing.done };
  todos.set(id, updated);
  return updated;
}

function deleteTodoRecord(
  id: TodoId,
  tenantId: TenantId,
  todos: Map<TodoId, Todo>,
  tenantTodos: Map<TenantId, Set<TodoId>>,
): boolean {
  const existing = todos.get(id);
  if (existing === undefined || existing.tenantId !== tenantId) return false;
  todos.delete(id);
  tenantTodos.get(tenantId)?.delete(id);
  return true;
}

function newTenantId(): TenantId {
  return `tenant-${crypto.randomUUID()}` as TenantId;
}

function newTodoId(): TodoId {
  return `todo-${crypto.randomUUID()}` as TodoId;
}
