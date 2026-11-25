export const KEY = "k";

export class Box {
  public amount: number = 1;
}

export const box = new Box();
export const table: Record<string, number> = {};
export const nested: Record<number, number> = {};

export function readByKey(): number {
  return table[KEY];
}

export function writeByKey(): void {
  table[KEY] = 1;
}

export function readNested(): number {
  return nested[box.amount];
}

export function addAmount(): number {
  return box.amount + 1;
}
