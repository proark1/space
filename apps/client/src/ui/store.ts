import { create } from 'zustand';
import type { ConnectionState } from '@sl/shared-types';
import {
  buildIceServers,
  createSession,
  generateRoomCode,
  isValidRoomCode,
  type Session,
  type SessionEvents,
  type NetStatsView,
} from '@sl/netcode';

interface NetState {
  status: ConnectionState;
  code: string;
  isHost: boolean;
  peers: string[];
  log: string[];
  session: Session | null;
  stats: NetStatsView | null;
  lostReason: string | null;
  showDebug: boolean;
  tickTimer: number | null;
  host: () => void;
  join: (code: string) => void;
  leave: () => void;
  toggleDebug: () => void;
}

export const useNet = create<NetState>()((set, get) => {
  const events = (): SessionEvents => ({
    onState: (status) => set({ status }),
    onPeers: (peers) => set({ peers }),
    onLog: (msg) => set((s) => ({ log: [...s.log, msg].slice(-60) })),
    onStats: (stats) => set({ stats }),
    onHostLost: () => set({ status: 'failed', lostReason: 'host lost' }),
  });

  // 4 Hz: drives ping scheduling, the host-loss check, and stats emission.
  const startTicking = (session: Session): number =>
    setInterval(() => session.tick(), 250) as unknown as number;

  const stop = (): void => {
    const { session, tickTimer } = get();
    session?.leave();
    if (tickTimer !== null) clearInterval(tickTimer);
  };

  const begin = (isHost: boolean, code: string, firstLog: string): void => {
    stop();
    const session = createSession({ code, isHost, iceServers: buildIceServers({}), events: events() });
    set({
      code,
      isHost,
      session,
      peers: [],
      log: [firstLog],
      stats: null,
      lostReason: null,
      tickTimer: startTicking(session),
    });
  };

  return {
    status: 'idle',
    code: '',
    isHost: false,
    peers: [],
    log: [],
    session: null,
    stats: null,
    lostReason: null,
    showDebug: false,
    tickTimer: null,

    host: () => {
      const code = generateRoomCode();
      begin(true, code, `hosting room ${code}`);
    },

    join: (raw) => {
      const code = raw.trim().toUpperCase();
      if (!isValidRoomCode(code)) {
        set((s) => ({ log: [...s.log, `invalid code: ${raw || '(empty)'}`] }));
        return;
      }
      begin(false, code, `joining room ${code}`);
    },

    leave: () => {
      stop();
      set({
        session: null,
        tickTimer: null,
        status: 'idle',
        peers: [],
        isHost: false,
        code: '',
        stats: null,
        lostReason: null,
      });
    },

    toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),
  };
});
