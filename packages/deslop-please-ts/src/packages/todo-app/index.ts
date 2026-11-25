import indexHtml from "./index.html";
import { createApiHandler } from "./server.ts";

const apiHandler = createApiHandler();

function startServer(port: number): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port,
    routes: {
      "/": indexHtml,
      "/api/*": (request) => apiHandler(request),
    },
  });
}

export { startServer };
