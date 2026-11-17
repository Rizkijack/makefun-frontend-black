// Live leaderboard: columns rendered from API metadata, view switcher, likes/views glyphs.
import { cachedGet, cacheStrip } from './cache.js';
import { esc, tnum, compact } from './util.js';

const API = '/competitions/';
const MICRO = /_micro$/;

// Values with a _micro source are millionths: 956066 / 1e6 = 0.956066 -> 95.6%.
function rate(v) {
  return (Number(v) / 1e4).toFixed(1) + '%';
}
function cell(entry, col) {
  const micro = !!col.source && MICRO.test(col.source);
  let v = entry?.values?.[col.key];
  // rest[] rows carry a single `value` instead of a values{} map.
  if (v == null && micro && Number.isFinite(Number(entry?.value))) v = entry.value;
  if (v == null) return entry?.display?.[col.key] ?? entry?.display ?? '—';
  if (micro) return rate(v);
  if (col.key === 'bytes') return compact(v) + 'B';
  return tnum(v);
}

// Header built ONLY from the API's column metadata.
export function dynamicColumns(columns = []) {
  return columns.filter(c => !c.hidden).map(c =>
    `<th data-col="${esc(c.key)}" title="${esc(c.title)}">${esc(c.title)}</th>`).join('');
}

// Merge entries + rest, window ~40 rows, then a spacer.
export function virtualRows(rows, columns, likes, views, limit = 40) {
  const shown = rows.slice(0, limit);
  const head = `<tr><th>RANK</th><th>ENTRANT</th><th>LIVE ♥ / ◉</th>${dynamicColumns(columns)}</tr>`;
  const body = shown.map((e, i) => {
    const lk = likes.counts?.[e.submission_id] ?? 0;
    const vw = views.counts?.[e.submission_id] ?? 0;
    const img = e.image ? `<img class="av" crossorigin="anonymous" src="https://make.fun${esc(e.image)}" alt="">` : '';
    const cells = columns.filter(c => !c.hidden).map(c => `<td class="r">${cell(e, c)}</td>`).join('');
    return `<tr><td class="h">${e.rank ?? i + 1}</td>
      <td class="title" title="${esc(e.title ?? '')}">${img}${esc(e.handle ?? 'anon')}</td>
      <td class="glyph">♥ ${lk} · ◉ ${vw}</td>${cells}</tr>`;
  }).join('');
  const rest = rows.length - shown.length;
  return `<table class="lbt"><thead>${head}</thead><tbody>${body}</tbody></table>
    ${rest > 0 ? `<div class="more">+ ${tnum(rest)} MORE ENTRIES · WINDOW 40 · SCROLL API FOR FULL SET</div>` : ''}`;
}

async function load(slug, view, el, likes, views) {
  const d = await cachedGet(`${API}${encodeURIComponent(slug)}/leaderboard?rows=first&view=${encodeURIComponent(view)}`, 60000);
  const rows = [...(d.entries ?? []), ...(d.rest ?? [])];
  const sw = `<div class="vsw" role="group" aria-label="Leaderboard views">${(d.views ?? []).map(v =>
    `<button data-view="${esc(v)}" class="${v === d.view ? 'on' : ''}">${esc(v.toUpperCase())}</button>`).join('')}</div>`;
  el.innerHTML = `<div class="cap"><b>LIVE STANDINGS</b><span>${esc(d.title ?? 'Results')} · ${tnum(rows.length)} ENTRIES</span></div>
    ${sw}<div class="lbt-wrap">${virtualRows(rows, d.columns ?? [], likes, views)}</div>
    <div class="quote">RANK KEY ${esc(d.rank_key ?? '—')} · INTERVAL ${d.interval ? esc(String(d.interval.level ?? d.interval)) : 'LIVE'} · ${d.quote ? '“' + esc(d.quote) + '”' : 'NO QUOTE'} · ${cacheStrip()}</div>`;
  for (const b of el.querySelectorAll('[data-view]'))
    b.addEventListener('click', () => load(slug, b.dataset.view, el, likes, views));
}

export async function renderLeaderboard(slug, el, likes = { counts: {} }, views = { counts: {} }) {
  await load(slug, 'overall', el, likes, views);
}
