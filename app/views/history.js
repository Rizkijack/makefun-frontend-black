// Standings history: a real multi-line rank-over-time chart from the live API,
// drawn as inline SVG. Loaded only when the HISTORY tab opens.
import { getHistory, loadCss } from '../api.js';
import { esc, patch } from '../format.js';

const PALETTE = ['var(--accent)', 'oklch(.72 .12 210)', 'oklch(.72 .10 30)', 'oklch(.70 .09 300)', 'oklch(.66 .08 160)'];

/** Project ranks[][] into SVG polylines. Top 5 lines, x from sample index, y = rank. */
export function renderHistory(host, slug) {
  loadCss('./views/history.css');
  return getHistory(slug).then((data) => {
    const lines = (data?.lines || []).slice(0, 5);
    const n = data?.at_ms?.length || lines[0]?.ranks?.length || 0;
    const maxRank = Math.max(10, ...lines.flatMap((l) => (l.ranks || []).filter((x) => x != null)));
    const W = 1000, H = 320, PAD = 28;
    const x = (i) => PAD + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD * 2));
    const y = (r) => PAD + ((r - 1) / Math.max(1, maxRank - 1)) * (H - PAD * 2);
    const paths = lines.map((line, li) => {
      const pts = (line.ranks || [])
        .map((r, i) => (r == null ? null : `${x(i).toFixed(1)},${y(r).toFixed(1)}`))
        .filter(Boolean)
        .join(' ');
      return `<polyline points="${pts}" fill="none" stroke="${PALETTE[li]}" stroke-width="1.6" opacity="${li === 0 ? 1 : 0.72}" vector-effect="non-scaling-stroke"/>`;
    }).join('');
    const legend = lines.map((l, i) =>
      `<span class="hkey"><i style="background:${PALETTE[i]}"></i>${esc(l.handle)} <span class="faint">#${esc(l.rank ?? l.place)}</span></span>`).join('');
    patch(host, `
      <div class="hist-cap mono">RANK HISTORY <span class="faint">&middot;</span> ${n} SAMPLES <span class="faint">&middot;</span> TOP ${lines.length} ENTRIES</div>
      <div class="hist-plot">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Rank over time for top entries">
          ${[1, Math.ceil(maxRank / 2), maxRank].map((r) => `<line x1="${PAD}" x2="${W - PAD}" y1="${y(r)}" y2="${y(r)}" stroke="var(--border)" stroke-width="1" vector-effect="non-scaling-stroke"/><text x="2" y="${y(r) + 3}" fill="var(--faint)" font-size="11" font-family="var(--mono)">${r}</text>`).join('')}
          ${paths}
        </svg>
      </div>
      <div class="hist-legend mono">${legend || '<span class="faint">no history yet</span>'}</div>
      <div class="hist-foot faint mono">X = SAMPLE INDEX <span class="faint">&middot;</span> Y = RANK (1 AT TOP) <span class="faint">&middot;</span> PHASE ${esc(data?.phase?.key || 'dev')}</div>
    `);
  });
}
