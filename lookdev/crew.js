// SIGNAL LOST — shared fallback crew manifest.
// Every lookdev scene uses these identities when real players are missing.
export const PLAYER_CREW = {
  id: 'player',
  role: 'CMDR',
  name: 'ASSAD DAR',
  label: 'ASSAD DAR · YOU',
  accent: 0xc8552f,
  css: '#e8884f',
  tone: 0,
  slot: 0
};

export const NPC_CREW = [
  { id: 'reyes', role: 'PILOT', name: 'REYES', accent: 0x2f86c8, css: '#5aa6e8', tone: 1, slot: -1 },
  { id: 'koro', role: 'ENGR', name: 'KORO', accent: 0x3fae5a, css: '#6fce8a', tone: 2, slot: 0 },
  { id: 'lina', role: 'MED', name: 'LINA', accent: 0xb58ad6, css: '#c8a6f0', tone: 3, slot: 1 }
];

export const CREW_MANIFEST = [PLAYER_CREW, ...NPC_CREW];

export function crewLine(name, text) {
  return `<b>${name}</b>: ${text}`;
}
