/** Serializes loaders globally while allowing each queued call to keep its own result. */
export const createSingleFlight = () => {
  let active: Promise<unknown> | null = null;

  return {
    async run<T>(load: () => Promise<T>): Promise<T> {
      if (active) await active.catch(() => undefined);
      const promise = load();
      active = promise;
      try {
        return await promise;
      } finally {
        if (active === promise) active = null;
      }
    },
    isActive: () => active !== null,
  };
};
