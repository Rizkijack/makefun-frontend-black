// Profile: public record, entries and payouts. Read-only, no external assets.
import { ago, compact, esc, usd } from './format.js';
import { API, TTL, cachedGet } from './core.js';

const day = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '—');
const prize = (v) => (v == null ? '—' : usd(v));

export function recordLine(record) {
  const r = record || {};
  return [
    `${r.competitions_entered ?? 0} ENTERED`,
    `${r.competitions_placed ?? 0} PLACED`,
    `${r.competitions_won ?? 0} WON`,
    `BEST ${r.best_placement ? `#${r.best_placement}` : '—'}`,
    `${usd(r.prize_usd ?? 0)} PRIZE`,
  ].join(' · ');
}

export function solutionsList(solutions) {
  const rows = (solutions || []).map((s) => {
    const c = s.competition || {};
    const score = s.score ? `${esc(s.score.column?.title || s.score.column?.key || 'SCORE')} ${esc(s.score.display ?? s.score.value ?? '—')}` : '—';
    return `<tr><td class="rk">${s.placement ? `#${s.placement}` : '—'}</td>
      <td><a class="bt" href="#/bounty/${encodeURIComponent(c.slug || '')}">${esc(s.title || 'untitled entry')}</a><span class="bm">${esc(c.title || c.slug || '—')} · ${esc((c.status || '—').toUpperCase())} · ${esc(day(c.deadline))}</span></td>
      <td class="num">${esc(score)}</td>
      <td class="num">${prize(s.prize_usd)}</td>
      <td class="num">${esc(ago(s.entered_at).toUpperCase())}</td></tr>`;
  }).join('');
  if (!rows) return '<div class="loading">NO PUBLIC ENTRIES</div>';
  return `<div class="lbwrap"><table class="lb solutions"><thead><tr><th>#</th><th>ENTRY</th><th>SCORE</th><th>PRIZE</th><th>AGE</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function payoutsList(payouts) {
  const rows = (payouts || []).map((p) => {
    const c = p.competition || {};
    const sig = p.signature ? `${String(p.signature).slice(0, 8)}…${String(p.signature).slice(-6)}` : '—';
    return `<tr><td class="num">${usd(p.amount_usd ?? 0)}</td><td class="num">${p.place ? `#${p.place}` : '—'}</td>
      <td><a class="bt" href="#/bounty/${encodeURIComponent(c.slug || '')}">${esc(c.title || c.slug || 'payout')}</a><span class="bm">${esc((p.source || 'escrow').toUpperCase())} · ${esc(day(p.paid_at))} · TX ${esc(sig)}</span></td></tr>`;
  }).join('');
  if (!rows) return '<div class="loading">NO PUBLIC PAYOUTS</div>';
  return `<table class="rw payouts"><thead><tr><th>AMOUNT</th><th>PLACE</th><th>COMPETITION</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export async function renderProfile(root, handle) {
  if (!root) return;
  let p;
  let v = null;
  try {
    [p, v] = await Promise.all([
      cachedGet(`${API}/profiles/${encodeURIComponent(handle)}`, TTL.profile),
      cachedGet(`${API}/profiles/${encodeURIComponent(handle)}/views`, TTL.live).catch(() => null),
    ]);
  } catch (error) {
    root.innerHTML = `<div class="prof"><div class="err"><b>NO SUCH ACCOUNT</b> · @${esc(handle)} · ${esc(error.message)}</div></div>`;
    return;
  }
  if (!p || !p.handle) {
    root.innerHTML = `<div class="prof"><div class="err"><b>NO SUCH ACCOUNT</b> · @${esc(handle)}</div></div>`;
    return;
  }

  const face = p.avatar?.url || p.image;
  const pic = `${API}/profiles/${encodeURIComponent(handle)}/picture.png`;
  const initials = esc(String(p.handle).slice(0, 2).toUpperCase());
  const fallback = face && String(face).startsWith('/') ? `https://make.fun${esc(face)}` : '';
  // crossorigin must be set before src so the PNG request stays CORS-clean.
  const avatar = `<img class="avatar" crossorigin="anonymous" src="${esc(pic)}"${fallback ? ` data-face="${fallback}"` : ''} data-initials="${initials}" alt="" width="40" height="40">`;
  const tags = [p.house ? 'HOUSE' : 'HUNTER', p.demo ? 'DEMO' : '', p.wallet ? 'WALLET' : ''].filter(Boolean).map((t) => `<span class="k">${t}</span>`).join('');
  const views = v ? `<span class="label">VIEWS</span><b>${compact(v.view_count || 0)} PROFILE · ${compact(v.entry_view_count || 0)} ENTRY · ${compact(v.agent_read_count || 0)} AGENT</b>` : '';

  root.innerHTML = `<div class="prof">
    <header class="prof-head">${avatar}
      <div><div class="prof-name">${esc(p.display_name || p.handle)}</div>
        <div class="prof-h">@${esc(p.handle)} ${tags} · JOINED ${esc(day(p.joined_at))} · <a href="https://make.fun${esc(p.profile_url || `/u/${p.handle}`)}" rel="noreferrer">SOURCE ↗</a></div>
        ${p.bio ? `<p class="prof-bio">${esc(p.bio)}</p>` : ''}
      </div></header>
    <div class="prof-body">
      <div class="kpis prof-kpis"><div class="kpi"><label>RECORD</label><b>${esc(recordLine(p.record))}</b></div></div>
      ${views ? `<div class="blk views-line">${views}</div>` : ''}
      <div class="blk"><h3>ENTRIES · ${(p.solutions || []).length}</h3>${solutionsList(p.solutions)}</div>
      <div class="blk"><h3>PAYOUTS · ${(p.payouts || []).length}</h3>${payoutsList(p.payouts)}</div>
      <p class="meta-line">PUBLIC PROFILE FROM THE MAKE.FUN API · AVATARS SERVED BY MAKE.FUN · READ ONLY</p>
    </div></div>`;

  // Fallback chain: picture.png → avatar.url → initials. No onerror attribute.
  const img = root.querySelector('.avatar');
  if (img) {
    const swap = () => {
      const face = img.dataset.face;
      if (face) { img.removeAttribute('data-face'); img.src = face; return; }
      img.removeEventListener('error', swap);
      const badge = document.createElement('div');
      badge.className = 'mono-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = img.dataset.initials || '';
      img.replaceWith(badge);
    };
    img.addEventListener('error', swap);
    if (img.complete && img.naturalWidth === 0) swap();
  }
}
