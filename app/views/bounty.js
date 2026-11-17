// Bounty detail: a Monitor/Inspect surface. Dense rail + tabbed detail pane.
// Heavy panels (rank table, feed, history) are literal import() targets, never first-load.
import { getBounty, loadCss } from '../api.js';
import { esc, usd, compact, timeLeft, patch } from '../format.js';

const TABS = ['overview', 'rewards', 'standings', 'feed', 'history'];

/** Grouped two-col definition list. */
export function groupedTable(pairs) {
  return `<dl class="group">${pairs.filter((p) => p && p[1] != null && p[1] !== '').map(([k, v]) =>
    `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

/** Opens and deadline as one compact line. */
export function datesLine(b) {
  return `${esc(b?.opensAt ? new Date(b.opensAt).toISOString().slice(0, 10) : 'open')} <span class="faint">&rarr;</span> ${esc(b?.deadline ? new Date(b.deadline).toISOString().slice(0, 10) : '?')} <span class="faint mono">${esc(timeLeft(b?.deadline))}</span>`;
}

/** Deterministic CSS sparkline bars from an array of numbers. */
export function sparkline(values) {
  const nums = (values || []).filter((n) => Number.isFinite(Number(n))).map(Number);
  if (!nums.length) return '<span class="faint mono">no series</span>';
  const max = Math.max(...nums, 1), min = Math.min(...nums, 0);
  const bars = nums.slice(-24).map((n) =>
    `<i style="height:${Math.max(4, ((n - min) / (max - min || 1)) * 100)}%"></i>`).join('');
  return `<div class="spark" aria-hidden="true">${bars}</div>`;
}

/** Conic donut for share-of-pot, pure CSS, no blur/shadow. */
export function donut(fraction) {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  return `<div class="donut" style="background:conic-gradient(var(--accent) ${(f * 360).toFixed(1)}deg, var(--surface-2) 0)" aria-hidden="true"><span>${(f * 100).toFixed(0)}%</span></div>`;
}

/** Rewards table from the live rewardsNow[] rows. */
export function rewardsTable(b) {
  const rows = b?.rewardsNow || [];
  return `<table class="tbl rewards"><thead><tr>
    <th class="r">#</th><th class="r">BASE</th><th class="r">FEE SHARE</th><th class="r">TOTAL</th>
  </tr></thead><tbody>${rows.map((r) => `<tr>
    <td class="r t num">${esc(r.place)}</td>
    <td class="r num">${esc(usd(r.baseUsd))}</td>
    <td class="r num faint">${esc(usd(r.feeShareUsd))}</td>
    <td class="r num lime">${esc(usd(r.amountUsd))}</td>
  </tr>`).join('')}</tbody></table>`;
}

/** Tab bar with roving tabindex + arrow-key navigation. */
export function tabs(active, onSelect) {
  const bar = document.createElement('div');
  bar.className = 'tabbar';
  bar.setAttribute('role', 'tablist');
  bar.innerHTML = TABS.map((t) =>
    `<button role="tab" data-tab="${t}" aria-selected="${t === active}" aria-controls="panel-${t}" tabindex="${t === active ? 0 : -1}">${t.toUpperCase()}</button>`).join('');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[role="tab"]');
    if (b) onSelect(b.dataset.tab);
  });
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const current = bar.querySelector('[role="tab"][aria-selected="true"]')?.dataset.tab || active;
    const i = TABS.indexOf(current);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    onSelect(next);
  });
  return bar;
}

function phasesTimeline(phases) {
  return `<div class="phases">${(phases || []).map((p, i) => `
    <div class="phase">
      <div class="pnum mono">${String(i + 1).padStart(2, '0')}</div>
      <div class="pbody"><div class="ptitle">${esc(p.title || p.key)}</div>
        <div class="pdates faint mono">${esc(p.startsAt ? p.startsAt.slice(0, 10) : '?')} &rarr; ${esc(p.endsAt ? p.endsAt.slice(0, 10) : '?')}</div>
        <div class="pdesc">${esc(String(p.description || '').slice(0, 260))}</div>
      </div>
    </div>`).join('')}</div>`;
}

function plainBlock(text, cap = 500) {
  const clean = String(text || '').replace(/[#*`>]/g, '').replace(/\s+/g, ' ').trim();
  return `<p class="plain">${esc(clean.slice(0, cap))}</p>`;
}

async function loadPanel(panel, name, slug) {
  if (name === 'standings') {
    const m = await import('./leaderboard.js');
    await m.renderLeaderboard(panel, slug, 'overall');
  } else if (name === 'feed') {
    const m = await import('./feed.js');
    await m.renderFeed(panel, slug);
  } else if (name === 'history') {
    const m = await import('./history.js');
    await m.renderHistory(panel, slug);
  }
}

/** Render the bounty page into a host. */
export async function renderBounty(host, { slug, tab = 'overview' }) {
  loadCss('./views/bounty.css');
  const b = await getBounty(slug);
  if (!b || !b.slug) {
    patch(host, `<p class="mono" style="color:var(--accent)">NO SUCH BOUNTY: ${esc(slug)}</p>`);
    return;
  }
  let active = TABS.includes(tab) ? tab : 'overview';

  const pot = Number(b.potUsd ?? b.rewardAmount ?? 0);
  const reward = Number(b.rewardAmount ?? 0);
  const share = pot ? reward / pot : 0;

  patch(host, `
    <div class="cols bounty">
      <aside class="rail">
        <div class="rail-title mono">${esc(b.title)}</div>
        <div class="rail-sub faint mono">${esc(b.slug)} <span class="mut">&middot;</span> ${esc(b.category || 'bounty')}</div>
        ${groupedTable([
          ['POT', `<span class="lime tnum">${esc(usd(pot))}</span>`],
          ['ENTRY FEE', b.entryFeeUsd ? esc(usd(b.entryFeeUsd)) : '<span class="faint">free</span>'],
          ['ENTRIES', `<span class="tnum">${esc(compact(b.submissionCount))}</span>`],
          ['SPONSOR', esc(b.sponsor?.name || 'make.fun')],
          ['STATUS', `<span class="lime">${esc((b.status || 'open').toUpperCase())}</span>`],
          ['WINDOW', datesLine(b)],
        ])}
        <div class="rail-sec mono">SHARE OF POT</div>
        <div class="rail-donut">${donut(share)}<div class="faint mono sm">base reward / pot</div></div>
        <div class="rail-sec mono">ENTRY RATE</div>
        ${sparkline((b.rewardsNow || []).map((r) => Number(r.amountUsd)))}
        <div class="rail-foot faint mono">READ ONLY &middot; LIVE</div>
      </aside>
      <section class="pane">
        <div id="tabbar-host"></div>
        <div id="panel-host" class="panel" role="tabpanel"></div>
      </section>
    </div>
  `);

  const panel = host.querySelector('#panel-host');
  const setTab = async (next) => {
    active = next;
    const bar = host.querySelector('#tabbar-host [role="tablist"]');
    if (bar) {
      bar.querySelectorAll('[role="tab"]').forEach((t) => {
        const on = t.dataset.tab === next;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
    }
    if (bar && bar.contains(document.activeElement)) bar.querySelector('[aria-selected="true"]')?.focus();
    panel.innerHTML = '<p class="faint mono">LOADING&hellip;</p>';
    window.__shotReady = false;
    if (next === 'overview') {
      panel.innerHTML = `
        <div class="ov-grid">
          <div class="ov-main">
            <div class="sec-label mono">SUMMARY</div>
            ${plainBlock(b.summary, 600)}
            <div class="sec-label mono">DESCRIPTION</div>
            ${plainBlock(b.description, 900)}
            <div class="sec-label mono">DEMAND</div>
            ${plainBlock(b.demand, 400)}
            <div class="sec-label mono">RESOLUTION</div>
            ${plainBlock(b.resolution?.summary, 500)}
          </div>
          <div class="ov-side">
            <div class="sec-label mono">PHASES</div>
            ${phasesTimeline(b.phases)}
            <div class="sec-label mono">SKILLS</div>
            <div class="chips">${(b.skills || []).map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
          </div>
        </div>`;
    } else if (next === 'rewards') {
      panel.innerHTML = `<div class="sec-label mono">REWARDS NOW <span class="faint">&middot;</span> ${(b.rewardsNow || []).length} PLACES</div>${rewardsTable(b)}`;
    } else {
      await loadPanel(panel, next, slug);
    }
    window.__shotReady = true;
  };

  host.querySelector('#tabbar-host').appendChild(tabs(active, setTab));
  await setTab(active);
  window.__shotReady = true;
}
