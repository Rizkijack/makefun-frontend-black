// Dynamic leaderboard: columns, views and values come from the API, not from fixed labels.
import { compact, esc } from './format.js';
import { API, REQUEST_STATS, TTL, cachedGet, revalidate } from './core.js';

const ROW_H = 30;
const WINDOW = 40;

export function virtualRows(rows, start, size = WINDOW) {
  return rows.slice(start, start + size);
}

const isRate = (c) => /_micro|win_rate|interval_(low|high)/.test(c.source || '') || /rate/i.test(c.title || '') || c.key === 'judge';
const isBytes = (c) => c.key === 'bytes' || /artifact_bytes/.test(c.source || '');

export function dynamicColumns(columns) {
  return (columns || []).filter((c) => !c.hidden).map((c) => ({
    ...c,
    text(value) {
      if (value === null || value === undefined || value === '') return '·';
      if (isRate(c)) return `${(Number(value) / 10000).toFixed(1)}%`;
      if (isBytes(c)) return compact(value);
      if (c.key === 'valid') return Number(value) === 1 ? '✓' : String(value);
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      if (Number.isInteger(n)) return n.toLocaleString('en-US');
      return n.toFixed(Math.min(c.precision || 1, 2));
    },
  }));
}

function merge(data, cols) {
  const first = data.entries || [];
  const rest = (data.rest || []).map((r) => {
    const values = { [data.rank_key || cols[0]?.key]: Number(r.value) };
    if (r.interval) {
      const low = cols.find((c) => /low/i.test(c.key));
      const high = cols.find((c) => /high/i.test(c.key));
      if (low) values[low.key] = Number(r.interval.low);
      if (high) values[high.key] = Number(r.interval.high);
    }
    const valid = cols.find((c) => c.key === 'valid');
    if (valid && r.judged) values[valid.key] = 1;
    return { ...r, values, display: { [data.rank_key || cols[0]?.key]: r.display } };
  });
  return [...first, ...rest].sort((a, b) => (a.rank || 0) - (b.rank || 0));
}

function header(cols) {
  return `<tr><th>#</th><th>ENTRY</th>${cols.map((c) => `<th title="${esc(c.title)}">${esc(c.title)}</th>`).join('')}<th title="live likes and views">LIVE</th></tr>`;
}

function cell(c, e) {
  const value = e.values?.[c.key] ?? e.display?.[c.key];
  return c.text(value);
}

function row(e, cols, counts) {
  const id = e.submission_id;
  const like = id != null ? counts.likes[id] ?? 0 : 0;
  const view = id != null ? counts.views[id] ?? 0 : 0;
  const handle = esc(e.handle || '—');
  const who = id != null ? `<a class="hd" href="#/entry/${encodeURIComponent(id)}" title="${esc(e.handle)}">${handle}</a>` : `<span class="hd" title="${handle}">${handle}</span>`;
  return `<tr><td class="rk">${e.rank ?? '·'}</td><td>${who}<span class="tt" title="${esc(e.title || '')}">${esc(e.title || (e.house ? 'house entry' : 'submission'))}</span></td>${cols.map((c) => `<td class="num">${esc(cell(c, e))}</td>`).join('')}<td class="soc" title="live likes ♥ and views ◉">♥ ${like} ◉ ${view}</td></tr>`;
}

export async function renderLeaderboard(root, slug) {
  if (!root) return;
  const base = `${API}/competitions/${encodeURIComponent(slug)}/leaderboard`;
  const likesP = cachedGet(`${API}/competitions/${encodeURIComponent(slug)}/likes`, TTL.live).catch(() => ({ counts: {} }));
  const viewsP = cachedGet(`${API}/competitions/${encodeURIComponent(slug)}/views`, TTL.live).catch(() => ({ counts: {} }));
  const [likes, views] = await Promise.all([likesP, viewsP]);
  const counts = { likes: likes.counts || {}, views: views.counts || {} };
  root.insertAdjacentHTML('beforeend', '<div id="lbhost"></div>');
  const host = root.querySelector('#lbhost');
  let view = 'overall';

  const paint = async () => {
    const url = view === 'overall' ? `${base}?rows=first&view=overall` : `${base}?view=${encodeURIComponent(view)}`;
    let data;
    try { data = await cachedGet(url, TTL.leaderboard); }
    catch (error) { host.innerHTML = `<div class="err">LEADERBOARD ${esc(error.message)}</div>`; return; }
    const cols = dynamicColumns(data.columns);
    const entries = merge(data, cols);
    const modes = data.views || ['overall'];
    const interval = data.interval ? (typeof data.interval === 'string' ? data.interval : JSON.stringify(data.interval)) : '—';
    host.innerHTML = `<div class="lbview">${modes.map((v) => `<button class="chip" data-lbview="${esc(v)}" aria-pressed="${v === view}">${esc(v.toUpperCase())}</button>`).join('')}<span class="count">${entries.length} RANKED · ${WINDOW} IN WINDOW</span></div>
      <div class="lbwrap" id="lbwrap"><table class="lb"><thead>${header(cols)}</thead><tbody id="lbbody"></tbody></table></div>
      <div class="lbfoot">RANK KEY ${esc(data.rank_key || '—')} · QUOTE ${esc(data.quote || '—')} · INTERVAL ${esc(interval)} · <span title="live likes ♥ and views ◉">SOCIAL COUNTS ARE LIVE</span></div>
      <div class="cache-strip"><span>REQUEST <b class="pipe">→</b> CACHE <b class="pipe">→</b> REVALIDATE</span><b>REQ ${REQUEST_STATS.req}</b><b>CACHE ${REQUEST_STATS.cache}</b><b>REVAL ${REQUEST_STATS.reval}</b><button data-lbreval="${esc(url)}">REVALIDATE TABLE</button></div>`;

    const wrap = host.querySelector('#lbwrap');
    const body = host.querySelector('#lbbody');
    const span = cols.length + 3;
    host.querySelector('.lb')?.setAttribute('aria-rowcount', String(entries.length + 1));
    const draw = () => {
      if (!entries.length) {
        body.innerHTML = `<tr class="empty"><td colspan="${span}">NO RANKED ENTRIES IN THIS VIEW</td></tr>`;
        return;
      }
      const maxStart = Math.max(0, entries.length - WINDOW);
      const start = Math.max(0, Math.min(maxStart, Math.floor(wrap.scrollTop / ROW_H) - 8));
      const rows = virtualRows(entries, start);
      const top = start * ROW_H;
      const bottom = Math.max(0, (entries.length - start - rows.length) * ROW_H);
      body.innerHTML = `${top ? `<tr class="spacer"><td colspan="${span}" style="height:${top}px"></td></tr>` : ''}${rows.map((e) => row(e, cols, counts)).join('')}${bottom ? `<tr class="spacer"><td colspan="${span}" style="height:${bottom}px"></td></tr>` : ''}`;
    };
    draw();
    wrap.addEventListener('scroll', draw, { passive: true });
    host.querySelectorAll('[data-lbview]').forEach((btn) => btn.addEventListener('click', async () => {
      view = btn.dataset.lbview;
      await paint();
    }));
    host.querySelector('[data-lbreval]')?.addEventListener('click', async (e) => {
      e.currentTarget.textContent = 'REVALIDATING…';
      try { await revalidate(url); } catch { /* keep cache */ }
      await paint();
    });
  };
  await paint();
}
