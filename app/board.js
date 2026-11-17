// Board: dense registry table, compact KPI band, filters, sort, live activity times.
import { ago, compact, esc, timeLeft, usd } from './format.js';
import { API, TTL, cachedGet, keyed, patch } from './main.js';

export const FILTERS = [
  { key: 'all', label: 'ALL', test: () => true },
  { key: 'live', label: 'LIVE', test: (b) => b.status === 'open' && Date.parse(b.deadline) > Date.now() },
  { key: 'closing', label: 'CLOSING 24H', test: (b) => { const t = Date.parse(b.deadline) - Date.now(); return t > 0 && t < 86400000; } },
  { key: 'k', label: '$1K+', test: (b) => Number(b.potUsd ?? b.rewardAmount ?? 0) >= 1000 },
];

const potOf = (b) => Number(b.potUsd ?? b.rewardAmount ?? 0);
const closeOf = (b) => Date.parse(b.deadline) || 0;
const subsOf = (b) => Number(b.submissionCount ?? 0);
const lastEntry = (b) => (b.submissions || []).reduce((max, s) => Math.max(max, Date.parse(s.createdAt) || 0), 0);

export function sortBy(items, key, dir = -1) {
  const value = key === 'pot' ? potOf : key === 'closes' ? closeOf : key === 'subs' ? subsOf : potOf;
  return [...items].sort((a, b) => (value(a) - value(b)) * dir);
}

export function boardRow(b, selected, index) {
  const last = lastEntry(b);
  const live = last ? ago(new Date(last).toISOString()) : '';
  const fee = Number(b.entryFeeUsd ?? 0) > 0 ? ` · FEE ${usd(b.entryFeeUsd)}` : '';
  const sub = `${esc(b.sponsor?.name || 'open')} · ${esc(b.category || 'misc')}${fee}`;
  return `<td class="marker">${String(index + 1).padStart(2, '0')}</td>
    <td><a class="bt" href="#/bounty/${encodeURIComponent(b.slug)}">${esc(b.title)}</a><span class="bm">${sub}</span></td>
    <td class="r"><span class="pot">${usd(potOf(b))}</span></td>
    <td class="r"><span class="closes${Date.parse(b.deadline) - Date.now() < 86400000 ? ' hot' : ''}">${timeLeft(b.deadline)}</span></td>
    <td class="r subs">${compact(subsOf(b))}</td>
    <td class="r act" title="${live ? `last entry ${live} ago` : 'no entry times in this payload'}">${live || '—'}</td>`;
}

function shellFor(state, total) {
  const filtered = FILTERS.find((f) => f.key === state.filter) || FILTERS[0];
  const chips = FILTERS.map((f) => `<button class="chip" data-filter="${f.key}" aria-pressed="${f.key === state.filter}">${f.label}</button>`).join('');
  const arrow = state.dir < 0 ? '↓' : '↑';
  const sortState = (key) => (state.sort === key ? (state.dir < 0 ? 'descending' : 'ascending') : 'none');
  return `<div class="kpis" id="kpis"></div>
    <div class="filters">${chips}<span class="count" id="bcount"></span></div>
    <table class="registry">
      <colgroup><col class="c-marker"><col><col class="c-pot"><col class="c-closes"><col class="c-subs"><col class="c-act"></colgroup>
      <thead><tr>
        <th>#</th><th>BOUNTY</th>
        <th class="r" aria-sort="${sortState('pot')}"><button class="sh" data-sort="pot" aria-label="Sort by live pot">POT ${state.sort === 'pot' ? arrow : ''}</button></th>
        <th class="r" aria-sort="${sortState('closes')}"><button class="sh" data-sort="closes" aria-label="Sort by closing time">CLOSES IN ${state.sort === 'closes' ? arrow : ''}</button></th>
        <th class="r" aria-sort="${sortState('subs')}"><button class="sh" data-sort="subs" aria-label="Sort by submission count">SUBS ${state.sort === 'subs' ? arrow : ''}</button></th>
        <th class="r">ACTIVITY</th>
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>
    <div class="loading" aria-live="polite">${filtered.label} · ${total} REGISTERED · CLICK A ROW TO OPEN ITS PANE</div>`;
}

function kpis(items) {
  const pot = items.reduce((n, b) => n + potOf(b), 0);
  const subs = items.reduce((n, b) => n + subsOf(b), 0);
  const closing = items.filter((b) => { const t = Date.parse(b.deadline) - Date.now(); return t > 0 && t < 86400000; }).length;
  return [['OPEN BOUNTIES', String(items.length), ''],
    ['LIVE POT', usd(pot), 'live'],
    ['ENTRIES', compact(subs), ''],
    ['CLOSING <24H', String(closing), '']]
    .map(([label, value, cls]) => `<div class="kpi"><label>${label}</label><b class="${cls}">${value}</b></div>`).join('');
}

export async function renderBoard(root, selectedSlug) {
  if (!root) return;
  let state = { filter: 'all', sort: 'pot', dir: -1 };
  const data = await cachedGet(`${API}/competitions?status=open&activity=times`, TTL.board);
  const items = data.items || [];

  patch(root, shellFor(state, items.length) + '<div class="err" hidden></div>');
  patch(root.querySelector('#kpis'), kpis(items));

  const tbody = root.querySelector('#rows');
  const painter = () => {
    const filtered = FILTERS.find((f) => f.key === state.filter) || FILTERS[0];
    const visible = sortBy(items.filter(filtered.test), state.sort, state.dir);
    patch(root.querySelector('#bcount'), `${visible.length} / ${items.length}`);
    if (!visible.length) {
      tbody.innerHTML = '<tr class="empty"><td colspan="6">NO MATCHING BOUNTIES · CHANGE THE FILTER</td></tr>';
      return;
    }
    keyed(tbody, visible, (b) => b.slug,
      (b) => { const tr = document.createElement('tr'); tr.tabIndex = 0; tr.innerHTML = boardRow(b, selectedSlug, visible.indexOf(b)); return tr; },
      (tr, b) => { tr.innerHTML = boardRow(b, selectedSlug, visible.indexOf(b)); });
    for (const tr of tbody.children) {
      const slug = tr.dataset.k;
      const on = slug === selectedSlug;
      tr.classList.toggle('sel', on);
      tr.setAttribute('aria-current', on ? 'true' : 'false');
      tr.dataset.slug = slug;
    }
  };
  painter();

  root.querySelectorAll('[data-filter]').forEach((btn) => btn.addEventListener('click', () => {
    state = { ...state, filter: btn.dataset.filter };
    root.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    painter();
  }));

  root.querySelectorAll('[data-sort]').forEach((btn) => btn.addEventListener('click', () => {
    const key = btn.dataset.sort;
    state = { ...state, sort: key, dir: state.sort === key ? -state.dir : key === 'closes' ? 1 : -1 };
    const arrow = state.dir < 0 ? '↓' : '↑';
    root.querySelectorAll('[data-sort]').forEach((b) => {
      b.textContent = b.textContent.replace(/ [↓↑]$/, '');
      if (b.dataset.sort === key) b.textContent += ` ${arrow}`;
    });
    painter();
  }));

  const open = (tr) => { if (tr?.dataset.slug) location.hash = `#/bounty/${encodeURIComponent(tr.dataset.slug)}`; };
  tbody.addEventListener('click', (e) => open(e.target.closest('tr[data-slug]')));
  tbody.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e.target.closest('tr[data-slug]')); } });
}
