/** Resources owned by the Whale Dream account module, separate from the host session. */
export function createHostLifecycle() {
  let closed = false;
  const disposers = new Set();
  const wrappers = new WeakMap();
  const requests = new Set();
  const keep = (value) => {
    if (typeof value !== 'function') return value;
    if (wrappers.has(value)) return wrappers.get(value);
    let done = false;
    const wrapped = () => {
      if (done) return;
      done = true;
      disposers.delete(wrapped);
      return value();
    };
    wrappers.set(value, wrapped);
    disposers.add(wrapped);
    return wrapped;
  };
  return {
    signal(ms = 15000) {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        requests.delete(entry);
        controller.abort();
      }, Math.max(100, Math.min(Number(ms) || 15000, 60000)));
      timer.unref?.();
      const entry = { controller, timer };
      if (closed) { clearTimeout(timer); controller.abort(); }
      else requests.add(entry);
      return controller.signal;
    },
    interval(ctx, callback, ms) {
      return keep(ctx.interval(() => { if (!closed) callback(); }, ms));
    },
    on(ctx, event, callback) { return keep(ctx.on(event, callback)); },
    inject(ctx, services, callback) { return keep(ctx.inject(services, callback)); },
    effect(ctx, callback, label) {
      return keep(ctx.effect(() => keep(callback()), label));
    },
    dispose() {
      if (closed) return;
      closed = true;
      for (const { controller, timer } of requests) {
        clearTimeout(timer);
        controller.abort();
      }
      requests.clear();
      for (const dispose of [...disposers].reverse()) {
        try { dispose(); } catch { /* Disposing one host service must not block the others. */ }
      }
      disposers.clear();
    },
  };
}
