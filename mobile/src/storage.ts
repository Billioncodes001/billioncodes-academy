export interface DeviceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type StorageState<T> = {
  phase: 'loading' | 'ready' | 'blocked';
  value: T;
  pending: number;
  error: string | null;
};

/** No default writes on mount. Failed reads block edits until retry or explicit reset. */
export class StorageCell<T> {
  private state: StorageState<T>;
  private listeners = new Set<() => void>();
  private hydration: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private storage: DeviceStorage,
    private key: string,
    private initial: T,
    private decode: (raw: string) => T,
  ) {
    this.state = { phase: 'loading', value: initial, pending: 0, error: null };
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(patch: Partial<StorageState<T>>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }

  hydrate = (): Promise<void> => {
    if (this.hydration) return this.hydration;
    if (this.state.phase === 'ready') return Promise.resolve();
    this.publish({ phase: 'loading', error: null });
    this.hydration = (async () => {
      try {
        const raw = await this.storage.getItem(this.key);
        this.publish({ phase: 'ready', value: raw === null ? this.initial : this.decode(raw) });
      } catch {
        this.publish({ phase: 'blocked', error: 'Saved data could not be read. Nothing has been overwritten. Retry, or explicitly reset this store.' });
      } finally {
        this.hydration = null;
      }
    })();
    return this.hydration;
  };

  update = (change: (value: T) => T): Promise<boolean> => {
    if (this.state.phase !== 'ready') return Promise.resolve(false);
    return this.enqueue(change(this.state.value), false);
  };

  reset = (): Promise<boolean> => {
    if (this.state.phase === 'loading') return Promise.resolve(false);
    return this.enqueue(this.initial, true);
  };

  retryWrite = (): Promise<boolean> => {
    if (this.state.phase !== 'ready') return Promise.resolve(false);
    return this.enqueue(this.state.value, this.state.value === this.initial);
  };

  private enqueue(value: T, remove: boolean): Promise<boolean> {
    // Capture each snapshot now; a delayed earlier write must never win over a reset.
    const raw = remove ? null : JSON.stringify(value);
    this.publish({ phase: 'ready', value, pending: this.state.pending + 1 });
    let success = false;
    const operation = this.queue.then(async () => {
      try {
        if (raw === null) await this.storage.removeItem(this.key);
        else await this.storage.setItem(this.key, raw);
        success = true;
        this.publish({ error: null });
      } catch {
        this.publish({ error: 'Changes are in memory only: device storage could not be updated. Keep this app open and retry saving.' });
      } finally {
        this.publish({ pending: this.state.pending - 1 });
      }
    });
    this.queue = operation;
    return operation.then(() => success);
  }

  flush = () => this.queue;
}
