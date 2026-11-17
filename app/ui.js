// One-time injection of the feature stylesheet, pulled in by lazy views.
export function loadStyles() {
  if (document.getElementById('views-css')) return;
  const link = document.createElement('link');
  link.id = 'views-css';
  link.rel = 'stylesheet';
  link.href = 'views.css';
  document.head.appendChild(link);
}
