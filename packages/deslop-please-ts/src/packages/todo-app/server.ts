import { createStore } from "./lib/store.ts";
import { createRouteHandler } from "./lib/routes.ts";

export function createApiHandler(): (request: Request) => Promise<Response> {
  return createRouteHandler(createStore());
}
