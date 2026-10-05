/**
 * A minimal drizzle-like db handle for dispatch tests.
 *
 * The dispatch admission gate persists the run's execution identity inside a
 * transaction BEFORE spawn — a stub db without `transaction` now refuses the
 * run (previously that failure was swallowed as non-fatal noise). This helper
 * answers every fluent chain step (`insert/update/select/delete` → `set` →
 * `where` → `returning` → `limit` …) with a thenable resolving to `[]`, and
 * `transaction(cb)` invokes the callback with the same handle — enough for the
 * admission ledger's writes to succeed without standing up a real database.
 */
const dbChain = (): unknown => {
  const p = Promise.resolve([]);
  return new Proxy(p, {
    get: (target, prop) => {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return target[prop].bind(target);
      }
      if (prop === Symbol.toPrimitive) return undefined;
      return () => dbChain();
    },
  });
};

export const createDispatchTestDb = () => {
  const db: Record<string, unknown> = {
    delete: () => dbChain(),
    insert: () => dbChain(),
    select: () => dbChain(),
    update: () => dbChain(),
  };
  db.transaction = async (cb: (tx: unknown) => Promise<unknown>) => cb(db);
  return db;
};
