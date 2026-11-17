// First-load helper: HTML escaping only. All other helpers live in lazy util.js.
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
}
