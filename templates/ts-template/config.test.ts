import { expect, test } from "bun:test";
import { CONFIG } from "./config.ts";

test("config follows NODE_ENV", () => {
  const nodeEnv = process.env.NODE_ENV;
  const expected =
    nodeEnv === "production"
      ? "production"
      : nodeEnv === "test"
        ? "test"
        : "development";
  expect(CONFIG.nodeEnv).toBe(expected);
  expect(CONFIG.isDevelopment).toBe(expected === "development");
  expect(CONFIG.isProduction).toBe(expected === "production");
  expect(CONFIG.isTest).toBe(expected === "test");
});
