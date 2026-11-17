import { describe, it, expect } from 'vitest';
import { AsyncSingleFlight } from '../src/helpers/singleflight.js';

describe('AsyncSingleFlight Stampede Protection', () => {
  it('should collapse 50 concurrent requests for the same key into exactly 1 execution', async () => {
    const sf = new AsyncSingleFlight<string>();
    let executionCount = 0;

    // A mock slow database query taking 20ms
    const slowDbQuery = async (): Promise<string> => {
      executionCount++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 'https://example.com/target-url';
    };

    // Simulate 50 concurrent visitors hitting the exact same shortKey
    const concurrentRequests = Array.from({ length: 50 }, () =>
      sf.do('test-short-key', slowDbQuery)
    );

    const results = await Promise.all(concurrentRequests);

    // All 50 callers should receive the exact same result
    expect(results.length).toBe(50);
    results.forEach((url) => {
      expect(url).toBe('https://example.com/target-url');
    });

    // But the database function must have been called EXACTLY ONCE!
    expect(executionCount).toBe(1);
    expect(sf.activeCount()).toBe(0);
  });

  it('should execute independently for different keys', async () => {
    const sf = new AsyncSingleFlight<string>();
    let executionCount = 0;

    const mockQuery = async (val: string): Promise<string> => {
      executionCount++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return val;
    };

    const [resA, resB] = await Promise.all([
      sf.do('key-A', () => mockQuery('Result-A')),
      sf.do('key-B', () => mockQuery('Result-B')),
    ]);

    expect(resA).toBe('Result-A');
    expect(resB).toBe('Result-B');
    expect(executionCount).toBe(2);
  });
});
