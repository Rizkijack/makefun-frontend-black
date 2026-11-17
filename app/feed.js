// Live comments feed: handle, relative time, escaped body, replies. Capped at 8.
import { cachedGet, cacheStrip } from './cache.js';
import { esc, ago, tnum } from './util.js';

function body(items = []) {
  const rows = items.slice(0, 8).map(c => {
    const a = c.author ?? {};
    return `<li><span class="hd">@${esc(a.handle ?? 'anon')} <span class="kind">${esc(a.kind ?? '')}</span></span>
      <span class="tm">${ago(c.created_at)}</span>
      <div class="bd">${esc(String(c.body ?? '').slice(0, 320))}</div>
      <div class="rp">${tnum(c.reply_count ?? 0)} replies · ${esc(c.state ?? '')}</div></li>`;
  }).join('');
  return `<div class="cap"><b>DISCUSSION · LIVE</b><span>${rows ? 8 : 0} SHOWN · READ ONLY</span></div>
    <ul class="feed">${rows || '<li class="rempty">NO COMMENTS YET</li>'}</ul>
    <div class="quote">${cacheStrip()}</div>`;
}

export async function renderFeed(slug, el) {
  const d = await cachedGet(`/competitions/${encodeURIComponent(slug)}/comments`, 60000);
  el.innerHTML = body(d.items ?? []);
}
