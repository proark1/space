// Lightweight lobby voice chat for the lookdev room flow.
// Uses the existing room task channel for WebRTC signaling; audio flows peer-to-peer.
export function createLobbyVoiceChat(multiplayer, ui = {}) {
  const button = ui.button || null;
  const statusEl = ui.status || null;
  const meterFill = ui.meterFill || null;
  const rosterEl = ui.roster || null;
  const audioRoot = ui.audioRoot || document.body;
  const crewSlotsProvider = typeof ui.crewSlots === 'function' ? ui.crewSlots : () => (Array.isArray(ui.crewSlots) ? ui.crewSlots : []);

  const peers = new Map();
  let localStream = null;
  let muted = false;
  let requested = false;
  let status = canUseVoice() ? 'idle' : 'unsupported';
  let audioContext = null;
  let analyser = null;
  let meterSamples = null;
  let meterLevel = 0;

  function canUseVoice() {
    return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia && globalThis.RTCPeerConnection);
  }

  function cleanName(value) {
    return String(value || 'CREW').trim().replace(/\s+/g, ' ').slice(0, 18).toUpperCase();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  function peerForName(name) {
    const target = cleanName(name);
    return [...peers.values()].find(entry => cleanName(entry.name) === target) || null;
  }

  function connected(entry) {
    return Boolean(entry && (entry.pc.connectionState === 'connected' || entry.pc.iceConnectionState === 'connected'));
  }

  function statusText() {
    if (status === 'unsupported') return 'VOICE UNAVAILABLE';
    if (status === 'requesting') return 'ALLOW MIC';
    if (status === 'denied') return 'MIC BLOCKED';
    if (status === 'error') return 'MIC ERROR';
    if (!localStream) return 'MIC OFF';
    return muted ? 'MUTED' : 'MIC LIVE';
  }

  function render() {
    if (button) button.textContent = localStream ? (muted ? 'MIC MUTED' : 'MIC ON') : 'MIC';
    if (button) button.classList.toggle('muted', muted || !localStream);
    if (statusEl) statusEl.textContent = statusText();
    if (meterFill) meterFill.style.transform = `scaleX(${Math.max(0.03, meterLevel).toFixed(3)})`;
    if (rosterEl) {
      const crewSlots = crewSlotsProvider();
      const rows = crewSlots.length ? crewSlots.map((slot, index) => {
        const kind = slot.kind === 'local' ? 'local' : slot.kind === 'remote' ? 'remote' : 'npc';
        const entry = kind === 'remote' ? peerForName(slot.name) : null;
        const isLive = kind === 'local' ? Boolean(localStream && !muted) : connected(entry);
        const tag = kind === 'npc' ? 'NPC' : kind === 'local' ? (localStream ? (muted ? 'MUTE' : 'MIC') : 'YOU') : (isLive ? 'SPK' : 'LINK');
        const cls = [kind, isLive ? 'live' : ''].filter(Boolean).join(' ');
        return `<span class="${cls}"><b>${tag}</b> ${escapeHtml(cleanName(slot.name || `CREW ${index + 1}`))}</span>`;
      }) : [...peers.values()]
        .filter(entry => entry.name)
        .map(entry => `<span class="${connected(entry) ? 'live' : ''}"><b>SPK</b> ${escapeHtml(cleanName(entry.name))}</span>`);
      rosterEl.innerHTML = rows.length ? rows.join('') : '<span>NPC COMMS</span>';
    }
  }

  function signal(to, data) {
    if (!to || !multiplayer.selfId) return;
    multiplayer.broadcastTask('voice-signal', { to, from: multiplayer.selfId, data });
  }

  function attachLocalTracks(entry) {
    if (!localStream || entry.hasLocalTracks) return;
    for (const track of localStream.getAudioTracks()) entry.pc.addTrack(track, localStream);
    entry.hasLocalTracks = true;
  }

  async function negotiate(entry) {
    if (!entry || entry.makingOffer || entry.closed) return;
    try {
      entry.makingOffer = true;
      await entry.pc.setLocalDescription(await entry.pc.createOffer());
      signal(entry.id, { description: entry.pc.localDescription });
    } catch {
      status = status === 'active' ? status : 'error';
    } finally {
      entry.makingOffer = false;
      render();
    }
  }

  function ensurePeer(peer) {
    if (!peer?.id || !multiplayer.selfId || peer.id === multiplayer.selfId) return null;
    const existing = peers.get(peer.id);
    if (existing) {
      existing.name = peer.name || existing.name;
      attachLocalTracks(existing);
      render();
      return existing;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    const entry = {
      id: peer.id,
      name: peer.name || `CREW ${peers.size + 2}`,
      pc,
      polite: multiplayer.selfId > peer.id,
      makingOffer: false,
      ignoreOffer: false,
      hasLocalTracks: false,
      closed: false,
      audio: document.createElement('audio'),
    };
    entry.audio.autoplay = true;
    entry.audio.playsInline = true;
    entry.audio.dataset.voicePeer = peer.id;
    audioRoot.appendChild(entry.audio);

    pc.onicecandidate = event => {
      if (event.candidate) signal(peer.id, { candidate: event.candidate });
    };
    pc.ontrack = event => {
      const [stream] = event.streams;
      if (stream && entry.audio.srcObject !== stream) entry.audio.srcObject = stream;
    };
    pc.onconnectionstatechange = render;
    pc.oniceconnectionstatechange = render;
    pc.onnegotiationneeded = () => negotiate(entry);

    peers.set(peer.id, entry);
    attachLocalTracks(entry);
    render();
    if (multiplayer.selfId < peer.id) void negotiate(entry);
    return entry;
  }

  function removePeer(id) {
    const entry = peers.get(id);
    if (!entry) return;
    entry.closed = true;
    entry.pc.close();
    entry.audio.remove();
    peers.delete(id);
    render();
  }

  function syncPeers(roster) {
    const live = roster.filter(peer => peer.lastSeen > 0);
    const liveIds = new Set(live.map(peer => peer.id));
    for (const id of [...peers.keys()]) if (!liveIds.has(id)) removePeer(id);
    live.forEach(ensurePeer);
  }

  async function handleSignal(event) {
    const payload = event.payload || {};
    if (payload.to && payload.to !== multiplayer.selfId) return;
    const from = payload.from || event.from;
    if (!from || from === multiplayer.selfId) return;

    const peer = multiplayer.peers().find(item => item.id === from) || { id: from, name: event.name };
    const entry = ensurePeer(peer);
    if (!entry) return;

    try {
      const data = payload.data || {};
      if (data.description) {
        const description = data.description;
        const offerCollision = description.type === 'offer' && (entry.makingOffer || entry.pc.signalingState !== 'stable');
        entry.ignoreOffer = !entry.polite && offerCollision;
        if (entry.ignoreOffer) return;

        await entry.pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          attachLocalTracks(entry);
          await entry.pc.setLocalDescription(await entry.pc.createAnswer());
          signal(from, { description: entry.pc.localDescription });
        }
      } else if (data.candidate && !entry.ignoreOffer) {
        await entry.pc.addIceCandidate(data.candidate);
      }
    } catch {
      if (!entry.ignoreOffer) status = status === 'active' ? status : 'error';
    } finally {
      render();
    }
  }

  function startMeter() {
    if (!localStream || audioContext || !globalThis.AudioContext && !globalThis.webkitAudioContext) return;
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    audioContext = new Ctor();
    if (audioContext.state === 'suspended') void audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    meterSamples = new Uint8Array(analyser.fftSize);
    audioContext.createMediaStreamSource(localStream).connect(analyser);

    const tick = () => {
      if (!analyser || !meterSamples) return;
      analyser.getByteTimeDomainData(meterSamples);
      let sum = 0;
      for (const sample of meterSamples) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / meterSamples.length);
      meterLevel += (Math.min(1, rms * 9) - meterLevel) * 0.35;
      render();
      requestAnimationFrame(tick);
    };
    tick();
  }

  async function requestMic() {
    if (status === 'unsupported' || status === 'requesting' || localStream) return;
    requested = true;
    status = 'requesting';
    render();
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      status = 'active';
      muted = false;
      localStream.getAudioTracks().forEach(track => { track.enabled = true; });
      startMeter();
      syncPeers(multiplayer.peers());
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      status = name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'error';
    }
    render();
  }

  function toggleMute() {
    if (!localStream) {
      void requestMic();
      return;
    }
    muted = !muted;
    localStream.getAudioTracks().forEach(track => { track.enabled = !muted; });
    render();
  }

  button?.addEventListener('click', event => {
    event.stopPropagation();
    toggleMute();
  });
  window.addEventListener('pointerdown', () => {
    if (!requested && status === 'idle') void requestMic();
  }, { once: true });

  multiplayer.onRoster(syncPeers);
  multiplayer.onTask(event => {
    if (event.type === 'voice-signal') void handleSignal(event);
  });

  render();
  return {
    requestMic,
    toggleMute,
    state() {
      return {
        status,
        muted,
        active: Boolean(localStream),
        meter: meterLevel,
        peers: [...peers.values()].map(entry => ({
          id: entry.id,
          name: entry.name,
          connectionState: entry.pc.connectionState,
          iceConnectionState: entry.pc.iceConnectionState,
        })),
      };
    },
  };
}
