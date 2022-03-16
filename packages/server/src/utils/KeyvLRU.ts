// Create ~about~ a 30MiB LRU. This is less than precise
// since the technique to calculate the size of a DocumentNode is
// only using JSON.stringify on the DocumentNode (and thus doesn't account
// for unicode characters, etc.), but it should do a reasonable job at
// providing a caching document store for most operations.

import LRUCache from 'lru-cache';
import Keyv, { Store, type Options } from 'keyv';
import type { WithRequired } from '@apollo/server-types';

// LRUCache wrapper to implement the Keyv `Store` interface.
export class LRU<T> implements Store<T> {
  private cache: LRUCache<string, T>;

  constructor(lruCacheOpts: LRUCache.Options<string, T>) {
    this.cache = new LRUCache({
      sizeCalculation(value) {
        return LRU.jsonBytesSizeCalculator(value);
      },
      ...lruCacheOpts,
    });
  }

  set(key: string, value: T, ttl?: number) {
    const result = this.cache.set(key, value, { ttl });
    return result;
  }

  get(key: string) {
    return this.cache.get(key);
  }

  delete(key: string) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  sizeCalculation() {
    return this.cache.calculatedSize;
  }

  static jsonBytesSizeCalculator<T>(obj: T) {
    return Buffer.byteLength(JSON.stringify(obj), 'utf8');
  }
}

// FIXME Keyv.opts isn't defined in the typings
// Related issue: https://github.com/DefinitelyTyped/DefinitelyTyped/pull/59154
type KeyvClassOpts<T> = WithRequired<
  Options<T>,
  'deserialize' | 'namespace' | 'serialize' | 'store' | 'uri'
>;

export type KeyvWithOpts<T> = Keyv<T> & {
  opts: KeyvClassOpts<T>;
};

export class KeyvLRU<T> extends Keyv<T> implements KeyvWithOpts<T> {
  // @ts-ignore FIXME Keyv.opts isn't defined in the typings. This is a workaround
  // for now that we can remove once they're correct.
  // Related issue: https://github.com/DefinitelyTyped/DefinitelyTyped/pull/59154
  opts: KeyvClassOpts<T>;

  constructor(opts?: Options<T>) {
    super({
      namespace: 'apollo',
      store: new LRU<T>({
        max: 100,
        maxSize: Math.pow(2, 20) * 30,
      }),
      ...opts,
    });
  }

  getTotalSize() {
    if ('sizeCalculation' in this.opts.store) {
      return (
        this.opts.store as Store<T> & { sizeCalculation: () => number }
      ).sizeCalculation();
    }
    throw Error('Keyv.store does not implement sizeCalculation()');
  }
}
export class PrefixingKeyv<K> extends Keyv<K> {
  constructor(private wrapped: Keyv<K>, private prefix: string) {
    super();
  }

  override get<TRaw extends boolean = false>(
    key: string,
    opts?: { raw?: TRaw },
  ) {
    return this.wrapped.get(this.prefix + key, opts);
  }

  override set(key: string, value: K, ttl?: number) {
    return this.wrapped.set(this.prefix + key, value, ttl);
  }

  override delete(key: string) {
    return this.wrapped.delete(this.prefix + key);
  }
}
