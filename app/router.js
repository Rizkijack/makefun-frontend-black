// Lazy shell: topbar, statusbar, hash routing, view dispatch.
import { esc } from './format.js';

const app = document.getElementById('app');
let clock = null;

function topbar() {
  return `<header class="topbar">
    <a class="brand" href="#/" aria-label="OBSIDIAN board">MAKE<span class="slash">/</span>FUN</a>
    <nav class="nav" aria-label="Sections">
      <a href="#/" data-nav="board">BOARD</a><a href="#/bounty/makefun-frontend-01" data-nav="bounty">BOUNTY</a>
      <a href="#/bounty/makefun-frontend-01/standings" data-nav="ranks">RANKS</a><a href="#/u/Rizkijack" data-nav="profile">PROFILE</a>
    </nav>
    <a class="cta" href="https://make.fun/bounty/makefun-frontend-01" rel="noopener">LIVE API ↗</a>
  </header><div id="notice"></div>`;
}

function shell() {
  app.innerHTML = topbar() +
    `<main id="view" class="view"><div class="boot">LOADING REGISTRY…</div></main>
    <footer class="statusbar"><span id="crumb">BOARD</span><span class="spacer"></span>
    <span id="stats">REQ 0 · CACHE 0 · REVAL 0 · READ ONLY</span><span class="spacer"></span>
    <time id="clock"></time></footer>`;
  if (!clock) clock = setInterval(tick, 1000);
  tick();
}
function tick() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toISOString().slice(11, 19) + ' UTC';
}
export function mount(html) {
  const v = document.getElementById('view');
  if (v) { v.innerHTML = html; window.scrollTo(0, 0); }
}
export function setCrumb(t) { const e = document.getElementById('crumb'); if (e) e.innerHTML = t; }
export function setStats(t) { const e = document.getElementById('stats'); if (e) e.textContent = t; }
export function setNotice(html) { const e = document.getElementById('notice'); if (e) e.innerHTML = html; }
export function markNav(name) {
  for (const a of document.querySelectorAll('[data-nav]'))
    a.classList.toggle('active', a.getAttribute('data-nav') === name);
}

// #/ · #/bounty/<slug> · #/bounty/<slug>/<tab> · #/u/<handle>
export function route(hash = location.hash) {
  const h = decodeURIComponent(hash.replace(/^#\/?/, ''));
  let m;
  if ((m = h.match(/^bounty\/([^/]+)\/(standings|feed|history|rewards)$/)))
    return { name: 'bounty', slug: m[1], tab: m[2] };
  if ((m = h.match(/^bounty\/([^/]+)/))) return { name: 'bounty', slug: m[1], tab: 'overview' };
  if ((m = h.match(/^u\/([^/]+)/))) return { name: 'profile', handle: m[1] };
  return { name: 'board', tab: 'overview' };
}

export async function render() {
  window.__shotReady = false;
  if (!document.getElementById('view')) shell();
  const r = route();
  try {
    if (r.name === 'profile') {
      markNav('profile');
      const { renderProfile } = await import('./profile.js');
      await renderProfile(r.handle);
    } else if (r.name === 'bounty') {
      markNav(r.tab === 'standings' ? 'ranks' : 'bounty');
      const { renderBounty } = await import('./bounty.js');
      await renderBounty(r.slug, r.tab);
    } else {
      markNav('board');
      const { renderBoard } = await import('./board.js');
      await renderBoard();
    }
  } catch (err) {
    setCrumb('ERROR');
    mount(`<div class="err"><b>REQUEST FAILED</b><p>${esc(err?.message ?? err)}</p>
      <p class="faint">Read-only client · make.fun public API</p></div>`);
  }
  window.__shotReady = true;
}

export function start() {
  window.addEventListener('hashchange', render);
  render();
}
