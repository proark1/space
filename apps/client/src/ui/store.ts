import { create } from 'zustand';
import type { ConnectionState } from '@sl/shared-types';
import {
  buildIceServers,
  createSession,
  generateRoomCode,
  isValidRoomCode,
  type Session,
  type SessionEvents,
} from '@sl/netcode';

interface NetState {
  status: ConnectionState;
  code: string;
  isHost: boolean;
  peers: string[];
  log: string[];
  session: Session | null;
  host: () => void;
  join: (code: string) => void;
  leave: () => void;
}

export const useNet = create<NetState>()((set, get) => {
  const events = (): SessionEvents => ({
    onState: (status) => set({ status }),
    onPeers: (peers) => set({ peers }),
    onLog: (msg) => set((s) => ({ log: [...s.log, msg].slice(-60) })),
  });

  return {
    status: 'idle',
    code: '',
    isHost: false,
    peers: [],
    log: [],
    session: null,

    host: () => {
      get().session?.leave();
      const code = generateRoomCode();
      const session = createSession({
        code,
        isHost: true,
        iceServers: buildIceServers({}),
        events: events(),
      });
      set({ code, isHost: true, session, peers: [], log: [`hosting room ${code}`] });
    },

    join: (raw) => {
      const code = raw.trim().toUpperCase();
      if (!isValidRoomCode(code)) {
        set((s) => ({ log: [...s.log, `invalid code: ${raw || '(empty)'}`] }));
        return;
      }
      get().session?.leave();
      const session = createSession({
        code,
        isHost: false,
        iceServers: buildIceServers({}),
        events: events(),
      });
      set({ code, isHost: false, session, peers: [], log: [`joining room ${code}`] });
    },

    leave: () => {
      get().session?.leave();
      set({ session: null, status: 'idle', peers: [], isHost: false, code: '' });
    },
  };
});
