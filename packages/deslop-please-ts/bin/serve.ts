#!/usr/bin/env bun
// Sample-app process entry. Kept out of src/ so the coverage gate only holds
// the code it can actually exercise: stdio and process wiring are not testable
// in-process, and index.test.ts already runs this file to prove it starts.
import { CONFIG } from "../config.ts";
import { startServer } from "../src/packages/todo-app/index.ts";

console.log(
  `Todo app listening on http://localhost:${startServer(CONFIG.port).port}`,
);
