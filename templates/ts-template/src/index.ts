import indexHtml from "./index.html";
import { createStore } from "./store.ts";
import { CONFIG } from "../config.ts";
import { createApiHandler } from "./routes.ts";

const store = createStore();
const apiHandler = createApiHandler(store);

function startServer(port: number): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port,
    routes: {
      "/": indexHtml,
      "/api/*": async (request) => apiHandler(request),
    },
  });
}

// prettier-ignore
if (import.meta.main) console.log(`Todo app listening on http://localhost:${startServer(CONFIG.port).port}`);

export { startServer, createStore };
