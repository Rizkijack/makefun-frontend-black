// Read-only make.fun API client. Never imported by the first load: views reach it through
// literal import() chains. Every request goes through cachedGet (ETag + 304 + in-flight dedupe).
import { esc } from './format.js';

export const API = 'https://make.fun/api';
export const TTL = {
  board: 30000, bounty: 60000, leaderboard: 60000, profile: 120000,
  comments: 60000, history: 60000, likes: 60000, views: 60000, notices: 60000,
};

/** Observability counters shown in the statusbar. */
export const REQUEST_STATS = { req: 0, cache: 0, reval: 0, readOnly: true };
/** Last ETag seen per resolved URL. */
export const ETAGS = new Map();
/** Promise dedupe for concurrent identical requests. */
export const inFlight = new Map();

const store = new Map(); // url -> { body, at, etag }

function stats() {
  const el = typeof document === 'undefined' ? null : document.getElementById('reqstats');
  if (el) {
    el.textContent = `REQ ${REQUEST_STATS.req} · CACHE ${REQUEST_STATS.cache} · REVAL ${REQUEST_STATS.reval} · READ ONLY`;
  }
}
export const paintStats = stats;

/** Forget one URL (or every URL) so the next call goes to the network. */
export function revalidate(url) {
  if (url == null) { store.clear(); ETAGS.clear(); return; }
  const key = String(url).startsWith('http') ? String(url) : API + url;
  store.delete(key);
  ETAGS.delete(key);
}

/**
 * GET with a TTL fresh window, conditional revalidation and in-flight dedupe.
 * A cross-origin 304 may arrive without CORS headers; on any revalidation failure
 * we serve the stored body and count it as a revalidation instead of crashing.
 */
export async function cachedGet(url, ttlMs = 60000) {
  const key = String(url).startsWith('http') ? String(url) : API + url;
  REQUEST_STATS.req++;
  const now = Date.now();
  const hit = store.get(key);

  if (hit && now - hit.at < ttlMs) {
    REQUEST_STATS.cache++;
    stats();
    return hit.body;
  }
  if (inFlight.has(key)) {
    stats();
    return inFlight.get(key);
  }

  const task = (async () => {
    const headers = hit?.etag ? { 'if-none-match': hit.etag } : {};
    let res;
    try {
      res = await fetch(key, { headers, mode: 'cors' });
    } catch (err) {
      if (hit) { REQUEST_STATS.reval++; stats(); return hit.body; }
      throw err;
    }
    if (res.status === 304 && hit) {
      REQUEST_STATS.reval++;
      hit.at = now;
      stats();
      return hit.body;
    }
    if (!res.ok) {
      if (hit) { REQUEST_STATS.reval++; stats(); return hit.body; }
      throw new Error(`GET ${res.status}`);
    }
    let body;
    try { body = await res.json(); }
    catch (err) {
      if (hit) { REQUEST_STATS.reval++; stats(); return hit.body; }
      throw err;
    }
    const etag = res.headers.get('etag');
    if (etag) ETAGS.set(key, etag);
    store.set(key, { body, at: now, etag });
    stats();
    return body;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, task);
  return task;
}

/* Named read-only endpoints. */
export const getBoard = () => cachedGet('/competitions?status=open&activity=times', TTL.board);
export const getBounty = (slug) => cachedGet(`/competitions/${encodeURIComponent(slug)}?submissions=summary`, TTL.bounty);
export const getLeaderboard = (slug, view = 'overall') =>
  cachedGet(`/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first&view=${encodeURIComponent(view)}`, TTL.leaderboard);
export const getHistory = (slug) => cachedGet(`/competitions/${encodeURIComponent(slug)}/standings/history`, TTL.history);
export const getComments = (slug) => cachedGet(`/competitions/${encodeURIComponent(slug)}/comments`, TTL.comments);
export const getLikes = (slug) => cachedGet(`/competitions/${encodeURIComponent(slug)}/likes`, TTL.likes);
export const getViews = (slug) => cachedGet(`/competitions/${encodeURIComponent(slug)}/views`, TTL.views);
export const getNotices = (slug) => cachedGet(`/competitions/${encodeURIComponent(slug)}/notices`, TTL.notices);
export const getProfile = (handle) => cachedGet(`/profiles/${encodeURIComponent(handle)}`, TTL.profile);

/** Paint the optional thin notice banner under the topbar. */
export async function renderNotices(host, slug) {
  if (!host) return;
  try {
    const data = await getNotices(slug);
    const notes = data?.notices || [];
    host.innerHTML = notes.length
      ? `<div class="notice">${notes.map((n) => `<b>${esc(n.title || 'NOTICE')}</b> ${esc(n.body || n.text || '')}`).join(' &middot; ')}</div>`
      : '';
  } catch { host.innerHTML = ''; }
}

/** Lazy stylesheet injection for a view's own rules. */
export function loadCss(href) {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[data-viewcss="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.viewcss = href;
  document.head.appendChild(link);
}
