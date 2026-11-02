export function memoPerRequest<Key extends object, Value>(
  load: (key: Key) => Promise<Value>
): (key: Key) => Promise<Value> {
  const cache = new WeakMap<Key, Promise<Value>>();

  return (key) => {
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const loaded = load(key);

    cache.set(key, loaded);

    return loaded;
  };
}
