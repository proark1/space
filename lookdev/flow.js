// SIGNAL LOST — playable flow: fade-to-black transitions + auto-advance chain.
// A scene loaded with ?flow=1 auto-advances to the next at its natural end; without it,
// the scene runs standalone (loops) for inspection. Reused by lobby -> pad -> launch -> dock -> game.
export const FLOW = new URLSearchParams(location.search).has('flow');
export const FLOW_ORDER = ['lobby', 'boardRocket', 'launch', 'capsule', 'docking', 'station', 'command', 'returnExtraction'];
export const FLOW_ENDGAME = 'return-extraction';
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
export function goNext(url, params = {}) {
  if (going) return; going = true;
  const e = ensure(); e.style.opacity = '1';
  setTimeout(() => { location.href = withCrewParams(url, params); }, 1100);
}

export function flowSession(stage = 'unknown', params = {}) {
  const query = new URLSearchParams(location.search);
  applyParams(query, params);
  const name = cleanName(query.get('name') || localStorage.getItem('sl-player-name') || 'PLAYER');
  const roster = rosterFrom(query);
  if (name && !roster.includes(name)) roster.unshift(name);
  while (roster.length < 4) roster.push(`NPC ${roster.length}`);
  roster.length = Math.min(roster.length, 4);
  const stageIndex = FLOW_ORDER.indexOf(stage);
  return {
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
    playerSlot: Math.max(0, roster.indexOf(name)),
    objective: query.get('objective') || FLOW_OBJECTIVES[stage] || '',
    endgame: query.get('endgame') || FLOW_ENDGAME,
  };
}

function withCrewParams(url, params = {}) {
  const current = new URLSearchParams(location.search);
  const keep = ['players', 'peers', 'crew', 'room', 'code', 'session', 'signal', 'name', 'host', 'join', 'slot', 'objective', 'endgame'];
  const next = new URL(url, location.href);
  keep.forEach(key => {
    if (current.has(key) && !next.searchParams.has(key)) next.searchParams.set(key, current.get(key));
  });
  applyParams(next.searchParams, params);
  if (FLOW && !next.searchParams.has('endgame')) next.searchParams.set('endgame', FLOW_ENDGAME);
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
