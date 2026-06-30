// SIGNAL LOST playable flow: warm the next scene, preserve crew/session params,
// and cross-fade with a short in-fiction shutter instead of a hard page cut.
const SEARCH = new URLSearchParams(location.search);
export const PRELOAD = SEARCH.has('preload');
export const FLOW = SEARCH.has('flow') && !PRELOAD;

let el;
let warmFrame;
let going = false;

function ensure() {
  if (el) return el;
  el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'position:fixed',
    'inset:0',
    'background:#000',
    'z-index:80',
    'opacity:1',
    'transition:opacity .48s ease',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(el);

  const sweep = document.createElement('div');
  sweep.style.cssText = [
    'position:absolute',
    'inset:0',
    'background:linear-gradient(90deg, transparent, rgba(159,208,255,.12), transparent)',
    'transform:translateX(-100%)',
    'animation:slFlowSweep 1.2s linear infinite',
    'mix-blend-mode:screen',
  ].join(';');
  el.appendChild(sweep);

  if (!document.getElementById('sl-flow-style')) {
    const style = document.createElement('style');
    style.id = 'sl-flow-style';
    style.textContent = '@keyframes slFlowSweep{to{transform:translateX(100%)}}';
    document.head.appendChild(style);
  }
  return el;
}

export function fadeIn() {
  const e = ensure();
  requestAnimationFrame(() => requestAnimationFrame(() => { e.style.opacity = '0'; }));
}

export function flowUrl(url) {
  return withCrewParams(url);
}

export function preloadNext(url, { frame = true } = {}) {
  if (!FLOW || PRELOAD) return;
  const href = withCrewParams(url);
  const absolute = new URL(href, location.href);

  for (const rel of ['prefetch', 'preload']) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = absolute.href;
    if (rel === 'preload') link.as = 'document';
    document.head.appendChild(link);
  }

  fetch(absolute.href, { cache: 'force-cache', credentials: 'same-origin' }).catch(() => undefined);

  if (!frame) return;
  requestIdleCallbackCompat(() => {
    if (warmFrame || going) return;
    absolute.searchParams.set('preload', '1');
    warmFrame = document.createElement('iframe');
    warmFrame.src = absolute.href;
    warmFrame.tabIndex = -1;
    warmFrame.setAttribute('aria-hidden', 'true');
    warmFrame.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;opacity:0;pointer-events:none;border:0';
    document.body.appendChild(warmFrame);
    setTimeout(() => {
      if (warmFrame && !going) {
        warmFrame.remove();
        warmFrame = null;
      }
    }, 18000);
  });
}

export function goNext(url, { transitionMs = 520 } = {}) {
  if (going) return;
  going = true;
  const e = ensure();
  e.style.transitionDuration = `${transitionMs}ms`;
  e.style.opacity = '1';
  setTimeout(() => { location.href = withCrewParams(url); }, transitionMs);
}

function requestIdleCallbackCompat(fn) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(fn, { timeout: 1800 });
  } else {
    setTimeout(fn, 450);
  }
}

function withCrewParams(url) {
  const current = new URLSearchParams(location.search);
  const keep = ['players', 'peers', 'crew', 'room', 'code', 'session', 'signal', 'name'];
  const next = new URL(url, location.href);
  keep.forEach((key) => {
    if (current.has(key) && !next.searchParams.has(key)) next.searchParams.set(key, current.get(key));
  });
  return next.pathname + next.search + next.hash;
}
