import { NPC_CREW, PLAYER_CREW } from './crew.js';

const REMOTE_ROLES = ['PILOT', 'ENGR', 'MED'];

function canonicalName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 18).toUpperCase();
}

function localNameFromQuery(query) {
  return canonicalName(query.get('name')) || PLAYER_CREW.name;
}

export function remoteCrewFromQuery(search = globalThis.location?.search || '') {
  const query = new URLSearchParams(search);
  const seen = new Set([localNameFromQuery(query)]);
  const raw = query.get('players') || query.get('peers') || query.get('crew') || '';
  return raw.split(',')
    .map(value => canonicalName(value))
    .filter(name => {
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .slice(0, NPC_CREW.length)
    .map((name, index) => {
      const fallback = NPC_CREW[index];
      return {
        ...fallback,
        id: `remote-${index + 1}`,
        role: REMOTE_ROLES[index] || fallback.role,
        name,
        label: `${name} · PLAYER`,
        remote: true,
        kind: 'remote'
      };
    });
}

export function buildCrewSlots({ search = globalThis.location?.search || '', maxPlayers = 4 } = {}) {
  const query = new URLSearchParams(search);
  const localName = localNameFromQuery(query);
  const local = { ...PLAYER_CREW, name: localName, label: `${localName} · YOU`, kind: 'local', remote: false };
  const remote = remoteCrewFromQuery(search);
  const support = NPC_CREW.map((fallback, index) => remote[index] || { ...fallback, kind: 'npc', remote: false });
  return [local, ...support].slice(0, maxPlayers);
}

export function crewSummary(slots = buildCrewSlots()) {
  return {
    total: slots.length,
    remote: slots.filter(member => member.kind === 'remote').length,
    npc: slots.filter(member => member.kind === 'npc').length,
    local: slots.filter(member => member.kind === 'local').length
  };
}
