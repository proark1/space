// SIGNAL LOST — playable flow: fade-to-black transitions + auto-advance chain.
// A scene loaded with ?flow=1 auto-advances to the next at its natural end; without it,
// the scene runs standalone (loops) for inspection. Reused by lobby -> pad -> launch -> dock -> game.
export const FLOW = new URLSearchParams(location.search).has('flow');
export const FLOW_ORDER = ['lobby', 'boardRocket', 'launch', 'capsule', 'docking', 'station', 'command', 'returnExtraction'];
export const FLOW_ENDGAME = 'return-extraction';
const FLOW_STORAGE_KEY = 'signal-lost-flow-session-v1';
const FLOW_TRANSITION_KEY = 'signal-lost-flow-transition-v1';
const FLOW_FADE_MS = 620;
const FLOW_ENTER_MS = 460;
const FLOW_PRELOAD_WAIT_MS = 950;
const FLOW_PREFETCH_HORIZON = 2;
const FLOW_KEEP_PARAMS = ['players', 'peers', 'crew', 'slots', 'crewSlots', 'room', 'code', 'session', 'signal', 'name', 'host', 'join', 'slot', 'objective', 'endgame'];
const FLOW_ROUTE_NEXT = {
  '/lobby': '/pad?flow=1',
  '/pad': '/launch?flow=1',
  '/launch': '/dock?flow=1',
  '/dock': '/game?flow=1',
};
const COMMON_MODULES = [
  './nav.js?v=2',
  './flow.js',
  './audio.js',
  './crew.js',
  './crew_manager.js',
  './multiplayer.js',
  './voice_chat.js',
  './units_alpha.js?v=5',
  './station_parts.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/PointerLockControls.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js',
];
const preloadedUrls = new Set();
const preloadPromises = new Map();
const modulePreloaded = new Set();
const speculationRules = new Set();
let prerenderedHref = '';
const FLOW_OBJECTIVES = {
  lobby: 'assemble crew',
  boardRocket: 'board the rocket',
  launch: 'clear the tower',
  capsule: 'ride capsule to station',
  docking: 'dock with the real station port',
  station: 'reach command center',
  command: 'recover physical tapes',
  returnExtraction: 'bring tapes back to Earth',
};

let el;
function ensure() {
  if (el) return el;
  el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;background:#000;z-index:2147483000;opacity:1;transition:opacity ${FLOW_ENTER_MS}ms ease;pointer-events:none;will-change:opacity;transform:translateZ(0)`;
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  return el;
}
// reveal the scene (fade from black)
export function fadeIn() {
  const e = ensure();
  consumeTransition();
  e.style.transitionDuration = `${FLOW_ENTER_MS}ms`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    e.style.opacity = '0';
    e.style.pointerEvents = 'none';
  }));
}
// fade to black, then navigate (guarded so it only fires once)
let going = false;
export function goNext(url, params = {}) {
  if (going) return; going = true;
  const href = preloadNext(url, params);
  rememberTransition(href);
  const e = ensure();
  e.style.transitionDuration = `${FLOW_FADE_MS}ms`;
  e.style.pointerEvents = 'auto';
  e.style.opacity = '1';
  e.dataset.next = href;
  const ready = preloadPromises.get(href) || Promise.resolve(href);
  const waitForPreload = Promise.race([ready, sleep(FLOW_PRELOAD_WAIT_MS)]);
  Promise.all([sleep(FLOW_FADE_MS), waitForPreload]).then(() => { location.href = href; });
}

export function preloadNext(url, params = {}, opts = {}) {
  const href = withCrewParams(url, params);
  preloadCommonModules();
  preloadDocument(href, { warm: opts.warm !== false });
  preloadFlowLookahead(href);
  return href;
}

function preloadDocument(href, opts = {}) {
  if (preloadedUrls.has(href)) return preloadPromises.get(href) || Promise.resolve(href);
  preloadedUrls.add(href);
  try {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'document';
    link.href = href;
    link.fetchPriority = 'low';
    link.dataset.flowPreload = '1';
    document.head.appendChild(link);
  } catch {
    // Preload is a polish path; navigation still works without it.
  }
  addSpeculationRule(href, 'prefetch');
  if (opts.warm && !prerenderedHref && canPrerender(href)) {
    prerenderedHref = href;
    addSpeculationRule(href, 'prerender');
  }
  const promise = fetchDocument(href);
  preloadPromises.set(href, promise);
  return promise;
}

function preloadCommonModules() {
  for (const src of COMMON_MODULES) {
    try {
      const href = new URL(src, location.href).href;
      if (modulePreloaded.has(href)) continue;
      modulePreloaded.add(href);
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = href;
      link.fetchPriority = 'low';
      link.dataset.flowPreload = '1';
      document.head.appendChild(link);
    } catch {
      // Module warm-up is best-effort.
    }
  }
}

function preloadFlowLookahead(seedHref) {
  if (!FLOW) return;
  let seed = new URL(seedHref, location.href);
  for (let i = 0; i < FLOW_PREFETCH_HORIZON; i += 1) {
    const next = nextFlowHref(seed);
    if (!next) return;
    preloadDocument(next, { warm: false });
    seed = new URL(next, location.href);
  }
}

function nextFlowHref(seedUrl) {
  const path = normalizePath(seedUrl.pathname);
  const next = FLOW_ROUTE_NEXT[path];
  return next ? withCrewParams(next, {}, seedUrl.searchParams) : '';
}

function normalizePath(path) {
  return (String(path || '').replace(/\/+$/, '') || '/');
}

function fetchDocument(href) {
  try {
    const target = new URL(href, location.href);
    if (target.origin !== location.origin || !window.fetch) return Promise.resolve(href);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    return fetch(target.href, {
      cache: 'force-cache',
      credentials: 'same-origin',
      priority: 'low',
      signal: controller.signal,
    })
      .then(response => response.arrayBuffer())
      .catch(() => null)
      .finally(() => clearTimeout(timer))
      .then(() => href);
  } catch {
    return Promise.resolve(href);
  }
}

function addSpeculationRule(href, mode) {
  try {
    if (typeof HTMLScriptElement === 'undefined' || typeof HTMLScriptElement.supports !== 'function' || !HTMLScriptElement.supports('speculationrules')) return;
    const target = new URL(href, location.href);
    if (target.origin !== location.origin) return;
    const key = `${mode}:${target.href}`;
    if (speculationRules.has(key)) return;
    speculationRules.add(key);
    const script = document.createElement('script');
    script.type = 'speculationrules';
    script.text = JSON.stringify({
      [mode]: [{
        source: 'list',
        urls: [target.href],
        eagerness: mode === 'prerender' ? 'eager' : 'moderate',
      }],
    });
    document.head.appendChild(script);
  } catch {
    // Unsupported browsers simply use the regular preload/fetch path.
  }
}

function canPrerender(href) {
  try {
    const current = new URL(location.href);
    const target = new URL(href, location.href);
    return FLOW && target.origin === current.origin && !hasLiveRoom(current.searchParams) && !hasLiveRoom(target.searchParams);
  } catch {
    return false;
  }
}

function hasLiveRoom(searchParams) {
  return ['room', 'code', 'session', 'signal'].some(key => searchParams.has(key));
}

function rememberTransition(href) {
  try {
    sessionStorage.setItem(FLOW_TRANSITION_KEY, JSON.stringify({ href, at: Date.now(), fadeMs: FLOW_FADE_MS }));
  } catch {
    // Transition memory is cosmetic; navigation still works.
  }
}

function consumeTransition() {
  try {
    const raw = sessionStorage.getItem(FLOW_TRANSITION_KEY);
    if (raw) sessionStorage.removeItem(FLOW_TRANSITION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function flowSession(stage = 'unknown', params = {}) {
  const query = new URLSearchParams(location.search);
  applyParams(query, params);
  const stored = readStoredSession(query);
  const name = cleanName(query.get('name') || localStorage.getItem('sl-player-name') || 'PLAYER');
  const crewSlots = slotsFrom(query);
  const roster = crewSlots.length ? crewSlots.map(slot => slot.name) : rosterFrom(query);
  if (name && !roster.includes(name)) roster.unshift(name);
  while (roster.length < 4) roster.push(`NPC ${roster.length}`);
  roster.length = Math.min(roster.length, 4);
  const stageIndex = FLOW_ORDER.indexOf(stage);
  const storedObjective = stored.objectives?.[stage] || (stored.stage === stage ? stored.currentObjective : '');
  const objective = query.get('objective') || storedObjective || FLOW_OBJECTIVES[stage] || '';
  const session = {
    active: query.has('flow'),
    stage,
    stageIndex,
    nextStage: stageIndex >= 0 ? FLOW_ORDER[stageIndex + 1] || '' : '',
    roomCode: (query.get('room') || query.get('code') || query.get('session') || '').trim().toUpperCase(),
    signal: query.get('signal') || '',
    name,
    host: /^(1|true|yes)$/i.test(query.get('host') || ''),
    join: /^(1|true|yes)$/i.test(query.get('join') || ''),
    roster,
    crewSlots: crewSlots.length ? crewSlots : roster.map((slotName, index) => ({ kind: index === 0 ? 'local' : (slotName.startsWith('NPC ') ? 'npc' : 'remote'), name: slotName, slotNumber: index + 1 })),
    playerSlot: Math.max(0, roster.indexOf(name)),
    playerSlotNumber: Math.max(1, roster.indexOf(name) + 1),
    objective,
    endgame: query.get('endgame') || FLOW_ENDGAME,
    preloads: [...preloadedUrls],
  };
  session.persisted = persistFlowSession(query, session);
  return session;
}

export function rememberFlowObjective(stage = 'unknown', objective = '', params = {}) {
  const text = String(objective || '').trim();
  if (!text) return null;
  const query = new URLSearchParams(location.search);
  applyParams(query, params);
  const stored = readStoredSession(query);
  const objectives = { ...(stored.objectives || {}), [stage]: text };
  const payload = {
    ...stored,
    key: storageKey(query),
    stage,
    stageIndex: FLOW_ORDER.indexOf(stage),
    currentObjective: text,
    objectives,
    endgame: query.get('endgame') || stored.endgame || FLOW_ENDGAME,
    updatedAt: Date.now(),
  };
  writeStoredSession(query, payload);
  return payload;
}

function withCrewParams(url, params = {}, source = new URLSearchParams(location.search)) {
  const current = source instanceof URLSearchParams ? source : new URLSearchParams(source);
  const next = new URL(url, location.href);
  FLOW_KEEP_PARAMS.forEach(key => {
    if (current.has(key) && !next.searchParams.has(key)) next.searchParams.set(key, current.get(key));
  });
  applyParams(next.searchParams, params);
  if ((FLOW || current.has('flow') || next.searchParams.has('flow')) && !next.searchParams.has('endgame')) next.searchParams.set('endgame', FLOW_ENDGAME);
  return next.pathname + next.search + next.hash;
}

function applyParams(searchParams, params = {}) {
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
  });
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 18).toUpperCase();
}

function rosterFrom(query) {
  const raw = query.get('players') || query.get('crew') || query.get('peers') || '';
  const seen = new Set();
  const roster = [];
  raw.split(',').forEach(value => {
    const name = cleanName(value);
    if (!name || seen.has(name)) return;
    seen.add(name);
    roster.push(name);
  });
  return roster;
}

function slotKind(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'local' || raw === 'you' || raw === 'host') return 'local';
  if (raw === 'remote' || raw === 'player' || raw === 'peer') return 'remote';
  if (raw === 'npc' || raw === 'ai') return 'npc';
  return '';
}

function slotsFrom(query) {
  const raw = query.get('slots') || query.get('crewSlots') || '';
  return raw.split(',')
    .map((entry, index) => {
      const [kindRaw, ...nameParts] = String(entry || '').split(':');
      const kind = slotKind(kindRaw);
      const name = cleanName(nameParts.join(':'));
      return kind && name ? { kind, name, slotNumber: index + 1 } : null;
    })
    .filter(Boolean)
    .slice(0, 4);
}

function storageKey(query) {
  const room = (query.get('room') || query.get('code') || query.get('session') || 'solo').trim().toUpperCase();
  const name = cleanName(query.get('name') || localStorage.getItem('sl-player-name') || 'PLAYER');
  return `${room || 'solo'}:${name || 'PLAYER'}`;
}

function readFlowStore() {
  try {
    return JSON.parse(sessionStorage.getItem(FLOW_STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeFlowStore(store) {
  try {
    sessionStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage is best-effort; URLs still carry the critical live handoff.
  }
}

function readStoredSession(query) {
  return readFlowStore()[storageKey(query)] || {};
}

function writeStoredSession(query, session) {
  const store = readFlowStore();
  store[storageKey(query)] = session;
  writeFlowStore(store);
}

function persistFlowSession(query, session) {
  const previous = readStoredSession(query);
  const objectives = { ...(previous.objectives || {}) };
  if (session.objective) objectives[session.stage] = session.objective;
  const persisted = {
    ...previous,
    key: storageKey(query),
    active: session.active,
    stage: session.stage,
    stageIndex: session.stageIndex,
    currentObjective: session.objective,
    objectives,
    roomCode: session.roomCode,
    signal: session.signal,
    name: session.name,
    roster: session.roster,
    crewSlots: session.crewSlots,
    playerSlot: session.playerSlot,
    playerSlotNumber: session.playerSlotNumber,
    endgame: session.endgame,
    updatedAt: Date.now(),
  };
  writeStoredSession(query, persisted);
  return persisted;
}
