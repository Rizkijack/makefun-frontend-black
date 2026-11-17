// Loaded later: the design system. The link is built here so index.html stays a shell.
let pending;
export const skin = () => (pending ??= new Promise((done) => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'skin.css';
  link.onload = () => done();
  link.onerror = () => done();
  document.head.append(link);
}));
