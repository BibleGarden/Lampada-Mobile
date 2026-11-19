export type PoolStatus = 'empty' | 'pending' | 'ready';

type Slot<T> =
  | { key: string; status: 'pending'; promise: Promise<T> }
  | { key: string; status: 'ready'; value: T };

/**
 * A single-slot buffer: a ready value is taken synchronously, while a pending
 * one can be awaited via wait() without starting the loader again.
 */
export const createOneAheadPool = <T>() => {
  let version = 0;
  let slot: Slot<T> | null = null;

  return {
    prepare(key: string, load: () => Promise<T>) {
      if (slot?.key === key) {
        return slot.status === 'ready' ? Promise.resolve(slot.value) : slot.promise;
      }

      const requestVersion = ++version;
      const promise = load();
      slot = { key, status: 'pending', promise };
      void promise.then(
        (value) => {
          if (requestVersion === version && slot?.key === key) {
            slot = { key, status: 'ready', value };
          }
        },
        () => {
          if (requestVersion === version && slot?.key === key) slot = null;
        },
      );
      return promise;
    },

    wait(key: string): Promise<T> | undefined {
      if (slot?.key !== key) return undefined;
      return slot.status === 'ready' ? Promise.resolve(slot.value) : slot.promise;
    },

    takeReady(key: string): T | undefined {
      if (slot?.key !== key || slot.status !== 'ready') return undefined;
      const value = slot.value;
      version++;
      slot = null;
      return value;
    },

    invalidate() {
      version++;
      slot = null;
    },

    status(key: string): PoolStatus {
      return slot?.key === key ? slot.status : 'empty';
    },
  };
};
