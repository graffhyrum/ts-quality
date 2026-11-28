/** Operational failure of the selector. `message` is the full stderr line or lines, without a trailing newline. */
export class SelectorFailure extends Error {
  readonly exitCode: 1 | 2;

  constructor(exitCode: 1 | 2, message: string) {
    super(message);
    this.name = "SelectorFailure";
    this.exitCode = exitCode;
  }
}
