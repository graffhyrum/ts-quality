export class Store {
  public items: number[] = [];
  private secret: string = "";
  get count(): number {
    return this.items.length;
  }
  add(n: number): void {
    this.items.push(n);
  }
}

export function double(n: number): number {
  return n * 2;
}

export const LIMIT = 7;
