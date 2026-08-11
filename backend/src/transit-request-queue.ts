export type TransitRequestQueue = {
  enqueue: <T>(task: () => Promise<T>) => Promise<T>;
};

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const createTransitRequestQueue = (options: {
  delayMs?: number;
  sleepImpl?: (milliseconds: number) => Promise<void>;
} = {}): TransitRequestQueue => {
  const delayMs = Math.max(0, options.delayMs ?? 500);
  const sleepImpl = options.sleepImpl ?? sleep;
  let tail = Promise.resolve();
  let lastStartedAt = 0;

  const queue: TransitRequestQueue = {
    enqueue<T>(task: () => Promise<T>) {
      const run = async (): Promise<T> => {
        const wait = delayMs - (Date.now() - lastStartedAt);
        if (wait > 0) await sleepImpl(wait);
        lastStartedAt = Date.now();
        return task();
      };
      const result = tail.then(run, run);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  return queue;
};
