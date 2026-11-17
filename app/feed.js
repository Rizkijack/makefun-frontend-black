// Discussion feed: published comments only, capped, escaped, newest first.
import { ago, esc } from './format.js';
import { API, TTL, cachedGet } from './main.js';

const CAP = 8;
const MAX = 240;

function body(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > MAX ? `${t.slice(0, MAX).replace(/\s\S*$/, '')}…` : t;
}

export async function renderFeed(root, slug) {
  if (!root) return;
  let data;
  try {
    data = await cachedGet(`${API}/competitions/${encodeURIComponent(slug)}/comments?limit=40`, TTL.live);
  } catch (error) {
    root.innerHTML = `<div class="blk"><h3>DISCUSSION</h3><div class="err">FEED ${esc(error.message)}</div></div>`;
    return;
  }

  const items = (data.items || []).filter((c) => !c.deleted && !c.parent_id && c.state !== 'hidden');
  const shown = items.slice(0, CAP);
  const replies = items.reduce((n, c) => n + Number(c.reply_count || 0), 0);
  const total = items.length + replies;

  if (!shown.length) {
    root.innerHTML = '<div class="blk"><h3>DISCUSSION</h3><div class="loading">NO PUBLISHED COMMENTS</div></div>';
    return;
  }

  const list = shown.map((c) => {
    const who = c.author?.handle || 'anonymous';
    const kind = c.author?.entrant ? 'ENTRANT' : c.author?.kind === 'judge' ? 'JUDGE' : 'HUNTER';
    const avatar = c.author?.image && String(c.author.image).startsWith('/') ? `<img class="cm-a" crossorigin="anonymous" src="https://make.fun${esc(c.author.image)}" alt="" width="18" height="18">` : '<i class="cm-a dot"></i>';
    const replyLine = Number(c.reply_count) > 0 ? `<div class="rp">${c.reply_count} REPL${Number(c.reply_count) === 1 ? 'Y' : 'IES'}${c.last_reply_at ? ` · LAST ${ago(c.last_reply_at).toUpperCase()} AGO` : ''}</div>` : '';
    return `<li class="cm">${avatar}<div class="cm-b"><div class="cm-h"><b>${esc(who)}</b><span class="k">${kind}</span>${c.like_count ? `<span class="k">♥ ${Number(c.like_count)}</span>` : ''}<time datetime="${esc(c.created_at)}">${ago(c.created_at).toUpperCase()} AGO</time></div><p>${esc(body(c.body))}</p>${replyLine}</div></li>`;
  }).join('');

  root.innerHTML = `<div class="blk">
    <h3>DISCUSSION · LIVE</h3>
    <div class="filters feed-head"><span class="count" style="margin-left:0">${shown.length} OF ${total} COMMENTS · ${replies} REPLIES · NEWEST FIRST</span></div>
    <ul class="feed">${list}</ul>
    <p class="meta-line">PUBLISHED COMMENTS FROM THE PUBLIC API · READ ONLY · NO COMPOSER</p>
  </div>`;
}
