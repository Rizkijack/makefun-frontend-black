// OBSIDIAN — make.fun read-only monitor. Minimal first-load entry.
// The shell + hash router are in a lazy module; first load is only this file
// plus index.html, style.css and format.js. __shotReady gates screenshots.
import { esc } from './format.js';

// Only literal dynamic imports — no computed specifiers, no eval, no script injection.
async function boot() {
  window.__shotReady = false;
  try {
    const { start } = await import('./router.js');
    start();
  } catch (e) {
    const root = document.getElementById('app');
    if (root) root.innerHTML = '<div class="err"><b>BOOT FAILED</b><p>' + esc(e?.message ?? e) + '</p></div>';
    window.__shotReady = true;
  }
}
boot();
