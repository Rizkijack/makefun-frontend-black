// Bounty detail: grouped meta, phases timeline, rewards, tabs. Feature tabs lazy-load their modules.
import { cachedGet, cacheStrip } from './cache.js';
import { usd, tnum, compact, mdPlain, keyed } from './util.js';
import { loadStyles } from './ui.js';
import { mount, setCrumb, setNotice, setStats } from './router.js';
import { registryShell } from './board.js';

const TABS = [['overview', 'OVERVIEW'], ['rewards', 'REWARDS'], ['standings', 'STANDINGS'], ['feed', 'FEED'], ['history', 'HISTORY']];
const DATA = new Map(); // slug -> { detail, likes, views }

export function groupedTable(pairs) {
  return `<dl class="group">${pairs.filter(p => p[1] != null && p[1] !== '').map(([k, v]) =>
    `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

export function datesLine(b) {
  const fmt = t => t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '—';
  return `${fmt(b.opensAt)} → ${fmt(b.deadline)}`;
}

export function rewardsTable(rows = []) {
  return `<div class="cap"><b>REWARDS · NOW</b><span>${rows.length} PLACES · LIVE</span></div>
    <table><thead><tr><th>PLACE</th><th>BASE</th><th>FEE SHARE</th><th>AMOUNT</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="h">${r.place}</td><td>${usd(r.baseUsd)}</td><td>${usd(r.feeShareUsd)}</td><td class="h">${usd(r.amountUsd)}</td></tr>`).join('')}
    </tbody></table>`;
}

export function tabs(active, slug) {
  return `<div class="ptabs" role="tablist" aria-label="Bounty sections">${TABS.map(([k, label]) =>
    `<button role="tab" data-tab="${k}" aria-selected="${k === active}" tabindex="${k === active ? 0 : -1}">${label}</button>`).join('')}</div>`;
}

export function sparkline(values = []) {
  const max = Math.max(1, ...values);
  return `<div class="spark" aria-label="reward distribution">${values.map((v, i) =>
    `<i class="${i === 0 ? 'hi' : ''}" style="height:${Math.max(3, Math.round(v / max * 100))}%"></i>`).join('')}</div>`;
}

export function donut(base, fee) {
  const pct = Math.round(base / Math.max(1, base + fee) * 100);
  return `<div class="donut" style="background:conic-gradient(var(--acc) 0 ${pct}%,var(--s2) ${pct}% 100%)"><b>${pct}%</b></div>`;
}

function phasesTimeline(phases = []) {
  const now = Date.now();
  return `<ul class="tl">${phases.map(p => {
    const live = now >= new Date(p.startsAt) && now <= new Date(p.endsAt);
    return `<li class="${live ? 'now' : ''}"><div class="t">${p.title ?? p.key} ${live ? '· LIVE' : ''}</div>
      <div class="d">${datesLine({ opensAt: p.startsAt, deadline: p.endsAt })}</div>
      <div class="prose">${mdPlain(p.description)}</div></li>`;
  }).join('')}</ul>`;
}

function overview(data, likes, views) {
  const d = data.detail;
  const r0 = d.rewardsNow?.[0] ?? {};
  return `<div class="subhead">
      <div class="sect">GROUPED FIELDS</div>
      ${groupedTable([
        ['SPONSOR', d.sponsor?.name], ['CATEGORY', d.category], ['STATUS', d.status],
        ['ENTRIES', tnum(d.submissionCount)], ['ENTRY FEE', usd(d.entryFeeUsd)],
        ['POT (LIVE)', `<span class="delta">${usd(d.potUsd)}</span>`],
        ['WINDOW', datesLine(d)], ['LIKES / VIEWS', `<span class="glyph">♥ ${tnum(Object.values(likes.counts ?? {}).reduce((a, c) => a + c, 0))} · ◉ ${tnum(Object.values(views.counts ?? {}).reduce((a, c) => a + c, 0))}</span>`],
        ['REWARDS', d.rewardsNow?.length ? `${d.rewardsNow.length} places` : '—'],
      ])}
      <div class="sect">REWARD SHAPE · BASE / FEE SPLIT</div>
      <div class="viz">${sparkline((d.rewardsNow ?? []).map(r => Number(r.amountUsd)))}${donut(Number(r0.baseUsd ?? 0), Number(r0.feeShareUsd ?? 0))}</div>
      <div class="sect">PHASES</div>${phasesTimeline(d.phases)}
      <div class="sect">SKILLS</div><div class="chips-2">${(d.skills ?? []).map(s => `<span class="chip-2">${s}</span>`).join('')}</div>
      <div class="sect">DEMAND</div><div class="prose">${mdPlain(d.demand)}</div>
      <div class="sect">RESOLUTION</div><div class="prose">${mdPlain(d.resolution?.summary)}</div>
      <div class="sect">DESCRIPTION</div><div class="prose">${mdPlain(d.description)}</div>
    </div>`;
}

async function activate(tab, slug, pane, data) {
  const body = pane.querySelector('#pane-body');
  if (!body) return;
  for (const p of body.querySelectorAll('.pbody')) p.hidden = true;
  const el = body.querySelector(`.pbody[data-panel="${tab}"]`) || (() => {
    const n = document.createElement('div'); n.className = 'pbody'; n.dataset.panel = tab;
    body.appendChild(n); return n;
  })();
  el.hidden = false;
  if (el.dataset.ready === '1') return;
  el.dataset.ready = '1';
  el.tabIndex = 0;
  if (tab === 'overview') el.innerHTML = overview(data, data.likes, data.views);
  else if (tab === 'rewards') el.innerHTML = rewardsTable(data.detail.rewardsNow);
  else if (tab === 'standings') {
    el.innerHTML = '<div class="rempty">LOADING LIVE STANDINGS…</div>';
    const { renderLeaderboard } = await import('./leaderboard.js');
    await renderLeaderboard(slug, el, data.likes, data.views);
  } else if (tab === 'feed') {
    el.innerHTML = '<div class="rempty">LOADING DISCUSSION…</div>';
    const { renderFeed } = await import('./feed.js');
    await renderFeed(slug, el);
  } else if (tab === 'history') {
    el.innerHTML = '<div class="rempty">LOADING RANK HISTORY…</div>';
    const { renderHistory } = await import('./history.js');
    await renderHistory(slug, el);
  }
}

function wireTabs(pane, slug, tab, data) {
  const bar = pane.querySelector('.ptabs');
  if (!bar) return;
  const go = key => {
    if (key === tab) return;
    location.hash = '#/bounty/' + encodeURIComponent(slug) + '/' + key;
  };
  for (const btn of bar.querySelectorAll('[role=tab]')) {
    btn.addEventListener('click', () => go(btn.dataset.tab));
    btn.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const i = TABS.findIndex(t => t[0] === tab);
      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
      go(next);
    });
  }
}

export async function renderPane(slug, tab, pane) {
  let data = DATA.get(slug);
  if (!data) {
    const [detail, likes, views] = await Promise.all([
      cachedGet(`/competitions/${encodeURIComponent(slug)}?submissions=summary`, 60000),
      cachedGet(`/competitions/${encodeURIComponent(slug)}/likes`, 60000),
      cachedGet(`/competitions/${encodeURIComponent(slug)}/views`, 60000),
    ]);
    data = { detail, likes, views };
    DATA.set(slug, data);
  }
  const d = data.detail;
  pane.innerHTML = `<div class="ptitle">${d.title ?? slug}</div>
    <div class="psub">${d.summary ?? ''}</div>${tabs(tab, slug)}<div id="pane-body"></div>
    <div class="sect">CACHE PROOF</div><div class="quote">${cacheStrip()}</div>`;
  await activate(tab, slug, pane, data);
  wireTabs(pane, slug, tab, data);
}

export async function renderBounty(slug, tab = 'overview') {
  loadStyles();
  mount(registryShell());
  setCrumb(`BOARD / <b>${slug}</b> / ${tab.toUpperCase()}`);
  // Populate the registry table beside the pane.
  const { renderBoard } = await import('./board.js');
  window.__registryOnly = true;
  window.__selectedSlug = slug;
  await renderBoard();
  window.__registryOnly = false;
  const pane = document.getElementById('pane');
  if (pane) await renderPane(slug, tab, pane);
  setStats(cacheStrip());
}
