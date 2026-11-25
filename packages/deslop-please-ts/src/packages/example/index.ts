import { double as implDouble } from "./lib/impl";

export function double(n: number): number {
  return implDouble(n);
}
