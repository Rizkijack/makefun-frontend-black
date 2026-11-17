// Later load: live status strip, recent entries, submission detail, breakdown, views.
import { ago, compact, esc } from './format.js';
import { API, TTL, cachedGet } from './main.js';
import { groupedTable } from './bounty.js';

const dateUTC = (iso) => {
  if (!iso) return '—';
  return `${new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).toUpperCase()} UTC`;
};

const pad = (n) => String(n).padStart(2, '0');

/** Mono clock to an ISO instant; negative distances read as overdue. */
export function countdown(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return '—';
  const a = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(a / 86400), h = Math.floor(a / 3600) % 24, m = Math.floor(a / 60) % 60, s = a % 60;
  const body = d ? `${d}d ${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
  return ms < 0 ? `+${body}` : body;
}

function ticker(el) {
  const cd = el.querySelector('.ls-cd');
  if (!cd) return;
  const timer = setInterval(() => {
    const next = cd.dataset.next;
    if (!cd.isConnected) { clearInterval(timer); return; }
    if (!next) return;
    cd.textContent = `NEXT ${countdown(next)}`;
  }, 1000);
}

/** The strip's markup: status sentence, phase key, automation countdown. */
export function liveStripHTML(live) {
  const c = live?.competition || {};
  const st = live?.status || {};
  const ph = live?.phase || {};
  const au = live?.automation || {};
  const scores = live?.standings?.scores_visible;
  const next = au.next_at || st.expected_at || '';
  const phase = [ph.key, ph.ranking_phase && `RANK ${ph.ranking_phase}`].filter(Boolean).join(' · ');
  const gate = scores === true ? 'SCORES LIVE' : scores === false ? 'SCORES HELD' : '';
  return `<div class="live-strip" aria-label="live competition status">
    <div class="ls-row">
      <span class="ls-dot" aria-hidden="true"></span>
      <span class="ls-st">${esc(String(c.status || '—').toUpperCase())}${phase ? ` · ${esc(String(phase).toUpperCase())}` : ''}${gate ? ` · ${gate}` : ''}${au.step ? ` · STEP ${esc(String(au.step).toUpperCase())}` : ''}</span>
      <span class="ls-cd" data-next="${esc(next)}" title="${esc(au.reason || '')}">${next ? `NEXT ${countdown(next)}` : 'NO STEP'}</span>
    </div>
    <div class="ls-s">${esc(st.sentence || '')}</div>
  </div>`;
}

/** Paint the strip into an existing host, then keep its countdown honest. */
export async function renderLive(host, slug) {
  if (!host) return null;
  try {
    const live = await cachedGet(`${API}/competitions/${encodeURIComponent(slug)}/live`, 15000);
    host.innerHTML = liveStripHTML(live);
    ticker(host);
    return live;
  } catch {
    host.innerHTML = '';
    return null;
  }
}

/** Grouped facts for a breakdown payload — only the fields it actually carries. */
export function breakdownTable(bd) {
  const rows = [];
  if (bd.phase) {
    const others = (bd.phases || []).filter((p) => p !== bd.phase);
    rows.push(['PHASE', String(bd.phase).toUpperCase(), others.length ? `ALSO ${others.join(' · ')}` : '']);
  }
  const run = bd.run || {};
  if (run.id) rows.push(['RUN ID', run.id, [run.attempt ? `ATTEMPT ${run.attempt}` : '', run.status ? `STATUS ${String(run.status).toUpperCase()}` : ''].filter(Boolean).join(' · ')]);
  if (bd.harness_kind) rows.push(['HARNESS', bd.harness_kind, bd.kind ? String(bd.kind).toUpperCase() : '']);
  if (bd.view) rows.push(['VIEW', bd.view, bd.source ? `SOURCE ${String(bd.source).toUpperCase()}` : '']);
  for (const part of bd.checks?.parts || []) {
    const max = part.max == null ? '' : ` OF ${part.max}`;
    const key = part.key && part.key !== part.title ? part.key : '';
    rows.push([String(part.title || part.key || 'PART').toUpperCase(), `${part.earned ?? '·'}${max}`, key && key.toLowerCase() !== String(part.title || '').toLowerCase() ? key : '']);
  }
  if (bd.checks?.total != null) rows.push(['TOTAL', `${bd.checks.total}${bd.checks.total_key ? ` · ${bd.checks.total_key}` : ''}`, bd.checks.trials ? `${bd.checks.trials} TRIAL` : '']);
  if (bd.clock) rows.push(['CLOCK', JSON.stringify(bd.clock), '']);
  if (bd.pnl) rows.push(['PNL', JSON.stringify(bd.pnl), '']);
  if (bd.aggregates) rows.push(['AGGREGATES', JSON.stringify(bd.aggregates), '']);
  if (!rows.length) return '<div class="loading">BREAKDOWN CARRIES NO FIELDS FOR THIS RUN</div>';
  return groupedTable(rows);
}

/** Compact latest-entries table; every handle deep-links to its #/entry/<id>. */
export async function renderRecent(root, slug) {
  if (!root) return;
  let data;
  try {
    data = await cachedGet(`${API}/competitions/${encodeURIComponent(slug)}/submissions?limit=8`, TTL.live);
  } catch (error) {
    root.innerHTML = `<div class="blk"><h3>RECENT ENTRIES · LIVE</h3><div class="err">ENTRIES ${esc(error.message)}</div></div>`;
    return;
  }
  const items = data.items || [];
  const rows = items.map((s) => `<tr>
      <td><a class="hd" href="#/entry/${encodeURIComponent(s.id)}" title="${esc(s.handle || '')}">${esc(s.handle || '—')}</a><span class="tt" title="${esc(s.title || '')}">${esc(s.title || 'untitled entry')}</span></td>
      <td class="num st">${esc(String(s.status || '—').toUpperCase())}</td>
      <td class="num ag">${esc(ago(s.created_at).toUpperCase())}</td>
    </tr>`).join('');
  root.innerHTML = `<div class="blk">
    <h3>RECENT ENTRIES · LIVE</h3>
    ${rows ? `<table class="lb rec"><thead><tr><th>ENTRY</th><th>STATUS</th><th>AGE</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="loading">NO PUBLIC ENTRIES YET</div>'}
    <p class="meta-line">${items.length} MOST RECENT FROM ${esc(slug)} · NEWEST FIRST · CLICK A HANDLE FOR THE ENTRY</p>
  </div>`;
}

/** #/entry/<id>: read-only detail plus breakdown and per-submission counts. */
export async function renderEntry(root, id) {
  if (!root) return null;
  const base = `${API}/submissions/${encodeURIComponent(id)}`;
  let d;
  try {
    d = await cachedGet(base, TTL.bounty);
  } catch (error) {
    root.innerHTML = `<div class="ent"><div class="err"><b>NO SUCH ENTRY</b> · ${esc(id)}<br>${esc(error.message)} · <a href="#/">BACK TO BOARD</a></div></div>`;
    return null;
  }
  const [v, bd] = await Promise.all([
    cachedGet(`${base}/views`, TTL.live).catch(() => null),
    cachedGet(`${base}/breakdown`, TTL.bounty).catch(() => null),
  ]);
  const slug = d.competition?.slug || '';
  const owner = d.owner?.handle || '';
  const kind = [d.house ? 'HOUSE' : '', d.baseline ? 'BASELINE' : ''].filter(Boolean).join(' · ') || 'OPEN';
  const source = d.repo_url ? d.repo_url : d.source_withheld ? 'WITHHELD UNTIL DEADLINE' : '—';
  const rows = [
    ['STATUS', String(d.status || '—').toUpperCase(), d.error ? String(d.error) : ''],
    ['VISIBILITY', String(d.visibility || '—').toUpperCase(), kind],
    ['OWNER', owner ? `@${owner}` : '—', d.owner?.display_name || ''],
    ['COMPETITION', d.competition?.title || d.competition?.slug || '—', d.competition?.status ? `${String(d.competition.status).toUpperCase()} · CLOSES ${dateUTC(d.competition.deadline)}` : ''],
    ['VIA', String(d.via || '—').toUpperCase(), d.commit_sha ? `COMMIT ${String(d.commit_sha).slice(0, 10)}` : ''],
    ['ENTERED', dateUTC(d.created_at), `UPDATED ${dateUTC(d.updated_at)}`],
    ['SOURCE', source, d.license_spdx ? `LICENSE ${d.license_spdx}` : ''],
    ['SNAPSHOT', d.snapshot?.sha256 ? String(d.snapshot.sha256).slice(0, 16) : 'NOT PUBLIC', d.snapshot?.files != null ? `${d.snapshot.files} FILES · ${compact(d.snapshot.bytes || 0)} BYTES` : ''],
    ['RUNS', String((d.runs || []).length), (d.scores || []).map((s) => `${String(s.phase || '').toUpperCase()} ${String(s.status || '')}`.trim()).join(' · ')],
  ];
  const views = v ? `<div class="views-line"><span class="label">VIEWS</span><b>VIEWED ${compact(v.view_count || 0)} · AGENT READS ${compact(v.agent_read_count || 0)}</b></div>` : '';
  const bdBlock = bd
    ? `<div class="blk"><h3>BREAKDOWN · ${esc(String(bd.phase || 'RUN').toUpperCase())}</h3>${breakdownTable(bd)}${bd.note ? `<p class="meta-line">${esc(bd.note)}</p>` : ''}</div>`
    : `<div class="blk"><h3>BREAKDOWN</h3><div class="loading">NO GRADE RUN PUBLISHED FOR THIS ENTRY YET</div></div>`;

  root.innerHTML = `<div class="ent">
    <header class="ent-head">
      <div class="detail-eyebrow"><span class="st">ENTRY</span><span>·</span><span>${esc(String(d.status || '—').toUpperCase())}</span><span>·</span><span>${esc(String(d.visibility || '—').toUpperCase())}</span>${slug ? `<span>·</span><a href="#/bounty/${encodeURIComponent(slug)}">BOUNTY ↗</a>` : ''}</div>
      <h1 class="detail-title">${esc(d.title || 'untitled entry')}</h1>
      <div class="detail-sub">${owner ? `<a href="#/u/${encodeURIComponent(owner)}">@${esc(owner)}</a> · ` : ''}${esc(d.competition?.title || slug || '—')}</div>
      ${views}
    </header>
    <div class="ent-body">
      <div class="blk"><h3>DETAIL</h3>${groupedTable(rows)}</div>
      ${bdBlock}
      <div class="blk"><a class="back" href="${slug ? `#/bounty/${encodeURIComponent(slug)}` : '#/'}">← BACK TO ${slug ? esc(slug.toUpperCase()) : 'BOARD'}</a></div>
      <p class="meta-line">READ ONLY · ${esc(id)} · <a href="${esc(`${API}/submissions/${encodeURIComponent(id)}`)}" rel="noreferrer">RAW JSON ↗</a></p>
    </div></div>`;
  return slug || null;
}
