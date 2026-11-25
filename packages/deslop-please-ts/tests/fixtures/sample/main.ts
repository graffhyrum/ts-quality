import { Store, double, LIMIT } from "./helper.ts";

const s = new Store();
s.add(double(LIMIT));
console.log(s.count, s.items.length);
export { s };
