// First load: index.html + style.css + main.js + format.js only. Everything else is lazy.
import { patch } from './format.js';
window.__shotReady = false;
patch(document.getElementById('app'), '<p class="mut mono">LOADING&hellip;</p>');
import('./router.js').then((m) => m.mount());
