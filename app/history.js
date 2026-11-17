// Rank-over-time chart: five real lines from standings/history, drawn as inline SVG.
import { esc } from './format.js';
import { API, TTL, cachedGet } from './main.js';

const W = 560;
const PAD = { l: 24, r: 96, t: 12, b: 20 };

function pathFor(places, n, maxPlace, h) {
  let d = '', pen = false;
  for (let i = 0; i < n; i++) {
    const p = places?.[i];
    if (p == null) { pen = false; continue; }
    const x = PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
    const y = PAD.t + ((p - 1) / Math.max(1, maxPlace - 1)) * (h - PAD.t - PAD.b);
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

function lastPoint(places, n, maxPlace, h) {
  for (let i = n - 1; i >= 0; i--) {
    const p = places?.[i];
    if (p != null) {
      return {
        x: PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r),
        y: PAD.t + ((p - 1) / Math.max(1, maxPlace - 1)) * (h - PAD.t - PAD.b),
      };
    }
  }
  return null;
}

export async function renderHistory(root, slug, compact = false) {
  if (!root) return;
  let data;
  try { data = await cachedGet(`${API}/competitions/${encodeURIComponent(slug)}/standings/history`, TTL.live); }
  catch (error) { root.innerHTML = `<div class="err">HISTORY ${esc(error.message)}</div>`; return; }

  const at = data.at_ms || [];
  const lines = (data.lines || []).slice(0, 5);
  const n = at.length;
  const h = compact ? 150 : 230;
  if (!n || !lines.length) { root.innerHTML = '<div class="loading">NO RANK HISTORY YET</div>'; return; }
  const maxPlace = Math.max(5, ...lines.flatMap((l) => (l.places || []).filter((v) => v != null)));

  const grid = [];
  const step = maxPlace <= 10 ? 1 : maxPlace <= 20 ? 2 : 5;
  for (let p = 1; p <= maxPlace; p += step) {
    const y = PAD.t + ((p - 1) / Math.max(1, maxPlace - 1)) * (h - PAD.t - PAD.b);
    grid.push(`<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text x="${PAD.l - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end">${p}</text>`);
  }

  const paths = lines.map((l, i) => {
    const d = pathFor(l.places, n, maxPlace, h);
    if (!d) return '';
    const end = lastPoint(l.places, n, maxPlace, h);
    return `<path class="ln ${i === 0 ? 'a' : `d${i}`}" d="${d}"><title>${esc(l.handle)} · place ${esc(l.place ?? '—')} · ${esc(l.display ?? '')}</title></path>
      ${end ? `<circle cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="${i === 0 ? 2.6 : 1.8}" fill="${i === 0 ? 'var(--fg)' : 'var(--muted)'}"/>${i < 3 ? `<text x="${(end.x + 5).toFixed(1)}" y="${(end.y + 2.5 + i * 3.5).toFixed(1)}">${esc(l.handle)}</text>` : ''}` : ''}`;
  }).join('');

  const stamp = (ms) => new Date(ms).toISOString().slice(5, 16).replace('T', ' ');
  const phase = data.phase?.key ? `${data.phase.key.toUpperCase()} PHASE` : 'PHASE';
  root.innerHTML = `<div class="blk"><h3>RANK HISTORY · ${n} SAMPLES · ${phase}</h3>
    <svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="Rank history for the top five entries, ${n} samples">
      ${grid.join('')}
      ${paths}
      <text x="${PAD.l}" y="${h - 5}">${stamp(at[0])}Z</text><text x="${W - PAD.r}" y="${h - 5}" text-anchor="end">${stamp(at[n - 1])}Z</text>
    </svg>
    ${compact ? '' : `<div class="lbfoot">RANK OVER TIME · Y = PLACE (1 AT TOP) · X = ${n} SAMPLE TIMESTAMPS · LEGEND VALUES AT LAST SAMPLE · TOP ${lines.length} OF ${(data.lines || []).length} ENTRIES</div>`}
    <div class="legend" style="margin-top:5px">${lines.map((l, i) => `<span><i class="sw${i ? ' m' : ''}"></i>${esc(l.handle)} · ${esc(l.display || `P${l.place}`)}</span>`).join('')}</div>
  </div>`;
}
