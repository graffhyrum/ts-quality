export async function load(): Promise<number> {
  const loaded = await import("./late.ts");
  return loaded.later();
}
