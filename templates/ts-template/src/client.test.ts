import { expect, test } from "bun:test";
import { renderTenantOptions, renderTodos } from "./client.ts";

test("renderTenantOptions produces options", () => {
  const html = renderTenantOptions([{ id: "t1", name: "Acme" }]);
  expect(html).toContain('<option value="t1">Acme</option>');
});

test("renderTenantOptions escapes html", () => {
  const html = renderTenantOptions([{ id: "t1", name: "<b>x</b>" }]);
  expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
});

test("renderTodos produces checkboxes", () => {
  const html = renderTodos([
    { id: "a", tenantId: "t", title: "Buy", done: false },
  ]);
  expect(html).toContain('data-id="a"');
  expect(html).toContain("Buy");
});

test("renderTodos marks done", () => {
  const html = renderTodos([
    { id: "a", tenantId: "t", title: "Buy", done: true },
  ]);
  expect(html).toContain("checked");
  expect(html).toContain('class="done"');
});

test("renderTodos empty returns empty", () => {
  expect(renderTodos([])).toBe("");
});
