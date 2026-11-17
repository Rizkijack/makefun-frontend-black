// Profile view: account record, solutions and payouts as grouped tables.
import { getProfile, loadCss } from '../api.js';
import { esc, usd, ago, patch, compact } from '../format.js';
import { rate, isMicro } from './leaderboard.js';

/** One compact record line. */
export function recordLine(label, value) {
  return `<dt>${esc(label)}</dt><dd><span class="tnum">${esc(value)}</span></dd>`;
}

/** Solutions as a hairline table. */
export function solutionsList(solutions) {
  if (!solutions?.length) return '<p class="faint mono">no solutions on record</p>';
  return `<table class="tbl sol"><thead><tr><th>COMPETITION</th><th class="r">SCORE</th><th class="r">PRIZE</th><th class="r">ENTERED</th></tr></thead><tbody>
    ${solutions.map((s) => {
      const micro = isMicro({ key: s?.score?.column?.key, source: s?.score?.column?.source });
      const score = micro ? rate(s?.score?.value) : esc(s?.score?.display ?? s?.score?.value ?? '-');
      return `<tr><td class="t">${esc(s?.competition?.title || s?.title || 'solution')}<div class="faint sub">${esc(s?.competition?.slug || '')}</div></td>
        <td class="r num">${score}</td>
        <td class="r num">${s?.prize_usd ? esc(usd(s.prize_usd)) : '<span class="faint">&middot;</span>'}</td>
        <td class="r num faint">${esc(ago(s?.entered_at))}</td></tr>`;
    }).join('')}
  </tbody></table>`;
}

/** Payouts as a hairline table. */
export function payoutsList(payouts) {
  if (!payouts?.length) return '<p class="faint mono">no payouts yet</p>';
  return `<table class="tbl"><thead><tr><th>COMPETITION</th><th class="r">AMOUNT</th><th class="r">DATE</th></tr></thead><tbody>
    ${payouts.map((p) => `<tr><td class="t">${esc(p?.competition || p?.slug || 'payout')}</td><td class="r num lime">${esc(usd(p?.amount_usd ?? p?.amountUsd))}</td><td class="r num faint">${esc(p?.created_at ? p.created_at.slice(0, 10) : '-')}</td></tr>`).join('')}
  </tbody></table>`;
}

export async function renderProfile(host, handle) {
  loadCss('./views/profile.css');
  const p = await getProfile(handle);
  if (!p || !p.handle) {
    patch(host, `<p class="mono" style="color:var(--accent)">NO SUCH ACCOUNT: ${esc(handle)}</p>`);
    return;
  }
  const r = p.record || {};
  const avatar = p.avatar?.url || p.image;
  patch(host, `
    <div class="prof">
      <div class="prof-head">
        ${avatar ? `<img class="avatar" crossorigin="anonymous" alt="" width="56" height="56" src="${esc(avatar)}">` : '<div class="avatar ph faint mono">&middot;</div>'}
        <div>
          <div class="prof-name">${esc(p.display_name || p.handle)}</div>
          <div class="prof-handle mono">@${esc(p.handle)}</div>
          <div class="prof-bio">${esc(p.bio || '')}</div>
        </div>
        <div class="prof-meta mono faint">JOINED ${esc(p.joined_at ? p.joined_at.slice(0, 10) : '?')}<br>WALLET ${esc(p.wallet?.address ? `${p.wallet.address.slice(0, 6)}…${p.wallet.address.slice(-4)}` : '-')}</div>
      </div>
      <div class="prof-kpis">
        <div class="kpi"><span class="k">ENTERED</span><span class="v">${esc(compact(r.competitions_entered))}</span></div>
        <div class="kpi"><span class="k">PLACED</span><span class="v">${esc(compact(r.competitions_placed))}</span></div>
        <div class="kpi"><span class="k">WON</span><span class="v">${esc(compact(r.competitions_won))}</span></div>
        <div class="kpi"><span class="k">PRIZES</span><span class="v lime">${esc(usd(r.prize_usd))}</span></div>
      </div>
      <div class="prof-grid">
        <section><div class="sec-label mono">RECORD</div><dl class="group">
          ${recordLine('Best place', r.best_placement ? `#${r.best_placement}` : '-')}
          ${recordLine('Podiums', r.podium_finishes ?? 0)}
          ${recordLine('Other places', r.other_placements ?? 0)}
          ${recordLine('Prize USD', usd(r.prize_usd))}
        </dl></section>
        <section><div class="sec-label mono">SOLUTIONS <span class="faint">&middot;</span> ${(p.solutions || []).length}</div>${solutionsList(p.solutions)}</section>
        <section><div class="sec-label mono">PAYOUTS</div>${payoutsList(p.payouts)}</section>
      </div>
    </div>
  `);
}
