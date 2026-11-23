// Sample source for the doctor's engine smoke check; it must trip no-unknown-as-cast and no-waitForTimeout.
// It sits in src/rules/ because the regex scan skips rule files, which quote the patterns they flag.
export const SMOKE_SOURCE = "const x = y as unknown as string;\npage.waitForTimeout(100);\n";
