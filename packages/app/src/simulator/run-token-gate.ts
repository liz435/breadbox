/**
 * Monotonic token gate for canceling stale async completions.
 *
 * Each new run gets a token from beginRun(). Any later beginRun() or
 * invalidate() call makes older tokens stale.
 */
export class RunTokenGate {
  private token = 0;

  beginRun(): number {
    this.token += 1;
    return this.token;
  }

  invalidate(): void {
    this.token += 1;
  }

  isCurrent(token: number): boolean {
    return token === this.token;
  }
}
