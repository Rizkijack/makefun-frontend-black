// First load: one boot call. The router, cache layer and skin are literal import()s and load after it.
import('./router.js').then((m) => m.boot());
