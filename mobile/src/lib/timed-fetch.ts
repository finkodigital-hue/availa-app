/** Bound offline requests even when a platform fetch does not settle on abort. */
export function createTimedFetch(fetcher: typeof fetch, timeoutMs = 15_000): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const callerSignal = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const interrupted = new Promise<never>((_, reject) => {
      onAbort = () => {
        controller.abort();
        reject(new Error("The request was cancelled."));
      };
      if (callerSignal?.aborted) onAbort();
      else callerSignal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Bookzenvo could not connect. Check your connection and try again."));
      }, timeoutMs);
    });
    try {
      if (callerSignal?.aborted) return await interrupted;
      return await Promise.race([fetcher(input, { ...init, signal: controller.signal }), interrupted]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (onAbort) callerSignal?.removeEventListener("abort", onAbort);
    }
  };
}
