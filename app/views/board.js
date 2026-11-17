// Board view: the registry is the first substantive element, no hero, no monument stats.
import { getBoard, loadCss } from '../api.js';
import { esc, usd, compact, ago, timeLeft, patch } from '../format.js';

export const FILTERS = ['ALL', 'LIVE', 'CLOSING24H', '$1K+'];

/** The faint "last entry Xm ago" signal, from whichever activity shape the API uses. */
function lastEntry(b) {
  const a = b.activity;
  let t = null;
  if (typeof a === 'string' || typeof a === 'number') t = a;
  else if (Array.isArray(a) && a.length) t = a[a.length - 1];
  if (t == null && Array.isArray(b.submissions) && b.submissions.length) {
    const last = b.submissions[b.submissions.length - 1];
    t = typeof last === 'string' || typeof last === 'number' ? last : (last?.created_at || last?.received_at || last?.at);
  }
  return ago(t);
}

const potOf = (b) => Number(b?.potUsd ?? b?.rewardAmount ?? 0);

/** Stable comparator used by the clickable column headers. */
export function sortBy(rows, key, dir = 'asc') {
  const get = {
    title: (b) => String(b.title || '').toLowerCase(),
    pot: potOf,
    closes: (b) => new Date(b.deadline).getTime(),
    subs: (b) => Number(b.submissionCount || 0),
  }[key] || (() => 0);
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    if (x < y) return -sign;
    if (x > y) return sign;
    return 0;
  });
}

/** One hairline registry row. Marker / bounty / pot / closes / subs / activity. */
export function boardRow(b, i) {
  const slug = encodeURIComponent(b.slug);
  const age = lastEntry(b);
  return `<tr data-slug="${esc(b.slug)}">
    <td class="faint num">${String(i + 1).padStart(2, '0')}</td>
    <td class="t"><a href="#/bounty/${slug}">${esc(b.title)}</a><div class="faint sub">${esc(b.slug)} <span class="mut">&middot;</span> ${esc(b.category || 'bounty')}</div></td>
    <td class="r lime t num">${esc(usd(potOf(b)))}</td>
    <td class="num">${esc(timeLeft(b.deadline))}</td>
    <td class="r num">${esc(compact(b.submissionCount))}</td>
    <td class="faint">${age ? `last entry ${esc(age)}` : ''}</td>
  </tr>`;
}

function applyFilter(rows, filter) {
  if (filter === 'LIVE') return rows.filter((b) => b.status === 'open');
  if (filter === 'CLOSING24H') {
    const cutoff = Date.now() + 86400000;
    return rows.filter((b) => new Date(b.deadline).getTime() <= cutoff);
  }
  if (filter === '$1K+') return rows.filter((b) => potOf(b) >= 1000);
  return rows;
}

/** Render the board into a host element. */
export async function renderBoard(host) {
  loadCss('./views/board.css');
  const data = await getBoard();
  const rows = data?.items || [];

  const pot = rows.reduce((sum, b) => sum + potOf(b), 0);
  const subs = rows.reduce((sum, b) => sum + Number(b.submissionCount || 0), 0);
  const closing = rows
    .map((b) => new Date(b.deadline).getTime() - Date.now())
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b)[0];
  const next = closing == null ? 'none' : timeLeft(new Date(Date.now() + closing).toISOString());

  patch(host, `
    <section class="kpis" aria-label="Live summary">
      <div class="kpi"><span class="k">OPEN BOUNTIES</span><span class="v">${rows.length}</span></div>
      <div class="kpi"><span class="k">TOTAL POT</span><span class="v live">${esc(usd(pot))}</span></div>
      <div class="kpi"><span class="k">ENTRIES</span><span class="v">${esc(compact(subs))}</span></div>
      <div class="kpi"><span class="k">NEXT CLOSE</span><span class="v">${esc(next)}</span></div>
    </section>
    <div class="chips" role="group" aria-label="Filter bounties">
      ${FILTERS.map((f, i) => `<button class="chip" data-filter="${f}" aria-pressed="${i === 0}">${f}</button>`).join('')}
      <span class="chip faint" id="rowcount">${rows.length} SHOWN</span>
    </div>
    <div class="tablewrap">
      <table class="tbl board-tbl">
        <thead><tr>
          <th style="width:44px">#</th>
          <th data-sort="title" role="button" tabindex="0">BOUNTY</th>
          <th class="r" data-sort="pot" role="button" tabindex="0">POT</th>
          <th data-sort="closes" role="button" tabindex="0">CLOSES IN</th>
          <th class="r" data-sort="subs" role="button" tabindex="0">SUBS</th>
          <th>ACTIVITY</th>
        </tr></thead>
        <tbody id="boardrows">${rows.map(boardRow).join('')}</tbody>
      </table>
    </div>
    <div class="board-foot faint mono">READ ONLY &middot; LIVE REGISTRY &middot; ${esc(rows.length)} OPEN</div>
  `);

  const tbody = host.querySelector('#boardrows');
  const count = host.querySelector('#rowcount');
  let current = FILTERS[0];
  let sortKey = null;
  let sortDir = 'asc';

  const draw = () => {
    let view = applyFilter(rows, current);
    if (sortKey) view = sortBy(view, sortKey, sortDir);
    patch(tbody, view.map(boardRow).join(''));
    count.textContent = `${view.length} SHOWN`;
    host.querySelectorAll('th[data-sort]').forEach((th) => {
      th.setAttribute('aria-sort', th.dataset.sort === sortKey ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  };

  host.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      current = btn.dataset.filter;
      host.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      draw();
    });
  });
  host.querySelectorAll('th[data-sort]').forEach((th) => {
    const go = () => {
      sortDir = sortKey === th.dataset.sort && sortDir === 'asc' ? 'desc' : 'asc';
      sortKey = th.dataset.sort;
      draw();
    };
    th.addEventListener('click', go);
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  tbody.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr');
    if (!tr) return;
    tbody.querySelectorAll('tr').forEach((r) => r.classList.remove('sel'));
    tr.classList.add('sel');
  });
}
