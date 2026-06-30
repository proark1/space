// SIGNAL LOST — M-LOOK harness entry.
// Default scene is the WALKABLE slice: first-person WASD + mouse-look through the greybox corridor,
// the player capsule driven by the Rapier KCC and the camera/flashlight riding its ECS Transform.
// ?scene=corridor is the look-only auto-cam variant; ?scene=chaos is the Phase B perf probe (`n`
// dynamic Rapier boxes, 300 by default). ?gl=2 forces the WebGL2 floor; ?tier=low|mid|high|ultra.
import { createRenderer, createPostStack } from '@sl/render';
import { createGameplaySession, GameLoop, type GameplayNetDriver } from '@sl/engine';
import { buildIceServers, Buttons, fetchTurnIceEnv, generateRoomCode, isValidRoomCode } from '@sl/netcode';
import { useHudStore } from '@sl/ui';
import { queryRemotePlayers, Transform, type GameWorld } from '@sl/ecs';
import { createChaosScene } from './chaosScene';
import { createCorridorScene } from './corridorScene';
import { createWalkScene } from './walkScene';
import type { HarnessScene } from './scene';
import type { WalkSceneHandle } from './walkScene';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const hud = document.getElementById('hud');
const netPanel = document.getElementById('net');

function envString(name: string): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>;
  return env[name];
}

function turnUrls(): string[] | undefined {
  const raw = envString('VITE_TURN_URLS');
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
}

function envFlag(name: string): boolean {
  const raw = envString(name);
  return raw === '1' || raw === 'true';
}

function iceTransportPolicy(): RTCIceTransportPolicy | undefined {
  const raw = envString('VITE_ICE_TRANSPORT_POLICY');
  if (envFlag('VITE_FORCE_RELAY') || raw === 'relay') return 'relay';
  return raw === 'all' ? 'all' : undefined;
}

function buttonsFromMove(move: { x: number; z: number }): number {
  let buttons = 0;
  if (move.z > 0) buttons |= Buttons.Fwd;
  if (move.z < 0) buttons |= Buttons.Back;
  if (move.x < 0) buttons |= Buttons.Left;
  if (move.x > 0) buttons |= Buttons.Right;
  return buttons;
}

function isWalkScene(scene: HarnessScene): scene is WalkSceneHandle {
  return 'game' in scene && 'controls' in scene && 'setRemoteWorld' in scene;
}

function remotePlayerPositions(world: GameWorld | undefined): Array<{ x: number; y: number; z: number }> {
  if (!world) return [];
  return [...queryRemotePlayers(world)].map((eid) => ({
    x: Transform.x[eid] ?? 0,
    y: Transform.y[eid] ?? 0,
    z: Transform.z[eid] ?? 0,
  }));
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const forceBackend = params.get('gl') === '2' ? 'webgl2' : undefined;
  const tier = (['low', 'mid', 'high', 'ultra'] as const).find((t) => t === params.get('tier'));
  const count = Math.max(1, Math.min(2000, Math.floor(Number(params.get('n')) || 300)));

  const renderer = await createRenderer({ canvas, forceBackend, tier });
  const sceneParam = params.get('scene');
  const harness: HarnessScene =
    sceneParam === 'chaos'
      ? await createChaosScene(count)
      : sceneParam === 'corridor'
        ? createCorridorScene(renderer.profile)
        : await createWalkScene(renderer.profile, canvas);
  const post = createPostStack(renderer, harness.scene, harness.camera, renderer.profile);
  let netDriver: GameplayNetDriver | undefined;
  let netMode: 'offline' | 'host' | 'client' = 'offline';
  let netPeers = 0;
  let netState = 'offline';
  const hostInputStats = new Map<string, { packets: number; cmds: number; fwd: number }>();

  // Internal-res crunch — the dominant PS1 cue (the lookdev's own technique): render at a fraction
  // and let CSS upscale with nearest (#scene { image-rendering: pixelated }). pixelRatio 1 so the
  // DPR doesn't undo the crunch; RETRO is Director-ramp ready (lower it under dread).
  const RETRO = 0.5;
  renderer.three.setPixelRatio(1);
  const resize = (): void => {
    const w = window.innerWidth || canvas.clientWidth || 960;
    const h = window.innerHeight || canvas.clientHeight || 600;
    renderer.three.setSize(Math.max(1, Math.round(w * RETRO)), Math.max(1, Math.round(h * RETRO)), false);
    // The small buffer must still DISPLAY at full size (CSS upscales it); set explicit px (= viewport
    // size in a real browser) so it survives headless 0-width 100vw and overrides three's inline px.
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    harness.resize(w, h);
  };
  window.addEventListener('resize', resize);
  resize();

  let fps = 0;
  let frames = 0;
  let acc = 0;
  let lastT = performance.now();

  const updateHud = (): void => {
    if (!hud) return;
    const p = renderer.profile;
    const drawCalls = renderer.three.info.render.drawCalls;
    const store = useHudStore.getState();
    const hint =
      harness.label === 'walk'
        ? ` · hp ${store.health} · bat ${store.battery} · ammo ${store.ammoMag}/${store.ammoReserve} · ${store.status ?? 'idle'} · WASD move · click to look · Space jump`
        : '';
    const net = netMode === 'offline' ? '' : ` · net ${netMode}:${netState}/${netPeers}`;
    hud.textContent = `SIGNAL LOST · ${p.backend} · tier ${p.tier} · ${harness.label} · ${fps} fps · ${drawCalls} draws${net}${hint}`;
  };

  const setNetPanelStatus = (message: string): void => {
    const status = document.getElementById('netStatus');
    if (status) status.textContent = message;
    updateHud();
  };

  const startNet = async (mode: 'host' | 'client', code: string): Promise<void> => {
    if (!isWalkScene(harness)) {
      setNetPanelStatus('walk scene required');
      return;
    }
    if (netDriver) netDriver.leave();
    hostInputStats.clear();
    netMode = mode;
    netState = 'signaling';
    netPeers = 0;
    const signalingUrl = envString('VITE_SIGNALING_URL');
    const transportPolicy = iceTransportPolicy();
    const requireTurn = envFlag('VITE_REQUIRE_TURN') || transportPolicy === 'relay';
    const useTurnEndpoint = Boolean(signalingUrl) && (requireTurn || envFlag('VITE_TURN_FROM_SIGNALING'));
    let iceEnv = {
      turnUrls: turnUrls(),
      turnHost: envString('VITE_TURN_HOST'),
      turnUsername: envString('VITE_TURN_USERNAME'),
      turnCredential: envString('VITE_TURN_CREDENTIAL'),
    };
    try {
      if (useTurnEndpoint && signalingUrl) {
        iceEnv = { ...iceEnv, ...(await fetchTurnIceEnv(signalingUrl, code)) };
      }
      const iceServers = buildIceServers(iceEnv, { requireTurn });
      netDriver = createGameplaySession({
        code,
        isHost: mode === 'host',
        iceServers,
        iceTransportPolicy: transportPolicy,
        signalingUrl,
        hostGame: mode === 'host' ? harness.game : undefined,
        localGame: mode === 'client' ? harness.game : undefined,
        onHostInput: (peerId, cmds) => {
          const stats = hostInputStats.get(peerId) ?? { packets: 0, cmds: 0, fwd: 0 };
          stats.packets += 1;
          stats.cmds += cmds.length;
          stats.fwd += cmds.filter((cmd) => (cmd.buttons & Buttons.Fwd) !== 0).length;
          hostInputStats.set(peerId, stats);
        },
        events: {
          onState: (state) => {
            netState = state;
            setNetPanelStatus(`${mode} ${code} · ${state} · peers ${netPeers}`);
          },
          onPeers: (peers) => {
            netPeers = peers.length;
            setNetPanelStatus(`${mode} ${code} · ${netState} · peers ${netPeers}`);
          },
          onHostLost: () => setNetPanelStatus('host lost'),
          onLog: (msg) => console.info(`[net] ${msg}`),
        },
      });
    } catch (err) {
      netMode = 'offline';
      netState = 'failed';
      setNetPanelStatus(`net setup failed: ${err instanceof Error ? err.message : String(err)}`);
      console.error('[net] setup failed', err);
      return;
    }
    harness.setRemoteWorld(mode === 'host' ? harness.game.world : netDriver.clientWorld);
    setNetPanelStatus(`${mode} ${code} · ${netState} · peers ${netPeers}`);
  };

  if (netPanel && isWalkScene(harness)) {
    const paramsCode = params.get('code')?.trim().toUpperCase();
    const initialCode = paramsCode && isValidRoomCode(paramsCode) ? paramsCode : generateRoomCode();
    netPanel.innerHTML = `
      <button id="netHost" type="button">Host</button>
      <input id="netCode" value="${initialCode}" maxlength="6" spellcheck="false" />
      <button id="netJoin" type="button">Join</button>
      <button id="netLeave" type="button">Leave</button>
      <span id="netStatus">offline</span>
    `;
    const codeInput = document.getElementById('netCode') as HTMLInputElement | null;
    document.getElementById('netHost')?.addEventListener('click', () => {
      const code = generateRoomCode();
      if (codeInput) codeInput.value = code;
      void startNet('host', code);
    });
    document.getElementById('netJoin')?.addEventListener('click', () => {
      const code = codeInput?.value.trim().toUpperCase() ?? '';
      if (!isValidRoomCode(code)) {
        setNetPanelStatus('invalid code');
        return;
      }
      void startNet('client', code);
    });
    document.getElementById('netLeave')?.addEventListener('click', () => {
      netDriver?.leave();
      netDriver = undefined;
      netMode = 'offline';
      netState = 'offline';
      netPeers = 0;
      hostInputStats.clear();
      harness.setRemoteWorld(undefined);
      setNetPanelStatus('offline');
    });
    if (params.get('host') === '1') void startNet('host', initialCode);
    else if (params.get('join') === '1' && paramsCode) void startNet('client', initialCode);
  } else if (netPanel) {
    netPanel.style.display = 'none';
  }

  const fixedUpdate = (dt: number): void => {
    if (netDriver && netMode === 'client' && isWalkScene(harness)) {
      const move = harness.controls.moveVector();
      netDriver.sendClientInput({
        buttons: buttonsFromMove(move),
        yaw: harness.controls.yaw,
        pitch: harness.controls.pitch,
        dtMs: Math.round(dt * 1000),
      });
    }
    harness.fixedStep(dt);
    netDriver?.tick();
  };

  const loop = new GameLoop({
    fixedHz: 60,
    fixedUpdate,
    render: () => {
      const now = performance.now();
      const dt = Math.min((now - lastT) / 1000, 0.1);
      if (netDriver && netMode === 'client') netDriver.sampleRemoteEntities(now);
      harness.frameUpdate(dt);
      post.render();
      acc += now - lastT;
      lastT = now;
      frames += 1;
      if (acc >= 500) {
        fps = Math.round((frames * 1000) / acc);
        frames = 0;
        acc = 0;
        updateHud();
      }
    },
  });

  updateHud();
  loop.start();

  // Expose for headless verification.
  (window as unknown as { __sl?: unknown }).__sl = {
    renderer,
    loop,
    harness,
    post,
    backend: renderer.backend,
    profile: renderer.profile,
    hudState: () => useHudStore.getState(),
    netDriver: () => netDriver,
    netInfo: () => ({ mode: netMode, state: netState, peers: netPeers, driverPeers: netDriver?.session.peerIds.length ?? 0 }),
    hostInputStats: () => Object.fromEntries(hostInputStats.entries()),
    localPlayerPosition: () => (isWalkScene(harness) ? harness.playerPosition() : null),
    remotePlayerPositions: () => {
      if (!isWalkScene(harness)) return [];
      return remotePlayerPositions(netMode === 'host' ? harness.game.world : netDriver?.clientWorld);
    },
    stepForSmoke: (move: { x: number; z: number } | undefined, dt = 1 / 60) => {
      if (isWalkScene(harness)) harness.controls.setMoveOverride(move);
      fixedUpdate(dt);
      if (isWalkScene(harness)) harness.controls.setMoveOverride(undefined);
    },
  };
}

main().catch((err: unknown) => {
  console.error('[lookdev] init failed', err);
  if (hud) hud.textContent = `init failed: ${String(err)}`;
});
