import { NPC_CREW, PLAYER_CREW } from './crew.js';

const REMOTE_ROLES = ['PILOT', 'ENGR', 'MED'];
const SLOT_KINDS = new Set(['local', 'remote', 'npc']);

function canonicalName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 18).toUpperCase();
}

function localNameFromQuery(query) {
  return canonicalName(query.get('name')) || PLAYER_CREW.name;
}

function slotKind(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'local' || raw === 'you' || raw === 'host') return 'local';
  if (raw === 'remote' || raw === 'player' || raw === 'peer') return 'remote';
  if (raw === 'npc' || raw === 'ai') return 'npc';
  return '';
}

function slotEntriesFromQuery(query) {
  const raw = query.get('slots') || query.get('crewSlots') || '';
  return raw.split(',')
    .map((entry, index) => {
      const [kindRaw, ...nameParts] = String(entry || '').split(':');
      const kind = slotKind(kindRaw);
      const name = canonicalName(nameParts.join(':'));
      if (!SLOT_KINDS.has(kind) || !name) return null;
      return { kind, name, slotNumber: index + 1 };
    })
    .filter(Boolean)
    .slice(0, 4);
}

export function remoteCrewFromQuery(search = globalThis.location?.search || '') {
  const query = new URLSearchParams(search);
  const typedSlots = slotEntriesFromQuery(query);
  if (typedSlots.length) {
    return typedSlots.slice(1)
      .filter(slot => slot.kind === 'remote')
      .slice(0, NPC_CREW.length)
      .map((slot, index) => {
        const fallback = NPC_CREW[Math.max(0, slot.slotNumber - 2)] || NPC_CREW[index];
        return {
          ...fallback,
          id: `remote-${slot.slotNumber}`,
          role: REMOTE_ROLES[Math.max(0, slot.slotNumber - 2)] || fallback.role,
          name: slot.name,
          label: `${slot.name} · PLAYER`,
          remote: true,
          kind: 'remote',
          slotNumber: slot.slotNumber
        };
      });
  }
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
        kind: 'remote',
        slotNumber: index + 2
      };
    });
}

export function buildCrewSlots({ search = globalThis.location?.search || '', maxPlayers = 4 } = {}) {
  const query = new URLSearchParams(search);
  const localName = localNameFromQuery(query);
  const typedSlots = slotEntriesFromQuery(query);
  if (typedSlots.length) {
    const localEntry = typedSlots.find(slot => slot.kind === 'local') || typedSlots[0];
    const localSlot = localEntry?.slotNumber || 1;
    const local = { ...PLAYER_CREW, name: localEntry?.name || localName, label: `${localEntry?.name || localName} · YOU`, kind: 'local', remote: false, slotNumber: localSlot };
    const support = NPC_CREW.map((fallback, index) => {
      const slotNumber = index + 2;
      const slot = typedSlots[slotNumber - 1];
      if (slot?.kind === 'remote') {
        return {
          ...fallback,
          id: `remote-${slotNumber}`,
          role: REMOTE_ROLES[index] || fallback.role,
          name: slot.name,
          label: `${slot.name} · PLAYER`,
          remote: true,
          kind: 'remote',
          slotNumber
        };
      }
      const npcName = slot?.kind === 'npc' ? slot.name : fallback.name;
      return { ...fallback, name: npcName, label: `${npcName} · NPC`, kind: 'npc', remote: false, slotNumber };
    });
    return [local, ...support].slice(0, maxPlayers);
  }
  const local = { ...PLAYER_CREW, name: localName, label: `${localName} · YOU`, kind: 'local', remote: false };
  local.slotNumber = 1;
  const remote = remoteCrewFromQuery(search);
  const support = NPC_CREW.map((fallback, index) => remote[index] || { ...fallback, kind: 'npc', remote: false, slotNumber: index + 2 });
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
