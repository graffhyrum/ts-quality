/** UTF-16 code unit order (JavaScript string comparison). */
export function comparePath(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
