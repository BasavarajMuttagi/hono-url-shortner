/**
 * AsyncSingleFlight collapses duplicate concurrent in-flight executions into a single shared execution.
 * It is the TypeScript equivalent of Go's `golang.org/x/sync/singleflight.Group`.
 *
 * Use Case: When 10,000 visitors hit an uncached short link at the exact same millisecond,
 * AsyncSingleFlight guarantees that exactly 1 query is sent to PostgreSQL.
 * All other 9,999 callers await and receive the same result without hammering the database.
 */
export class AsyncSingleFlight<T> {
  private inFlight = new Map<string, Promise<T>>();

  /**
   * Executes and returns the result of the given function, making sure that
   * only one execution is in-flight for a given key at a time.
   * If a duplicate call comes in, the duplicate caller waits for the original
   * to complete and receives the same result.
   */
  public async do(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      try {
        return await fn();
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Returns the count of currently in-flight keys.
   */
  public activeCount(): number {
    return this.inFlight.size;
  }
}
