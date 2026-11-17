// First load: shell, hash router, ETag cache, keyed patching, request counters.
import { esc } from './format.js';

export const API = 'https://make.fun/api';
export const DEFAULT_SLUG = 'makefun-frontend-01';
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

const TABS = new Set(['overview', 'rewards', 'standings', 'entries', 'feed', 'history']);
let routeSeq = 0;

export function parseRoute(hash = location.hash || '#/') {
  const profile = hash.match(/^#\/u\/([^/?#]+)/);
  if (profile) return { kind: 'profile', handle: decodeURIComponent(profile[1]) };
  const entry = hash.match(/^#\/entry\/([^/?#]+)/);
  if (entry) return { kind: 'entry', id: decodeURIComponent(entry[1]) };
  const bounty = hash.match(/^#\/bounty\/([^/?#]+)(?:\/([a-z]+))?/);
  if (bounty) {
    const tab = TABS.has(bounty[2]) ? bounty[2] : 'overview';
    return { kind: 'bounty', slug: decodeURIComponent(bounty[1]), tab };
  }
  return { kind: 'board' };
}

function setNav(r) {
  const active = r.kind === 'profile' ? 'profile' : r.kind === 'board' ? 'board' : r.kind === 'entry' ? 'bounty' : r.tab === 'standings' ? 'ranks' : 'bounty';
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function setCrumb(r) {
  const crumb = document.getElementById('crumb');
  if (!crumb) return;
  crumb.textContent = r.kind === 'profile' ? `#/u/${r.handle}` : r.kind === 'entry' ? `#/entry/${r.id}` : r.kind === 'bounty' ? `#/bounty/${r.slug}${r.tab === 'overview' ? '' : `/${r.tab}`}` : '#/';
}

function skeleton(label) {
  return `<div class="loading">LOADING · ${esc(label)}</div>`;
}

function clearNotice() {
  const n = document.getElementById('notice');
  if (n) { n.hidden = true; n.innerHTML = ''; n.__html = ''; }
}

export async function route() {
  const token = ++routeSeq;
  window.__shotReady = false;
  const view = document.getElementById('view');
  const r = parseRoute();
  if (!view) return;
  setNav(r);
  setCrumb(r);
  clearNotice();
  view.setAttribute('aria-busy', 'true');
  document.title = r.kind === 'profile' ? `@${r.handle} · OBSIDIAN` : r.kind === 'entry' ? `ENTRY · OBSIDIAN` : r.kind === 'bounty' ? `${r.slug} · OBSIDIAN` : 'OBSIDIAN · make.fun monitor';

  try {
    if (r.kind === 'profile') {
      view.innerHTML = skeleton(`PROFILE @${r.handle}`);
      const { renderProfile } = await import('./profile.js');
      await renderProfile(view, r.handle);
    } else if (r.kind === 'entry') {
      view.innerHTML = `<section class="board-pane">${skeleton('BOARD')}</section><section class="detail-pane">${skeleton('ENTRY')}</section>`;
      const [{ renderEntry }, { renderBoard }] = await Promise.all([import('./entry.js'), import('./board.js')]);
      const slug = await renderEntry(view.querySelector('.detail-pane'), r.id);
      document.title = `#/entry/${r.id} · OBSIDIAN`;
      await renderBoard(view.querySelector('.board-pane'), slug || DEFAULT_SLUG);
    } else {
      const slug = r.slug || DEFAULT_SLUG;
      const tab = r.tab || 'overview';
      view.innerHTML = `<section class="board-pane">${skeleton('BOARD')}</section><section class="detail-pane">${skeleton('BOUNTY')}</section>`;
      const [{ renderBoard }, { renderBounty }] = await Promise.all([import('./board.js'), import('./bounty.js')]);
      await Promise.all([
        renderBoard(view.querySelector('.board-pane'), slug),
        renderBounty(view.querySelector('.detail-pane'), slug, tab),
      ]);
    }
  } catch (error) {
    if (token !== routeSeq) return;
    const box = document.createElement('div');
    box.className = 'err';
    box.innerHTML = `<b>OFFLINE</b> · ${esc(error?.message || error)}<br>Retrying when the route changes. Content already rendered stays readable.`;
    view.prepend(box);
  }
  if (token !== routeSeq) return;
  view.setAttribute('aria-busy', 'false');
  window.__shotReady = true;
}

function tick() {
  const c = document.getElementById('clock');
  if (c) c.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
}

export function mount() {
  tick();
  setInterval(tick, 1000);
  window.addEventListener('hashchange', route);
  route();
}

mount();
