const KEEP_PARAMS = ['room', 'code', 'session', 'signal', 'name', 'players', 'peers', 'crew', 'host', 'join'];

function roomCode(query) {
  return (query.get('room') || query.get('code') || query.get('session') || '').trim().toUpperCase();
}

function playerName(query) {
  const raw = (query.get('name') || localStorage.getItem('sl-player-name') || '').trim();
  if (raw) return raw.slice(0, 18).toUpperCase();
  const generated = `PLAYER-${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('sl-player-name', generated);
  return generated;
}

function roomUrl(baseUrl, code) {
  const url = new URL(baseUrl || location.origin, location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}/room/${code}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function clonePose(pose) {
  return {
    x: Number(pose?.x) || 0,
    y: Number(pose?.y) || 0,
    z: Number(pose?.z) || 0,
    yaw: Number(pose?.yaw) || 0,
    hidden: Boolean(pose?.hidden),
    scene: String(pose?.scene || '')
  };
}

export function crewFlowQuery(search = location.search) {
  const current = new URLSearchParams(search);
  const next = new URLSearchParams();
  KEEP_PARAMS.forEach(key => {
    if (current.has(key)) next.set(key, current.get(key));
  });
  const suffix = next.toString();
  return suffix ? `?${suffix}` : '';
}

export function createLookdevMultiplayer({ scene = 'scene', enabled = true } = {}) {
  const query = new URLSearchParams(location.search);
  const code = roomCode(query);
  const wantsHost = /^(1|true|yes)$/i.test(query.get('host') || '');
  const signal = query.get('signal') || localStorage.getItem('sl-signal-url') || '';
  const name = playerName(query);
  const peers = new Map();
  const rosterCallbacks = new Set();
  const taskCallbacks = new Set();
  const stateCallbacks = new Set();
  const hostCallbacks = new Set();
  let ws = null;
  let selfId = '';
  let hostId = '';
  let status = code && enabled ? 'connecting' : 'offline';
  let lastPoseAt = 0;
  let lastStateRev = -1;

  if (signal) localStorage.setItem('sl-signal-url', signal);

  const snapshot = () => [...peers.entries()].map(([id, peer]) => ({ id, ...peer }));
  const emitRoster = () => {
    const list = snapshot();
    rosterCallbacks.forEach(cb => cb(list));
  };
  const electHost = (preferred = '') => {
    const previous = hostId;
    if (preferred) hostId = preferred;
    else if (!hostId || (hostId !== selfId && !peers.has(hostId))) {
      hostId = [selfId, ...peers.keys()].filter(Boolean).sort()[0] || '';
    }
    if (hostId !== previous) hostCallbacks.forEach(cb => cb(hostId, hostId === selfId));
  };
  const send = (to, data) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !to) return;
    ws.send(JSON.stringify({ t: 'signal', to, data }));
  };
  const broadcast = data => {
    for (const id of peers.keys()) send(id, data);
  };
  const isLocalHost = () => Boolean(code && selfId && hostId === selfId) || !code;
  const hello = to => send(to, { kind: 'hello', name, scene, host: isLocalHost(), at: Date.now() });

  if (code && enabled) {
    try {
      ws = new WebSocket(roomUrl(signal || location.origin, code));
      ws.addEventListener('open', () => {
        status = 'connected';
        emitRoster();
      });
      ws.addEventListener('close', () => {
        status = 'offline';
        emitRoster();
      });
      ws.addEventListener('error', () => {
        status = 'failed';
        emitRoster();
      });
      ws.addEventListener('message', event => {
        if (typeof event.data !== 'string') return;
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.t === 'welcome') {
          selfId = msg.self || '';
          (msg.peers || []).forEach(id => peers.set(id, peers.get(id) || { name: `CREW ${peers.size + 2}`, scene: '', pose: null, lastSeen: 0 }));
          electHost(wantsHost ? selfId : ((msg.peers && msg.peers[0]) || selfId));
          emitRoster();
          peers.forEach((_, id) => hello(id));
        } else if (msg.t === 'peer-join' && msg.peerId) {
          peers.set(msg.peerId, peers.get(msg.peerId) || { name: `CREW ${peers.size + 2}`, scene: '', pose: null, lastSeen: 0 });
          electHost(wantsHost ? selfId : '');
          emitRoster();
          hello(msg.peerId);
        } else if (msg.t === 'peer-leave' && msg.peerId) {
          peers.delete(msg.peerId);
          electHost();
          emitRoster();
        } else if (msg.t === 'signal' && msg.from && msg.data) {
          const peer = peers.get(msg.from) || { name: `CREW ${peers.size + 2}`, scene: '', pose: null, lastSeen: 0 };
          if (msg.data.kind === 'hello') {
            peer.name = String(msg.data.name || peer.name).slice(0, 18).toUpperCase();
            peer.scene = String(msg.data.scene || '');
            peer.lastSeen = Date.now();
            peers.set(msg.from, peer);
            if (msg.data.host) electHost(msg.from);
            emitRoster();
          } else if (msg.data.kind === 'pose') {
            peer.pose = clonePose(msg.data.pose);
            peer.scene = peer.pose.scene || peer.scene;
            peer.lastSeen = Date.now();
            peers.set(msg.from, peer);
          } else if (msg.data.kind === 'task') {
            taskCallbacks.forEach(cb => cb({ from: msg.from, name: peer.name, type: msg.data.type, payload: msg.data.payload || {} }));
          } else if (msg.data.kind === 'room-state') {
            const rev = Number(msg.data.rev) || 0;
            if (rev >= lastStateRev) {
              lastStateRev = rev;
              stateCallbacks.forEach(cb => cb(msg.data.state || {}, { from: msg.from, rev }));
            }
          } else if (msg.data.kind === 'state-request' && hostId === selfId) {
            taskCallbacks.forEach(cb => cb({ from: msg.from, name: peer.name, type: 'state-request', payload: {} }));
          }
        }
      });
    } catch {
      status = 'failed';
    }
  }

  return {
    code,
    name,
    get selfId() { return selfId; },
    get hostId() { return hostId; },
    isHost() { return isLocalHost(); },
    state() { return { status, code, selfId, hostId, isHost: isLocalHost(), name, peers: peers.size, scene }; },
    peers: snapshot,
    remoteNames() { return snapshot().map(peer => peer.name); },
    remotePose(id) { return peers.get(id)?.pose || null; },
    remotePoses() {
      const out = {};
      peers.forEach((peer, id) => { if (peer.pose) out[id] = peer.pose; });
      return out;
    },
    onRoster(cb) { rosterCallbacks.add(cb); cb(snapshot()); return () => rosterCallbacks.delete(cb); },
    onTask(cb) { taskCallbacks.add(cb); return () => taskCallbacks.delete(cb); },
    onRoomState(cb) { stateCallbacks.add(cb); return () => stateCallbacks.delete(cb); },
    onHostChange(cb) { hostCallbacks.add(cb); return () => hostCallbacks.delete(cb); },
    publishPose(pose) {
      const now = performance.now();
      if (!code || status !== 'connected' || now - lastPoseAt < 80) return;
      lastPoseAt = now;
      broadcast({ kind: 'pose', pose: { ...clonePose(pose), scene } });
    },
    broadcastTask(type, payload = {}) { broadcast({ kind: 'task', type, payload }); },
    publishRoomState(state, rev = Date.now()) {
      if (!code || status !== 'connected' || hostId !== selfId) return;
      broadcast({ kind: 'room-state', rev, state });
    },
    requestRoomState() { broadcast({ kind: 'state-request' }); },
    close() { if (ws) ws.close(); }
  };
}
