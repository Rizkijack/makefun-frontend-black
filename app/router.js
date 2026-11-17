// Shell + hash router. Lazy: main.js imports this only after the first paint.
// Deep links: #/, #/bounty/<slug>, #/bounty/<slug>/standings, #/u/<handle>.
import { esc, patch } from './format.js';
import { loadCss, renderNotices, paintStats } from './api.js';

export const DEFAULT_SLUG = 'makefun-frontend-01';

const NAV = [
  ['board', 'BOARD', '#/'],
  ['bounty', 'BOUNTY', `#/bounty/${DEFAULT_SLUG}`],
  ['ranks', 'RANKS', `#/bounty/${DEFAULT_SLUG}/standings`],
  ['profile', 'PROFILE', '#/u/Rizkijack'],
];

const LOADERS = {
  board: () => import('./views/board.js'),
  bounty: () => import('./views/bounty.js'),
  ranks: () => import('./views/bounty.js'),
  profile: () => import('./views/profile.js'),
};

export function parseRoute(hash) {
  const h = (hash || '#/').replace(/^#/, '') || '/';
  let m = h.match(/^\/bounty\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (m) {
    const tab = m[2] === 'standings' ? 'standings' : m[2] || 'overview';
    return { key: tab === 'standings' ? 'ranks' : 'bounty', slug: decodeURIComponent(m[1]), tab };
  }
  m = h.match(/^\/u\/([^/]+)\/?$/);
  if (m) return { key: 'profile', handle: decodeURIComponent(m[1]) };
  return { key: 'board' };
}

export function shell(active) {
  const links = NAV.map(([k, label, href]) =>
    `<a href="${href}"${k === active ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  patch(document.getElementById('app'), `
    <header class="topbar">
      <a class="wordmark" href="#/">MAKE<span class="slash">/</span>FUN</a>
      <nav class="nav" aria-label="Sections">${links}</nav>
      <a class="cta" href="https://make.fun/bounty/${DEFAULT_SLUG}" rel="noopener">ENTER</a>
    </header>
    <div id="notices"></div>
    <main id="view" class="view" aria-live="polite"></main>
    <footer class="statusbar">
      <span class="crumb" id="crumb">MAKE/FUN / BOARD</span>
      <span class="flow">REQUEST <b>&rarr;</b> CACHE <b>&rarr;</b> REVALIDATE</span>
      <span id="reqstats">REQ 0 · CACHE 0 · REVAL 0 · READ ONLY</span>
      <span class="clock" id="clock">--:--:-- UTC</span>
    </footer>
  `);
}

export async function route() {
  window.__shotReady = false;
  loadCss('./views/base.css');
  const r = parseRoute(location.hash);
  shell(r.key);
  document.title = r.key === 'board' ? 'MAKE/FUN · board'
    : r.key === 'profile' ? `MAKE/FUN · @${r.handle}`
    : `MAKE/FUN · ${r.slug} / ${r.tab}`;
  const view = document.getElementById('view');
  patch(view, '<p class="mut mono">LOADING DATA&hellip;</p>');
  try {
    const mod = await LOADERS[r.key]();
    if (r.key === 'board') {
      await mod.renderBoard(view);
      patch(document.getElementById('crumb'), 'MAKE/FUN / BOARD');
    } else if (r.key === 'profile') {
      await mod.renderProfile(view, r.handle);
      patch(document.getElementById('crumb'), `MAKE/FUN / U / ${esc(r.handle).toUpperCase()}`);
    } else {
      await mod.renderBounty(view, { slug: r.slug, tab: r.tab });
      patch(document.getElementById('crumb'), `MAKE/FUN / ${esc(r.slug)} / ${esc(r.tab).toUpperCase()}`);
    }
    await renderNotices(document.getElementById('notices'), DEFAULT_SLUG);
    paintStats();
  } catch (err) {
    patch(view, `<p class="mono" style="color:var(--accent)">ERROR ${esc(err?.message || err)}</p>`);
  }
  window.scrollTo(0, 0);
  window.__shotReady = true;
}

export function mount() {
  window.addEventListener('hashchange', route);
  const tick = () => {
    const el = document.getElementById('clock');
    if (el) el.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
  };
  tick();
  setInterval(tick, 1000);
  route();
}
