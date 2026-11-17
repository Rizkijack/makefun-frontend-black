// Loaded later: hash router + shell updates. First load only boots it.
import { esc } from './format.js';
import { skin } from './skin.js';

const DEFAULT_SLUG = 'makefun-frontend-01';
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

const skeleton = (label) => `<div class="loading">LOADING · ${esc(label)}</div>`;

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
  // The skin must be applied before any pane paints, so shots and first paint match.
  await skin();
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

/** Wire the clock and the hash router, then paint the current route. */
export function boot() {
  tick();
  setInterval(tick, 1000);
  window.addEventListener('hashchange', route);
  return route();
}
