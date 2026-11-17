// Comments feed: compact live discussion list, escaped + truncated, capped at 8.
// Loaded only when the FEED tab opens.
import { getComments, loadCss } from '../api.js';
import { esc, ago, patch } from '../format.js';

export async function renderFeed(host, slug) {
  loadCss('./views/feed.css');
  const data = await getComments(slug);
  const items = (data?.items || []).filter((c) => c?.state === 'published' && !c?.deleted).slice(0, 8);
  patch(host, `
    <div class="feed-cap mono">DISCUSSION <span class="lime">&middot;</span> LIVE <span class="faint">&middot;</span> ${items.length} RECENT</div>
    <ul class="feed">
      ${items.map((c) => `
        <li>
          <div class="feed-meta mono">
            <span class="h">${esc(c.author?.handle || 'anon')}</span>
            <span class="faint">${esc(c.author?.kind || '')}</span>
            <span class="faint">${esc(ago(c.created_at))}</span>
          </div>
          <div class="feed-body">${esc(String(c.body || '').slice(0, 220))}</div>
          <div class="feed-foot mono faint">${c.reply_count ? `${c.reply_count} replies` : ''}</div>
        </li>`).join('') || '<li class="faint mono">no comments yet</li>'}
    </ul>
  `);
}
