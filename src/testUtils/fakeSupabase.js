export function createFakeQuery(result) {
  const query = {
    select: () => query,
    order: () => query,
    eq: () => query,
    neq: () => query,
    in: () => query,
    insert: () => query,
    update: () => query,
    delete: () => query,
    single: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return query
}

export function createFakeSupabase(routes) {
  return {
    from: (table) => routes[table],
    storage: {
      from: (bucket) =>
        routes.storage?.[bucket] ?? { upload: () => Promise.resolve({ error: null }) },
    },
    rpc: routes.rpc ?? (() => Promise.resolve({ error: null })),
  }
}
