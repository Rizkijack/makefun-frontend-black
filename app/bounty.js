// Bounty detail: header, segmented tabs, grouped facts, rewards, charts, live sub-views.
import { compact, esc, timeLeft, usd } from './format.js';
import { API, REQUEST_STATS, TTL, cachedGet, revalidate, route } from './main.js';

export const TABS = ['overview', 'rewards', 'standings', 'feed', 'history'];

const dateUTC = (iso) => {
  if (!iso) return '—';
  return `${new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).toUpperCase()} UTC`;
};

export function datesLine(b) {
  return `OPENS ${dateUTC(b.opensAt)} · CLOSES ${dateUTC(b.deadline)} · ${timeLeft(b.deadline).toUpperCase()} LEFT`;
}

function plain(md, max = 900) {
  const text = String(md ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max).replace(/\s\S*$/, '')}…` : text;
}

export function groupedTable(rows) {
  return `<table class="groups"><tbody>${rows.map(([label, value, sub]) => `<tr><th>${esc(label)}</th><td>${esc(value)}${sub ? `<small>${esc(sub)}</small>` : ''}</td></tr>`).join('')}</tbody></table>`;
}

export function rewardsTable(b) {
  const rows = (b.rewardsNow || []).map((r) => `<tr><td>${r.place}</td><td>${usd(r.baseUsd)}</td><td>${usd(r.feeShareUsd)}</td><td>${usd(r.amountUsd)}</td></tr>`).join('');
  const sum = (b.rewardsNow || []).reduce((n, r) => n + Number(r.amountUsd || 0), 0);
  return `<table class="rw"><thead><tr><th>PLACE</th><th>BASE</th><th>FEES</th><th>NOW</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>POOL</td><td>${usd(b.rewardAmount ?? 0)}</td><td>${usd(b.entryFeesUsd ?? 0)}</td><td>${usd(sum || b.potUsd)}</td></tr></tfoot></table>`;
}

export function sparkline(values, caption = 'REWARD LADDER') {
  const vals = values.map(Number).filter(Number.isFinite);
  const max = Math.max(...vals, 1);
  return `<div class="spark" role="img" aria-label="${esc(caption)}">${vals.map((v) => `<i class="${v === max ? 'hi' : ''}" style="height:${Math.max(4, (v / max) * 100)}%"></i>`).join('')}</div>`;
}

export function donut(parts) {
  const a = parts?.[0] ?? { label: 'BASE', value: 0 };
  const z = parts?.[1] ?? { label: 'FEES', value: 0 };
  const total = Number(a.value || 0) + Number(z.value || 0) || 1;
  const pct = Math.round((Number(a.value || 0) / total) * 100);
  return `<div class="donut" style="--p:${pct}%" role="img" aria-label="${esc(a.label)} ${pct} percent of the pot"><b>${pct}%</b></div>
    <div class="legend"><span><i class="sw"></i>${esc(a.label)}</span><span><i class="sw m"></i>${esc(z.label)}</span></div>`;
}

export function tabs(active) {
  return `<div class="tabs" role="tablist" aria-label="Bounty sections">${TABS.map((t) => `<button role="tab" id="tab-${t}" aria-controls="pane-${t}" data-tab="${t}" aria-selected="${t === active}" tabindex="${t === active ? 0 : -1}">${t.toUpperCase()}</button>`).join('')}</div>`;
}

function phases(b) {
  const now = Date.now();
  const list = (b.phases || []).map((p) => {
    const start = Date.parse(p.startsAt), end = Date.parse(p.endsAt);
    const state = now < start ? 'NEXT' : now > end ? 'DONE' : 'LIVE';
    return `<li class="phase ${state === 'LIVE' ? 'live' : ''}"><i></i><div><b>${esc(p.title || p.key)}</b><span>${state} · ${dateUTC(p.startsAt)} → ${dateUTC(p.endsAt)}</span><p>${esc(plain(p.description, 220))}</p></div></li>`;
  }).join('');
  return list ? `<ul class="phases">${list}</ul>` : '<p class="prose">No phases published.</p>';
}

function chartBlock(b) {
  const rewards = (b.rewardsNow || []).map((r) => Number(r.amountUsd || 0));
  const base = Number(b.rewardAmount ?? 0);
  const fees = Number(b.entryFeesUsd ?? 0);
  return `<div class="charts">
    <div><div class="label">REWARD LADDER · ${rewards.length} PLACES · LIVE</div>${sparkline(rewards, 'Live reward amounts by place')}
      <div class="legend"><span>1ST ${usd(rewards[0] || 0)}</span><span>LAST ${usd(rewards[rewards.length - 1] || 0)}</span></div></div>
    <div><div class="label">POT SPLIT</div>${donut([{ label: 'BASE', value: base }, { label: 'FEES', value: fees }])}</div>
  </div>`;
}

function cacheStrip(url) {
  return `<div class="cache-strip"><span>REQUEST <b class="pipe">→</b> CACHE <b class="pipe">→</b> REVALIDATE</span>
    <b>REQ ${REQUEST_STATS.req}</b><b>CACHE ${REQUEST_STATS.cache}</b><b>REVAL ${REQUEST_STATS.reval}</b>
    <button data-reval="${esc(url)}">REVALIDATE NOW</button></div>`;
}

function overview(b) {
  const fee = Number(b.entryFeeUsd ?? 0) > 0 ? `${usd(b.entryFeeUsd)} · ${compact(b.entryFeePayers || 0)} paid` : 'none';
  const rows = [
    ['SPONSOR', b.sponsor?.name || '—', 'verified' + (b.sponsor?.isVerified ? ' · yes' : '')],
    ['CATEGORY', b.category || '—', b.status || ''],
    ['STATUS', b.acceptingSubmissions ? 'OPEN · ACCEPTING' : 'CLOSED TO ENTRIES', `submissions ${compact(b.submissionCount || 0)}`],
    ['OPENS', dateUTC(b.opensAt), ''],
    ['DEADLINE', dateUTC(b.deadline), `${timeLeft(b.deadline).toUpperCase()} LEFT`],
    ['ENTRY FEE', fee, 'one fee per account'],
    ['ENTRIES', compact(b.submissionCount || 0), `${b.submissionsPassed ?? '—'} passed`],
    ['LIVE POT', usd(b.potUsd ?? b.rewardAmount), `${usd(b.rewardAmount)} escrow + ${usd(b.entryFeesUsd)} fees`],
  ];
  const skills = (b.skills || []).map((s) => `<span class="skill">${esc(s)}</span>`).join('');
  return `<div class="blk"><h3>SUMMARY</h3><p class="prose">${esc(plain(b.summary || b.description, 380))}</p></div>
    <div class="blk"><h3>FACTS</h3>${groupedTable(rows)}</div>
    <div class="blk"><h3>SKILLS</h3><div class="skills">${skills || '<span class="skill">—</span>'}</div></div>
    <div class="blk"><h3>BRIEF</h3><p class="prose">${esc(plain(b.description, 760))}</p><p class="label" style="margin-top:5px">${datesLine(b)}</p></div>
    <div class="blk"><h3>PHASES</h3>${phases(b)}</div>
    <div class="blk"><h3>DEMAND / RESOLUTION</h3><div class="quote">${esc(plain(b.demand, 260))}<br><br>${esc(plain(b.resolution?.summary, 320))}</div></div>
    <div class="blk"><h3>RULES · ${(b.rules || '').length} CHARS</h3><p class="prose">${esc(plain(b.rules, 520))}</p></div>
    <div class="blk"><h3>LIVE REWARD SHAPE</h3>${chartBlock(b)}</div>
    <div class="blk">${cacheStrip(`${API}/competitions/${encodeURIComponent(b.slug)}?submissions=summary`)}</div>`;
}

function rewardsPane(b) {
  return `<div class="blk"><h3>REWARDS NOW · ${(b.rewardsNow || []).length} PLACES</h3>${rewardsTable(b)}</div>
    <div class="blk"><h3>POOL COMPOSITION</h3>${chartBlock(b)}</div>
    <div class="blk">${datesLine(b)}</div>
    <div class="blk">${cacheStrip(`${API}/competitions/${encodeURIComponent(b.slug)}?submissions=summary`)}</div>`;
}

async function notices(slug) {
  try {
    const data = await cachedGet(`${API}/competitions/${encodeURIComponent(slug)}/notices`, TTL.live);
    const list = data.notices || [];
    const el = document.getElementById('notice');
    if (!el || !list.length) return;
    el.innerHTML = list.map((n) => `<b>NOTICE</b> ${esc(n.body || n.message || n.title || 'competition notice')}`).join(' · ');
    el.hidden = false;
  } catch { /* notices are optional */ }
}

export async function renderBounty(root, slug, active = 'overview') {
  if (!root) return;
  const url = `${API}/competitions/${encodeURIComponent(slug)}?submissions=summary`;
  const [b] = await Promise.all([cachedGet(url, TTL.bounty), notices(slug)]);
  if (!b || !b.slug) throw new Error(`no bounty ${slug}`);
  const status = (b.status || 'open').toUpperCase();
  const fee = Number(b.entryFeeUsd ?? 0) > 0 ? `${usd(b.entryFeeUsd)} ENTRY` : 'NO FEE';
  root.innerHTML = `<header class="detail-head">
      <div class="detail-eyebrow"><span class="st">${esc(status)}</span><span>·</span><span>${esc(b.category || 'MISC')}</span><span>·</span><span>${compact(b.submissionCount || 0)} ENTRIES</span><span>·</span><a href="https://make.fun/bounty/${encodeURIComponent(b.slug)}" rel="noreferrer">SOURCE ↗</a></div>
      <h1 class="detail-title">${esc(b.title)}</h1>
      <div class="detail-sub">${esc(b.slug)} · ${esc(b.sponsor?.name || 'make.fun')} · ${fee}</div>
      <div class="pot-band"><span><span class="label">LIVE POT</span><span class="pp">${usd(b.potUsd ?? b.rewardAmount)}</span></span><span class="pl">${esc(datesLine(b))}</span></div>
    </header>
    ${tabs(active)}
    <section class="tabpane ${active === 'overview' ? 'on' : ''}" id="pane-overview" role="tabpanel" aria-labelledby="tab-overview" ${active === 'overview' ? '' : 'hidden'}>${active === 'overview' ? overview(b) : ''}</section>
    <section class="tabpane ${active === 'rewards' ? 'on' : ''}" id="pane-rewards" role="tabpanel" aria-labelledby="tab-rewards" ${active === 'rewards' ? '' : 'hidden'}>${active === 'rewards' ? rewardsPane(b) : ''}</section>
    <section class="tabpane ${active === 'standings' ? 'on' : ''}" id="pane-standings" role="tabpanel" aria-labelledby="tab-standings" ${active === 'standings' ? '' : 'hidden'}></section>
    <section class="tabpane ${active === 'feed' ? 'on' : ''}" id="pane-feed" role="tabpanel" aria-labelledby="tab-feed" ${active === 'feed' ? '' : 'hidden'}></section>
    <section class="tabpane ${active === 'history' ? 'on' : ''}" id="pane-history" role="tabpanel" aria-labelledby="tab-history" ${active === 'history' ? '' : 'hidden'}></section>`;

  const tablist = root.querySelector('.tabs');
  const go = (tab) => { location.hash = `#/bounty/${encodeURIComponent(slug)}${tab === 'overview' ? '' : `/${tab}`}`; };
  tablist.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.tab === active) return;
    go(btn.dataset.tab);
  }));
  tablist.addEventListener('keydown', (e) => {
    const buttons = [...tablist.querySelectorAll('[data-tab]')];
    const at = buttons.indexOf(document.activeElement);
    if (at < 0) return;
    let next = at;
    if (e.key === 'ArrowRight') next = (at + 1) % buttons.length;
    else if (e.key === 'ArrowLeft') next = (at - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = buttons.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(buttons[at].dataset.tab); return; }
    else return;
    e.preventDefault();
    buttons[next].focus();
    go(buttons[next].dataset.tab);
  });

  root.querySelectorAll('[data-reval]').forEach((btn) => btn.addEventListener('click', async () => {
    btn.textContent = 'REVALIDATING…';
    try { await revalidate(btn.dataset.reval); } catch { /* keep cache */ }
    await route();
  }));

  if (active === 'standings') {
    const pane = root.querySelector('#pane-standings');
    const [{ renderLeaderboard }, { renderHistory }] = await Promise.all([import('./leaderboard.js'), import('./history.js')]);
    pane.insertAdjacentHTML('beforeend', '<div class="blk mt" id="mini-history"></div>');
    await Promise.all([renderLeaderboard(pane, slug), renderHistory(pane.querySelector('#mini-history'), slug, true)]);
  } else if (active === 'feed') {
    const { renderFeed } = await import('./feed.js');
    await renderFeed(root.querySelector('#pane-feed'), slug);
  } else if (active === 'history') {
    const { renderHistory } = await import('./history.js');
    await renderHistory(root.querySelector('#pane-history'), slug, false);
  }
}
