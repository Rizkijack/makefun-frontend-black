// Dynamic leaderboard. Columns come from API metadata, never hardcoded. Two row shapes exist:
//   entries[] -> { values:{judge, judge_low, judge_high, valid, bytes}, ... }
//   rest[]    -> { value, display, interval:{low,high}, rank, ... } (NO values map)
// A single top-level value must never be reused for every column.
import { getLeaderboard, getLikes, getViews, loadCss } from '../api.js';
import { esc, compact, patch } from '../format.js';

/** Millionths of a rate -> one-decimal percent. 947787 -> 94.8%, 951972 -> 95.2%. */
export function rate(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '<span class="faint">&middot;</span>';
  return `${(n / 1e6 * 100).toFixed(1)}%`;
}

/** A column is a rate column when its source is a *_micro metric (or its key says so). */
export function isMicro(col) {
  const key = String(col?.key || '');
  const source = String(col?.source || '');
  return source.includes('_micro') || /^(judge|rate|win|score)/i.test(key);
}

/** Visible columns in API order. */
export function dynamicColumns(cols) {
  return (cols || []).filter((c) => !c.hidden).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/**
 * Render one cell for either row shape.
 * - entries[]: prefer entry.values[col.key].
 * - rest[]: rank-key from entry.value, interval columns from entry.interval.low/high.
 * - non-rate columns: their own field only, otherwise a faint dot. NEVER entry.value.
 */
export function cell(entry, col, rankKey) {
  const k = String(col?.key || '');
  if (isMicro(col)) {
    let raw;
    const values = entry?.values;
    if (values && Object.hasOwn(values, k)) raw = values[k];
    else if (/low/i.test(k)) raw = entry?.interval?.low;
    else if (/high/i.test(k)) raw = entry?.interval?.high;
    else if (k === rankKey || /judge|rate|win|score/i.test(k)) raw = entry?.value;
    return rate(raw);
  }
  const values = entry?.values;
  if (values && Object.hasOwn(values, k)) {
    const raw = values[k];
    if (/byte|size/i.test(k)) return esc(compact(raw));
    return esc(raw);
  }
  if (entry && Object.hasOwn(entry, k) && typeof entry[k] !== 'object' && entry[k] != null) {
    return esc(entry[k]);
  }
  return '<span class="faint">&middot;</span>';
}

function glyphs(id, likes, views) {
  const l = likes?.[id];
  const v = views?.[id];
  return `<span class="glyph" title="live likes and views">&#9829;${l == null ? '&middot;' : esc(l)} <span class="faint">&#9673;${v == null ? '&middot;' : esc(v)}</span></span>`;
}

function rowHtml(entry, i, cols, rankKey, likes, views) {
  const rank = entry?.rank ?? i + 1;
  const handle = esc(entry?.handle || 'anon');
  const title = esc(String(entry?.title || '').slice(0, 90));
  const cells = cols.map((c) => `<td class="r num">${cell(entry, c, rankKey)}</td>`).join('');
  return `<tr>
    <td class="faint num r">${rank}</td>
    <td class="t"><a href="#/u/${encodeURIComponent(entry?.handle || '')}">${handle}</a><div class="faint sub">${title}</div></td>
    ${cells}
    <td class="r glyphs">${glyphs(entry?.submission_id, likes, views)}</td>
  </tr>`;
}

/** Windowed rows with top/bottom spacers so 400+ rest rows stay cheap. */
export function virtualRows(rows, render, start = 0, count = 40) {
  const slice = rows.slice(start, start + count);
  const before = Math.max(0, start) * 25;
  const after = Math.max(0, rows.length - start - count) * 25;
  return `<div class="vspacer" style="height:${before}px"></div>`
    + slice.map(render).join('')
    + `<div class="vspacer" style="height:${after}px"></div>`;
}

/** Render the standings pane for one competition view. */
export async function renderLeaderboard(host, slug, view = 'overall') {
  loadCss('./views/leaderboard.css');
  const [data, likeData, viewData] = await Promise.all([
    getLeaderboard(slug, view),
    getLikes(slug),
    getViews(slug),
  ]);
  const cols = dynamicColumns(data?.columns);
  const rankKey = data?.rank_key || cols[0]?.key;
  const rows = [...(data?.entries || []), ...(data?.rest || [])];
  const likes = likeData?.counts || {};
  const views = viewData?.counts || {};
  const viewsList = data?.views || [view];

  patch(host, `
    <div class="lb-head">
      <div class="lb-title">${esc(data?.title || 'Results')} <span class="faint mono">${esc(data?.phase?.title || '')}</span></div>
      <div class="viewswitch" role="group" aria-label="Leaderboard view">
        ${viewsList.map((v) => `<button class="chip" data-view="${esc(v)}" aria-pressed="${v === view}">${esc(v.toUpperCase())}</button>`).join('')}
      </div>
    </div>
    <div class="lb-cap faint mono">RANKED &middot; ${rows.length} ROWS &middot; VIEW ${esc(view.toUpperCase())} &middot; LIVE COUNTS</div>
    <div class="tablewrap lb-wrap">
      <table class="tbl lb-tbl">
        <thead id="lbhead"><tr><th class="r" style="width:46px">#</th><th>ENTRY</th>
          ${cols.map((c) => `<th class="r" title="${esc(c.source || c.key)}">${esc(c.title)}</th>`).join('')}
          <th class="r">&#9829; / &#9673;</th>
        </tr></thead>
        <tbody id="lbrows"></tbody>
      </table>
    </div>
    <div class="lb-foot faint mono">QUOTE ${esc(data?.quote || 'none')} &middot; INTERVAL ${esc(data?.interval ? JSON.stringify(data.interval) : 'withheld')}</div>
  `);

  const tbody = host.querySelector('#lbrows');
  const thead = host.querySelector('#lbhead');
  const draw = (c = cols, r = rows, k = rankKey) => {
    patch(thead, `<tr><th class="r" style="width:46px">#</th><th>ENTRY</th>
      ${c.map((col) => `<th class="r" title="${esc(col.source || col.key)}">${esc(col.title)}</th>`).join('')}
      <th class="r">&#9829; / &#9673;</th></tr>`);
    patch(tbody, virtualRows(r, (e, i) => rowHtml(e, i, c, k, likes, views), 0, 40));
  };
  draw();

  host.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = btn.dataset.view;
      if (next === view) return;
      view = next;
      host.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      const fresh = await getLeaderboard(slug, view);
      const nCols = dynamicColumns(fresh?.columns);
      const nRank = fresh?.rank_key || nCols[0]?.key;
      const nRows = [...(fresh?.entries || []), ...(fresh?.rest || [])];
      host.querySelector('.lb-cap').textContent = `RANKED · ${nRows.length} ROWS · VIEW ${view.toUpperCase()} · LIVE COUNTS`;
      draw(nCols, nRows, nRank);
    });
  });
}

/** Self-test aid: rendered cell strings for one row across all columns (Node/console use). */
export function selfTestRow(entry, cols, rankKey) {
  return cols.map((c) => `${c.key}=${cell(entry, c, rankKey)}`).join(' | ');
}
