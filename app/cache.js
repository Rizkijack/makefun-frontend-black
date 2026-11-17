// ETag cache: TTL, If-None-Match revalidation, in-flight dedupe. Read-only GET.
export const API = 'https://make.fun/api';
export const ETAGS = new Map();       // url -> last ETag
export const CACHE = new Map();       // url -> { at, body }
export const inFlight = new Map();    // url -> Promise (dedupe concurrent calls)
export const REQUEST_STATS = { req: 0, cache: 0, reval: 0 };

export async function revalidate(path) {
  const url = API + path;
  const hit = CACHE.get(url);
  if (hit) CACHE.set(url, { ...hit, at: 0 });
  return cachedGet(path, 0);
}

export async function cachedGet(path, ttlMs = 60000) {
  const url = API + path;
  if (inFlight.has(url)) return inFlight.get(url);
  const hit = CACHE.get(url);
  if (hit && Date.now() - hit.at < ttlMs) {
    REQUEST_STATS.cache++;
    return hit.body;
  }
  const task = (async () => {
    const headers = {};
    const tag = ETAGS.get(url);
    if (tag) headers['If-None-Match'] = tag;
    REQUEST_STATS.req++;
    const res = await fetch(url, { headers });
    if (res.status === 304 && hit) {
      REQUEST_STATS.reval++;
      CACHE.set(url, { ...hit, at: Date.now() });
      return hit.body;
    }
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    const t = res.headers.get('etag');
    if (t) ETAGS.set(url, t);
    let body;
    try { body = await res.json(); } catch { body = await res.text(); }
    CACHE.set(url, { at: Date.now(), body });
    return body;
  })();
  inFlight.set(url, task);
  try { return await task; } finally { inFlight.delete(url); }
}

// The plain-text proof strip shown in the status area.
export function cacheStrip() {
  const s = REQUEST_STATS;
  return 'REQUEST → CACHE → REVALIDATE  ·  REQ ' + s.req + ' · CACHE ' + s.cache + ' · REVAL ' + s.reval + ' · READ ONLY';
}
