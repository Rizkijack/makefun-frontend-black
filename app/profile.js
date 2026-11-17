// Public profile: record, solutions, payouts as grouped tables.
import { cachedGet, cacheStrip } from './cache.js';
import { esc, usd, tnum, ago } from './util.js';
import { loadStyles } from './ui.js';
import { mount, setCrumb, setStats } from './router.js';
import { groupedTable } from './bounty.js';

export function recordLine(r = {}) {
  return groupedTable([
    ['ENTERED', tnum(r.competitions_entered)], ['PLACED', tnum(r.competitions_placed)],
    ['WON', tnum(r.competitions_won)], ['BEST', r.best_placement ? '#' + r.best_placement : '—'],
    ['PRIZES', usd(r.prize_usd)],
  ]);
}

export function solutionsList(list = []) {
  if (!list.length) return '<div class="rempty">NO SOLUTIONS</div>';
  return `<table><thead><tr><th>SOLUTION</th><th>BOUNTY</th><th>PLACE</th><th>SCORE</th><th>ENTERED</th></tr></thead><tbody>
    ${list.map(s => `<tr><td class="title">${esc(s.title ?? '—')}</td>
      <td>${esc(s.competition?.title ?? s.competition?.slug ?? '—')}</td>
      <td>${s.placement != null ? '#' + s.placement : '—'}</td>
      <td>${esc(s.score?.display ?? '—')}</td>
      <td class="act">${ago(s.entered_at)}</td></tr>`).join('')}</tbody></table>`;
}

export function payoutsList(list = []) {
  if (!list.length) return '<div class="rempty">NO PAYOUTS YET</div>';
  return `<table><thead><tr><th>BOUNTY</th><th>AMOUNT</th><th>DATE</th></tr></thead><tbody>
    ${list.map(p => `<tr><td>${esc(p.competition ?? p.slug ?? '—')}</td><td>${usd(p.amount_usd ?? p.amountUsd)}</td><td>${esc(p.paid_at ?? p.created_at ?? '—')}</td></tr>`).join('')}
    </tbody></table>`;
}

export async function renderProfile(handle) {
  loadStyles();
  setCrumb(`PROFILE / <b>${esc(handle)}</b>`);
  let p;
  try {
    p = await cachedGet(`/profiles/${encodeURIComponent(handle)}`, 120000);
  } catch (e) {
    mount(`<div class="err"><b>NO SUCH ACCOUNT</b><p>${esc(handle)}</p><p class="faint">${esc(e?.message ?? '')}</p></div>`);
    return;
  }
  if (!p || !p.handle) {
    mount(`<div class="err"><b>NO SUCH ACCOUNT</b><p>${esc(handle)}</p></div>`);
    return;
  }
  const avatar = p.avatar?.url
    ? `<img crossorigin="anonymous" src="https://make.fun${esc(p.avatar.url)}" alt="">`
    : '';
  mount(`<div class="phd">${avatar}<div><div class="mono-big">@${esc(p.handle)}</div>
      <div class="faint">${esc(p.display_name ?? '')} · joined ${ago(p.joined_at)}</div></div>
      <span class="badge">PUBLIC RECORD</span></div>
    <div class="two">
      <section><div class="sect">RECORD</div>${recordLine(p.record)}</section>
      <section><div class="sect">IDENTITY</div>${groupedTable([
        ['DISPLAY', p.display_name], ['BIO', p.bio],
        ['WALLET', p.wallet?.address ? p.wallet.address.slice(0, 10) + '…' + p.wallet.address.slice(-6) : '—'],
        ['JOINED', p.joined_at ? new Date(p.joined_at).toISOString().slice(0, 10) : '—'],
      ])}<div class="quote">${esc(p.bio ?? '')}</div></section>
    </div>
    <div class="sect">SOLUTIONS · ${tnum(p.solutions?.length ?? 0)}</div>${solutionsList(p.solutions)}
    <div class="sect">PAYOUTS</div>${payoutsList(p.payouts)}
    <div class="quote">${cacheStrip()}</div>`);
  setStats(cacheStrip());
}
