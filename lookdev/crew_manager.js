import { NPC_CREW, PLAYER_CREW } from './crew.js';

const REMOTE_ROLES = ['PILOT', 'ENGR', 'MED'];

function cleanName(value, index) {
  const name = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 18);
  return name ? name.toUpperCase() : `PLAYER ${index + 2}`;
}

export function remoteCrewFromQuery(search = globalThis.location?.search || '') {
  const query = new URLSearchParams(search);
  const raw = query.get('players') || query.get('peers') || query.get('crew') || '';
  return raw.split(',')
    .map((value, index) => ({ value, index }))
    .filter(item => item.value.trim())
    .slice(0, NPC_CREW.length)
    .map(({ value, index }) => {
      const fallback = NPC_CREW[index];
      const name = cleanName(value, index);
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
  const remote = remoteCrewFromQuery(search);
  const support = NPC_CREW.map((fallback, index) => remote[index] || { ...fallback, kind: 'npc', remote: false });
  return [{ ...PLAYER_CREW, kind: 'local', remote: false }, ...support].slice(0, maxPlayers);
}

export function crewSummary(slots = buildCrewSlots()) {
  return {
    total: slots.length,
    remote: slots.filter(member => member.kind === 'remote').length,
    npc: slots.filter(member => member.kind === 'npc').length,
    local: slots.filter(member => member.kind === 'local').length
  };
}
