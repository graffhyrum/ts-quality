import { type } from "arktype";

const NonEmptyString = type("string>0");

export type TenantId = string & { readonly __brand: "TenantId" };
export type TodoId = string & { readonly __brand: "TodoId" };

export const parseTenantName = (value: unknown): string | undefined =>
  parseNonEmptyString(value);

export const parseTodoTitle = (value: unknown): string | undefined =>
  parseNonEmptyString(value);

export const parseTenantId = (value: unknown): TenantId | undefined => {
  const parsed = parseNonEmptyString(value);
  if (parsed === undefined) return undefined;
  return parsed as TenantId;
};

export const parseTodoId = (value: unknown): TodoId | undefined => {
  const parsed = parseNonEmptyString(value);
  if (parsed === undefined) return undefined;
  return parsed as TodoId;
};

function parseNonEmptyString(value: unknown): string | undefined {
  const result = NonEmptyString(value);
  if (result instanceof type.errors) return undefined;
  return result;
}
