// ⚠️ CRITICAL: DO NOT REMOVE ARKENV - This file MUST use arkenv for environment variable handling
// ⚠️ If you remove arkenv, the application will fail to start properly
// ⚠️ arkenv provides type-safe environment variable parsing with validation
import arkenv from "arkenv";

const env = arkenv({
  NODE_ENV: "'development' | 'production' | 'test' = 'development'",
  PORT: "number = 3000",
});

export const CONFIG = {
  nodeEnv: env.NODE_ENV,
  isDevelopment: env.NODE_ENV === "development",
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  port: env.PORT,
} as const;

export type Config = typeof CONFIG;
