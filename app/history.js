// Real rank-over-time chart from /standings/history, inline SVG.
import { cachedGet, cacheStrip } from './cache.js';
import { esc, tnum } from './util.js';

const PALETTE = ['#c8f54a', '#8a9a8a', '#b0b8b0', '#6f7a6f', '#9aa29a'];

export function renderHistoryData(h) {
  const n = h.at_ms?.length ?? 0;
  const lines = (h.lines ?? []).slice(0, 5);
  const W = 600, H = 180;
  const x = i => n < 2 ? 0 : Math.round(i / (n - 1) * W);
  const y = place => {
    const p = Number(place) || 999;
    return Math.min(H, Math.max(0, Math.round((p - 1) / 11 * H)));
  };
  const grid = [0, 1, 2, 3, 4].map(k =>
    `<line class="grid-l" x1="0" x2="${W}" y1="${k * H / 4}" y2="${k * H / 4}"/>`).join('');
  const paths = lines.map((l, li) => {
    const pts = (l.places ?? []).map((p, i) => p == null ? null : `${x(i)},${y(p)}`).filter(Boolean).join(' ');
    return `<polyline class="l${li === 0 ? ' top' : ''}" stroke="${PALETTE[li]}" points="${pts}"/>`;
  }).join('');
  const legend = lines.map((l, li) =>
    `<span class="${li === 0 ? 'top' : ''}"><i style="background:${PALETTE[li]}"></i>#${l.place} ${esc(l.handle)} ${esc(l.display ?? '')}</span>`).join('');
  return `<div class="cap"><b>RANK HISTORY</b><span>${n} SAMPLES · ${lines.length} LINES · LIVE</span></div>
    <svg class="hist" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="rank over time">${grid}${paths}</svg>
    <div class="legend">${legend}</div>
    <div class="quote">PHASE ${esc(h.phase?.key ?? '—')} · ${n} SAMPLES · ${cacheStrip()}</div>`;
}

export async function renderHistory(slug, el) {
  const h = await cachedGet(`/competitions/${encodeURIComponent(slug)}/standings/history`, 60000);
  el.innerHTML = renderHistoryData(h);
}
