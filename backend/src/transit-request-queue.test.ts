import { describe, expect, it } from "vitest";
import { createTransitRequestQueue } from "./transit-request-queue.js";

describe("transit request queue", () => {
  it("runs requests serially in FIFO order", async () => {
    const queue = createTransitRequestQueue({ delayMs: 0 });
    const order: number[] = [];
    let active = 0;
    let maximumActive = 0;

    const request = (value: number) => queue.enqueue(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(value);
      active -= 1;
      return value;
    });

    await expect(Promise.all([request(1), request(2), request(3)])).resolves.toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
    expect(maximumActive).toBe(1);
  });

  it("keeps the configured delay between request starts", async () => {
    const queue = createTransitRequestQueue({ delayMs: 50 });
    const starts: number[] = [];
    await Promise.all([
      queue.enqueue(async () => { starts.push(Date.now()); }),
      queue.enqueue(async () => { starts.push(Date.now()); }),
    ]);
    expect(starts).toHaveLength(2);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(45);
  });
});
