// Pool de workers con concurrencia limitada.
// Procesa una lista de ítems llamando a `worker` para cada uno; N en paralelo.

export interface QueueOptions {
  concurrency?: number;
  onError?: (id: string, error: unknown) => void;
}

export async function runQueue<T extends { id: string }>(
  items: T[],
  worker: (item: T) => Promise<void>,
  { concurrency = 4, onError }: QueueOptions = {},
): Promise<void> {
  let cursor = 0;
  const runNext = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        await worker(item);
      } catch (e) {
        onError?.(item.id, e);
      }
    }
  };
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => runNext()));
}
