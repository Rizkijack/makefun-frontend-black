// Loaded later: TTL cache, ETag revalidation, in-flight dedupe, keyed patching, request counters.
export const API = 'https://make.fun/api';
export const TTL = { board: 30000, bounty: 60000, leaderboard: 60000, profile: 120000, live: 60000 };

const store = new Map();
export const ETAGS = new Map();
export const inFlight = new Map();
export const REQUEST_STATS = { req: 0, cache: 0, reval: 0 };

function paintStats() {
  for (const el of document.querySelectorAll('[data-stat]')) el.textContent = REQUEST_STATS[el.dataset.stat] ?? 0;
}

/** GET with TTL, ETag/If-None-Match, 304 revalidation and in-flight dedupe. */
export async function cachedGet(url, ttl = TTL.live) {
  const hit = store.get(url);
  if (hit && Date.now() - hit.at < ttl) {
    REQUEST_STATS.cache++;
    paintStats();
    return hit.body;
  }
  if (inFlight.has(url)) return inFlight.get(url);
  const pending = (async () => {
    REQUEST_STATS.req++;
    const headers = {};
    if (hit?.etag) {
      headers['If-None-Match'] = hit.etag;
      REQUEST_STATS.reval++;
      paintStats();
    }
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (error) {
      // A cross-origin 304 can surface as a CORS failure; retry without the validator.
      if (!headers['If-None-Match']) throw error;
      delete headers['If-None-Match'];
      res = await fetch(url, { headers });
    }
    for (let attempt = 0; attempt < 2 && res.status === 503; attempt++) {
      await new Promise((done) => setTimeout(done, 2200));
      res = await fetch(url, { headers });
    }
    if (res.status === 304 && hit) {
      hit.at = Date.now();
      paintStats();
      return hit.body;
    }
    if (!res.ok) {
      if (hit) { hit.at = Date.now(); return hit.body; }
      throw new Error(`${res.status} ${url}`);
    }
    const body = await res.json();
    const etag = res.headers.get('etag') || hit?.etag;
    store.set(url, { body, etag, at: Date.now() });
    if (etag) ETAGS.set(url, etag);
    return body;
  })().finally(() => { inFlight.delete(url); paintStats(); });
  inFlight.set(url, pending);
  return pending;
}

/** Force a conditional request now; a 304 or a failed revalidation keeps the cached body. */
export function revalidate(url) {
  const hit = store.get(url);
  if (hit) hit.at = 0;
  return cachedGet(url, 0);
}

/** Replace only when the markup changed, so counters and focus survive. */
export function patch(el, html) {
  if (el && el.__html !== html) { el.innerHTML = html; el.__html = html; }
}

/** Patch a list of nodes in place by key, preserving nodes and scroll. */
export function keyed(parent, items, keyOf, make, update) {
  const old = new Map([...parent.children].map((n) => [n.dataset.k, n]));
  const frag = document.createDocumentFragment();
  for (const item of items) {
    const k = String(keyOf(item));
    let node = old.get(k);
    if (node) { update?.(node, item); old.delete(k); }
    else { node = make(item); node.dataset.k = k; }
    frag.append(node);
  }
  parent.replaceChildren(frag);
}
