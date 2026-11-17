// Registry view: compact KPI strip + dense table + detail pane. Read-only.
import { cachedGet, cacheStrip } from './cache.js';
import { usd, compact, timeLeft, ago, tnum } from './util.js';
import { loadStyles } from './ui.js';
import { mount, setCrumb, setStats, setNotice } from './router.js';

export const FILTERS = [
  { key: 'all', label: 'ALL', test: () => true },
  { key: 'live', label: 'LIVE', test: b => b.status === 'open' && new Date(b.deadline) > new Date() },
  { key: 'close', label: 'CLOSING24H', test: b => { const d = new Date(b.deadline) - Date.now(); return d > 0 && d < 864e5; } },
  { key: 'big', label: '$1K+', test: b => Number(b.potUsd ?? b.rewardAmount) >= 1000 },
];

let items = [];
let selectedSlug = '';
let filter = 'all';
let sortKey = 'pot';
let sortDir = -1;

// potUsd is authoritative; rewardAmount is the fallback base prize.
const potOf = b => Number(b.potUsd ?? b.rewardAmount ?? 0);
function lastEntry(b) {
  const c = b.chat && b.chat.length ? b.chat[b.chat.length - 1] : null;
  const t = b.activity?.lastEntryAt ?? b.lastEntryAt ?? (b.submissions?.length ? b.submissions[b.submissions.length - 1]?.received_at : null) ?? c?.createdAt;
  return t ? ago(t) : '—';
}

export function sortBy(rows, key, dir) {
  const val = b => key === 'pot' ? potOf(b)
    : key === 'subs' ? Number(b.submissionCount ?? 0)
    : key === 'close' ? new Date(b.deadline).getTime()
    : String(b.title ?? '').toLowerCase();
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
}

export function boardRow(b, i) {
  const slug = encodeURIComponent(b.slug);
  return `<tr data-slug="${slug}" tabindex="0" class="row${b.slug === selectedSlug ? ' sel' : ''}">
    <td class="mark">${String(i + 1).padStart(2, '0')}</td>
    <td class="title" title="${b.title ? b.title.replace(/"/g, '') : ''}">${b.title ?? b.slug}</td>
    <td class="pot">${usd(potOf(b))}</td>
    <td class="close">${timeLeft(b.deadline)}</td>
    <td class="num">${compact(b.submissionCount)}</td>
    <td class="act">last entry ${lastEntry(b)}</td>
  </tr>`;
}

function kpis(list) {
  const pot = list.reduce((s, b) => s + potOf(b), 0);
  const subs = list.reduce((s, b) => s + Number(b.submissionCount ?? 0), 0);
  const soon = list.filter(b => new Date(b.deadline) > new Date()).map(b => timeLeft(b.deadline)).sort()[0] ?? '—';
  return `<div class="kpis">
    <div class="kpi"><div class="lab">Open bounties</div><div class="val">${tnum(list.length)}</div></div>
    <div class="kpi"><div class="lab">Live pot</div><div class="val live">${usd(pot)}</div></div>
    <div class="kpi"><div class="lab">Entries</div><div class="val">${compact(subs)}</div></div>
    <div class="kpi"><div class="lab">Closest close</div><div class="val">${soon}</div></div>
  </div>`;
}

function chips() {
  return `<div class="chips" role="group" aria-label="Filters">${FILTERS.map(f =>
    `<button class="chip${f.key === filter ? ' on' : ''}" data-filter="${f.key}">${f.label}</button>`).join('')}</div>`;
}

function table(rows) {
  const head = [['mark', '#'], ['title', 'BOUNTY'], ['pot', 'POT'], ['close', 'CLOSES IN'], ['num', 'SUBS'], ['act', 'ACTIVITY']]
    .map(([k, t]) => `<th data-sort="${k}">${t}</th>`).join('');
  return `<div class="cap"><b>REGISTRY · OPEN BOUNTIES</b><span>${rows.length} ROWS · READ ONLY</span></div>
    <table><thead><tr>${head}</tr></thead><tbody>${rows.map(boardRow).join('')}</tbody></table>
    ${rows.length ? '' : '<div class="rempty">NO BOUNTIES MATCH FILTER</div>'}`;
}

function paint() {
  const rows = sortBy(items.filter(FILTERS.find(f => f.key === filter).test), sortKey, sortDir);
  const reg = document.getElementById('registry');
  if (reg) reg.innerHTML = kpis(items) + chips() + table(rows);
  wire();
}

function wire() {
  for (const c of document.querySelectorAll('[data-filter]'))
    c.addEventListener('click', () => { filter = c.dataset.filter; paint(); });
  for (const h of document.querySelectorAll('[data-sort]'))
    h.addEventListener('click', () => {
      const k = h.dataset.sort;
      if (k === sortKey) sortDir *= -1; else { sortKey = k; sortDir = 1; }
      paint();
    });
  for (const r of document.querySelectorAll('tr.row'))
    r.addEventListener('click', () => { location.hash = '#/bounty/' + r.dataset.slug; });
}

export function registryShell() {
  return `<div class="grid"><section id="registry" class="registry"></section><aside id="pane" class="pane"></aside></div>`;
}

export function stats() {
  setStats(cacheStrip());
}

export async function renderBoard() {
  loadStyles();
  mount(`<div class="grid"><section id="registry" class="registry"></section><aside id="pane" class="pane"></aside></div>`);
  setCrumb('BOARD / REGISTRY');
  items = (await cachedGet('/competitions?status=open&activity=times', 30000)).items ?? [];
  const featured = items[0]?.slug ?? 'makefun-frontend-01';
  selectedSlug = window.__registryOnly ? (window.__selectedSlug ?? '') : featured;
  paint();
  stats();
  // Live notices for the featured bounty, shown as a thin banner.
  try {
    const n = await cachedGet(`/competitions/${encodeURIComponent(featured)}/notices`, 60000);
    if (n.notices?.length) setNotice(n.notices.map(x => `<div class="notice">NOTICE · ${x.title ?? x.body ?? 'update'}</div>`).join(''));
  } catch { /* notices optional */ }
  if (window.__registryOnly) return;
  const { renderPane } = await import('./bounty.js');
  await renderPane(featured, 'overview', document.getElementById('pane'));
}
