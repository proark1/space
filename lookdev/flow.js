// SIGNAL LOST — playable flow: fade-to-black transitions + auto-advance chain.
// A scene loaded with ?flow=1 auto-advances to the next at its natural end; without it,
// the scene runs standalone (loops) for inspection. Reused by lobby -> pad -> launch -> dock -> game.
export const FLOW = new URLSearchParams(location.search).has('flow');

let el;
function ensure() {
  if (el) return el;
  el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:#000;z-index:80;opacity:1;transition:opacity 1.1s ease;pointer-events:none';
  document.body.appendChild(el);
  return el;
}
// reveal the scene (fade from black)
export function fadeIn() {
  const e = ensure();
  requestAnimationFrame(() => requestAnimationFrame(() => { e.style.opacity = '0'; }));
}
// fade to black, then navigate (guarded so it only fires once)
let going = false;
export function goNext(url) {
  if (going) return; going = true;
  const e = ensure(); e.style.opacity = '1';
  setTimeout(() => { location.href = withCrewParams(url); }, 1100);
}

function withCrewParams(url) {
  const current = new URLSearchParams(location.search);
  const keep = ['players', 'peers', 'crew', 'room', 'code', 'session', 'signal', 'name'];
  if (!keep.some(key => current.has(key))) return url;
  const next = new URL(url, location.href);
  keep.forEach(key => {
    if (current.has(key) && !next.searchParams.has(key)) next.searchParams.set(key, current.get(key));
  });
  return next.pathname + next.search + next.hash;
}
