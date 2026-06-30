import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import WebSocket, { WebSocketServer } from 'ws';

interface NetInfo {
  readonly mode: 'offline' | 'host' | 'client';
  readonly state: string;
  readonly peers: number;
  readonly driverPeers: number;
}

interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface NetStatsView {
  readonly rttMs: number;
  readonly lossPct: number;
  readonly snapshotBytesAvg: number;
  readonly snapshotHz: number;
  readonly inputHz: number;
  readonly tickDriftMs: number;
  readonly selectedPair: string;
  readonly bufferedSnapshots: number;
}

interface SignalMsg {
  readonly t: string;
  readonly to?: string;
  readonly from?: string;
  readonly self?: string;
  readonly peers?: string[];
  readonly peerId?: string;
  readonly data?: unknown;
}

const LOOKDEV_PORT = Number(process.env.LOOKDEV_SMOKE_PORT ?? 4177);
const ROOM_CODE = process.env.LOOKDEV_SMOKE_CODE ?? 'K7M2QX';
const TIMEOUT_MS = Number(process.env.LOOKDEV_SMOKE_TIMEOUT_MS ?? 75_000);
const CLIENT_COUNT = Math.max(1, Math.min(3, Math.floor(Number(process.env.LOOKDEV_SMOKE_CLIENTS ?? 1))));
const MOVE_MS = Number(process.env.LOOKDEV_SMOKE_MOVE_MS ?? 1500);
const SOAK_MS = Number(process.env.LOOKDEV_SMOKE_SOAK_MS ?? 0);
const DELIVERY_MS = Number(process.env.LOOKDEV_SMOKE_DELIVERY_MS ?? 15);
const MIN_MOVE_METERS = Number(process.env.LOOKDEV_SMOKE_MIN_MOVE_METERS ?? 0.4);
const STABILIZE_MS = Number(process.env.LOOKDEV_SMOKE_STABILIZE_MS ?? (CLIENT_COUNT > 1 ? 2000 : 500));
const EXPECT_TURN = process.env.LOOKDEV_SMOKE_EXPECT_TURN === '1';
const MAX_SNAPSHOT_BYTES = Number(process.env.LOOKDEV_SMOKE_MAX_SNAPSHOT_BYTES ?? 400);
const MAX_LOSS_PCT = Number(process.env.LOOKDEV_SMOKE_MAX_LOSS_PCT ?? 5);
const EXPECTED_ICE_PAIR = process.env.LOOKDEV_SMOKE_EXPECT_ICE_PAIR;
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'accept, content-type',
};

function send(ws: WebSocket, msg: SignalMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

async function startLocalSignaling(): Promise<{
  readonly baseUrl: string;
  readonly turnRequests: () => number;
  readonly close: () => Promise<void>;
}> {
  let turnRequestCount = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    if (url.pathname === '/turn') {
      turnRequestCount++;
      const room = (url.searchParams.get('room') ?? ROOM_CODE).toUpperCase();
      res.writeHead(200, { ...CORS_HEADERS, 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          username: `9999999999:${room}`,
          credential: 'local-smoke-credential',
          urls: ['turn:127.0.0.1:3478?transport=udp', 'turn:127.0.0.1:3478?transport=tcp'],
          expiresAt: 9999999999,
        }),
      );
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('signal-lost local smoke signaling');
  });
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map<string, Map<string, WebSocket>>();
  let nextId = 0;

  const roomFor = (roomId: string): Map<string, WebSocket> => {
    let room = rooms.get(roomId);
    if (!room) {
      room = new Map();
      rooms.set(roomId, room);
    }
    return room;
  };

  const broadcast = (room: Map<string, WebSocket>, exceptId: string, msg: SignalMsg): void => {
    for (const [peerId, ws] of room) {
      if (peerId !== exceptId) send(ws, msg);
    }
  };

  const accept = (roomId: string, ws: WebSocket): void => {
    const room = roomFor(roomId);
    if (room.size >= 4) {
      ws.close(1008, 'room full');
      return;
    }

    const id = `p${++nextId}`;
    const peers = [...room.keys()];
    room.set(id, ws);
    send(ws, { t: 'welcome', self: id, peers });
    broadcast(room, id, { t: 'peer-join', peerId: id });

    ws.on('message', (raw) => {
      let msg: SignalMsg;
      try {
        msg = JSON.parse(raw.toString()) as SignalMsg;
      } catch {
        return;
      }
      if (msg.t !== 'signal' || !msg.to) return;
      const target = room.get(msg.to);
      if (target) send(target, { ...msg, from: id });
    });

    const close = (): void => {
      if (!room.delete(id)) return;
      broadcast(room, id, { t: 'peer-leave', peerId: id });
      if (room.size === 0) rooms.delete(roomId);
    };
    ws.on('close', close);
    ws.on('error', close);
  };

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    const match = url.pathname.match(/^\/room\/([0-9A-Za-z-]+)$/);
    if (!match) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => accept(match[1]!, ws));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to bind local signaling server');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    turnRequests: () => turnRequestCount,
    close: async () => {
      for (const room of rooms.values()) for (const ws of room.values()) ws.close();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) => {
        (server as Server).close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Vite is still booting.
    }
    await delay(250);
  }
  throw new Error(`timed out waiting for ${url}`);
}

function startLookdev(signalingUrl: string): ChildProcessWithoutNullStreams {
  const child = spawn(
    'pnpm',
    ['-F', '@sl/lookdev', 'exec', 'vite', '--host', '127.0.0.1', '--port', String(LOOKDEV_PORT), '--strictPort'],
    {
      cwd: process.cwd(),
      detached: true,
      env: { ...process.env, VITE_SIGNALING_URL: signalingUrl, VITE_SMOKE_NO_WATCH: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.on('data', (chunk) => process.stdout.write(`[lookdev] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[lookdev] ${chunk}`));
  return child;
}

function stopLookdev(child: ChildProcessWithoutNullStreams | undefined): void {
  if (!child || child.killed) return;
  if (child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
      return;
    } catch {
      // Fall back to the direct child if process-group termination is unavailable.
    }
  }
  child.kill('SIGTERM');
}

async function waitForNet(page: Page, mode: 'host' | 'client', expectedPeers: number, label: string): Promise<NetInfo> {
  await page.waitForFunction(() => Boolean((window as any).__sl?.netInfo), null, { timeout: TIMEOUT_MS });
  try {
    await page.waitForFunction(
      ({ expectedMode, expectedPeerCount }) => {
        const info = (window as any).__sl.netInfo() as NetInfo;
        return (
          info.mode === expectedMode &&
          info.state === 'connected' &&
          info.peers >= expectedPeerCount &&
          info.driverPeers >= expectedPeerCount
        );
      },
      { expectedMode: mode, expectedPeerCount: expectedPeers },
      { timeout: TIMEOUT_MS },
    );
  } catch (err) {
    const context = await page.evaluate(() => ({
      net: (window as any).__sl?.netInfo?.() ?? null,
      hud: document.getElementById('hud')?.textContent ?? null,
      status: document.getElementById('netStatus')?.textContent ?? null,
    }));
    throw new Error(`timed out waiting for ${label} ${mode} net connection: ${JSON.stringify(context)}\n${String(err)}`);
  }
  return page.evaluate(() => (window as any).__sl.netInfo() as NetInfo);
}

async function waitForNetMode(page: Page, mode: 'host' | 'client', label: string): Promise<NetInfo> {
  await page.waitForFunction(() => Boolean((window as any).__sl?.netInfo), null, { timeout: TIMEOUT_MS });
  try {
    await page.waitForFunction(
      (expectedMode) => {
        const info = (window as any).__sl.netInfo() as NetInfo;
        return info.mode === expectedMode && info.state !== 'offline' && info.state !== 'failed';
      },
      mode,
      { timeout: TIMEOUT_MS },
    );
  } catch (err) {
    const context = await page.evaluate(() => ({
      net: (window as any).__sl?.netInfo?.() ?? null,
      hud: document.getElementById('hud')?.textContent ?? null,
      status: document.getElementById('netStatus')?.textContent ?? null,
    }));
    throw new Error(`timed out waiting for ${label} ${mode} net session startup: ${JSON.stringify(context)}\n${String(err)}`);
  }
  return page.evaluate(() => (window as any).__sl.netInfo() as NetInfo);
}

async function remotePositions(page: Page): Promise<Vec3[]> {
  return page.evaluate(() => (window as any).__sl.remotePlayerPositions() as Vec3[]);
}

async function netStats(page: Page): Promise<NetStatsView | null> {
  return page.evaluate(() => (window as any).__sl.netStats?.() ?? null);
}

async function waitForNetStats(page: Page, label: string): Promise<NetStatsView> {
  try {
    await page.waitForFunction(() => Boolean((window as any).__sl?.netStats?.()), null, { timeout: TIMEOUT_MS });
  } catch (err) {
    const context = await page.evaluate(() => ({
      net: (window as any).__sl?.netInfo?.() ?? null,
      stats: (window as any).__sl?.netStats?.() ?? null,
      hud: document.getElementById('hud')?.textContent ?? null,
    }));
    throw new Error(`timed out waiting for ${label} net stats: ${JSON.stringify(context)}\n${String(err)}`);
  }
  return (await netStats(page))!;
}

function assertNetStatsBudget(label: string, stats: NetStatsView): void {
  if (stats.snapshotBytesAvg > MAX_SNAPSHOT_BYTES) {
    throw new Error(`${label} snapshot bytes ${stats.snapshotBytesAvg}B exceeds ${MAX_SNAPSHOT_BYTES}B`);
  }
  if (stats.lossPct > MAX_LOSS_PCT) {
    throw new Error(`${label} loss ${stats.lossPct}% exceeds ${MAX_LOSS_PCT}%`);
  }
  if (EXPECTED_ICE_PAIR && stats.selectedPair !== EXPECTED_ICE_PAIR) {
    throw new Error(`${label} ICE pair ${stats.selectedPair} did not match expected ${EXPECTED_ICE_PAIR}`);
  }
}

function sortPositions(positions: readonly Vec3[]): Vec3[] {
  return [...positions].sort((a, b) => a.x - b.x || a.z - b.z);
}

async function waitForRemoteCount(page: Page, count: number, label: string): Promise<Vec3[]> {
  try {
    await page.waitForFunction(
      (expectedCount) => ((window as any).__sl?.remotePlayerPositions?.() as Vec3[] | undefined)?.length >= expectedCount,
      count,
      { timeout: TIMEOUT_MS },
    );
  } catch (err) {
    const context = await page.evaluate(() => ({
      net: (window as any).__sl?.netInfo?.() ?? null,
      remotePositions: (window as any).__sl?.remotePlayerPositions?.() ?? null,
      hud: document.getElementById('hud')?.textContent ?? null,
      status: document.getElementById('netStatus')?.textContent ?? null,
    }));
    throw new Error(`timed out waiting for ${label} to see ${count} remote players: ${JSON.stringify(context)}\n${String(err)}`);
  }
  return sortPositions(await remotePositions(page));
}

async function setForward(page: Page, enabled: boolean): Promise<void> {
  const state = await page.evaluate((isEnabled) => {
    const controls = (window as any).__sl?.harness?.controls;
    controls?.setMoveOverride?.(isEnabled ? { x: 0, z: 1 } : undefined);
    window.dispatchEvent(
      new KeyboardEvent(isEnabled ? 'keydown' : 'keyup', { code: 'KeyW', key: 'w', bubbles: true }),
    );
    return { hasHook: typeof controls?.setMoveOverride === 'function', move: controls?.moveVector?.() ?? null };
  }, enabled);
  if (!state.hasHook || (enabled && (!state.move || state.move.z <= 0))) {
    throw new Error(`failed to ${enabled ? 'enable' : 'disable'} scripted forward movement: ${JSON.stringify(state)}`);
  }
}

async function stopLoop(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__sl.loop.stop();
  });
}

async function smokeStep(page: Page, move: { x: number; z: number } | undefined, frameDt = 1 / 60): Promise<void> {
  await page.evaluate(
    ({ inputMove, dt }) => {
      (window as any).__sl.stepForSmoke(inputMove, dt);
    },
    { inputMove: move, dt: frameDt },
  );
}

async function waitInPage(page: Page, ms: number): Promise<void> {
  await page.evaluate((delayMs) => new Promise<void>((resolve) => window.setTimeout(resolve, delayMs)), ms);
}

async function assertManualMovementWorks(page: Page, label: string): Promise<void> {
  const probe = await page.evaluate(() => {
    const sl = (window as any).__sl;
    const before = sl.localPlayerPosition() as Vec3;
    const move = { x: 0, z: 1 };
    const tick0 = sl.loop.currentTick as number;
    sl.stepForSmoke(move, 1 / 60);
    const after = sl.localPlayerPosition() as Vec3;
    return { before, after, move, tick0, tick1: sl.loop.currentTick as number };
  });
  if (probe.after.z >= probe.before.z - 0.01) {
    throw new Error(`${label} manual movement probe failed: ${JSON.stringify(probe)}`);
  }
}

async function driveClientsForward(host: Page, clients: readonly Page[], ms: number): Promise<void> {
  const frames = Math.max(1, Math.ceil((ms / 1000) * 60));
  for (const activeClient of clients) {
    await setForward(activeClient, true);
    try {
      for (let frame = 0; frame < frames; frame++) {
        await Promise.all(clients.map((client) => smokeStep(client, client === activeClient ? { x: 0, z: 1 } : undefined)));
        await waitInPage(host, DELIVERY_MS);
        await smokeStep(host, undefined);
        await Promise.all(clients.map((client) => waitInPage(client, DELIVERY_MS)));
      }
    } finally {
      await setForward(activeClient, false);
    }
  }
}

function assertNoPageErrors(pageErrors: readonly string[]): void {
  if (pageErrors.length > 0) {
    throw new Error(`browser page errors:\n${pageErrors.join('\n')}`);
  }
}

async function assertConnectedDuringSoak(
  pages: readonly Array<{ readonly label: string; readonly page: Page; readonly mode: 'host' | 'client' }>,
  expectedPeers: number,
  pageErrors: readonly string[],
): Promise<void> {
  assertNoPageErrors(pageErrors);
  const infos = await Promise.all(
    pages.map(async ({ label, mode, page }) => ({
      label,
      mode,
      info: await page.evaluate(() => (window as any).__sl.netInfo() as NetInfo),
      stats: await netStats(page),
    })),
  );
  for (const { label, mode, info, stats } of infos) {
    if (info.mode !== mode || info.state !== 'connected' || info.peers < expectedPeers || info.driverPeers < expectedPeers) {
      throw new Error(`${label} lost net connection during soak: ${JSON.stringify(info)}`);
    }
    if (stats) assertNetStatsBudget(label, stats);
  }
}

async function soakRoom(
  pages: readonly Array<{ readonly label: string; readonly page: Page; readonly mode: 'host' | 'client' }>,
  expectedPeers: number,
  ms: number,
  pageErrors: readonly string[],
): Promise<void> {
  if (ms <= 0) return;
  const frames = Math.max(1, Math.ceil((ms / 1000) * 60));
  for (let frame = 0; frame < frames; frame++) {
    await Promise.all(pages.map(({ page }) => smokeStep(page, undefined)));
    if (frame % 30 === 0) await assertConnectedDuringSoak(pages, expectedPeers, pageErrors);
    await Promise.all(pages.map(({ page }) => waitInPage(page, DELIVERY_MS)));
  }
  await assertConnectedDuringSoak(pages, expectedPeers, pageErrors);
}

async function main(): Promise<void> {
  let vite: ChildProcessWithoutNullStreams | undefined;
  let browser: Browser | undefined;
  const signaling = await startLocalSignaling();
  try {
    vite = startLookdev(signaling.baseUrl);
    const baseUrl = `http://127.0.0.1:${LOOKDEV_PORT}`;
    await waitForHttp(baseUrl, TIMEOUT_MS);

    browser = await chromium.launch({
      headless: true,
      args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
    });
    const pageErrors: string[] = [];
    const host = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const clients = await Promise.all(
      Array.from({ length: CLIENT_COUNT }, () => browser!.newPage({ viewport: { width: 960, height: 600 } })),
    );
    const pages = [
      { label: 'host', page: host, mode: 'host' as const },
      ...clients.map((page, index) => ({ label: `client-${index + 1}`, page, mode: 'client' as const })),
    ];
    for (const { label, page } of pages) {
      page.on('pageerror', (err) => {
        pageErrors.push(`${label}: ${err.message}`);
      });
      page.on('console', (msg) => {
        if (['error', 'warning', 'info'].includes(msg.type())) {
          process.stderr.write(`[browser:${label}:${msg.type()}] ${msg.text()}\n`);
        }
      });
    }

    await host.goto(`${baseUrl}/?host=1&code=${ROOM_CODE}&gl=2`, { waitUntil: 'domcontentloaded' });
    await waitForNetMode(host, 'host', 'host');
    await Promise.all(
      clients.map((client) => client.goto(`${baseUrl}/?join=1&code=${ROOM_CODE}&gl=2`, { waitUntil: 'domcontentloaded' })),
    );
    const [hostInfo, ...clientInfos] = await Promise.all([
      waitForNet(host, 'host', CLIENT_COUNT, 'host'),
      ...clients.map((client, index) => waitForNet(client, 'client', CLIENT_COUNT, `client-${index + 1}`)),
    ]);
    assertNoPageErrors(pageErrors);
    if (EXPECT_TURN && signaling.turnRequests() < pages.length) {
      throw new Error(`expected at least ${pages.length} TURN credential requests, saw ${signaling.turnRequests()}`);
    }
    if (STABILIZE_MS > 0) await delay(STABILIZE_MS);

    const startRemote = await waitForRemoteCount(host, CLIENT_COUNT, 'host');
    await Promise.all(clients.map((client) => waitForRemoteCount(client, CLIENT_COUNT, 'client')));
    await Promise.all(pages.map(({ page }) => stopLoop(page)));
    await Promise.all(clients.map((client, index) => assertManualMovementWorks(client, `client-${index + 1}`)));
    await driveClientsForward(host, clients, MOVE_MS);
    const movedRemote = await waitForRemoteCount(host, CLIENT_COUNT, 'host');
    const hostRemoteMoved = startRemote.map((start, index) => Number((start.z - movedRemote[index]!.z).toFixed(3)));
    if (hostRemoteMoved.some((move) => move < MIN_MOVE_METERS)) {
      const context = {
        startRemote,
        hostRemote: movedRemote,
        hostRemoteMoved,
        hostInfo: await host.evaluate(() => (window as any).__sl.netInfo() as NetInfo),
        hostInputStats: await host.evaluate(() => (window as any).__sl.hostInputStats?.() ?? null),
        clientInfos: await Promise.all(clients.map((client) => client.evaluate(() => (window as any).__sl.netInfo() as NetInfo))),
        clientLocals: await Promise.all(clients.map((client) => client.evaluate(() => (window as any).__sl.localPlayerPosition() as Vec3))),
      };
      throw new Error(`host did not observe enough client movement: ${JSON.stringify(context)}`);
    }
    const clientLocals = await Promise.all(clients.map((client) => client.evaluate(() => (window as any).__sl.localPlayerPosition() as Vec3)));

    await soakRoom(pages, CLIENT_COUNT, SOAK_MS, pageErrors);
    assertNoPageErrors(pageErrors);
    const hostNetStats = await waitForNetStats(host, 'host');
    const clientNetStats = await Promise.all(clients.map((client, index) => waitForNetStats(client, `client-${index + 1}`)));
    assertNetStatsBudget('host', hostNetStats);
    clientNetStats.forEach((stats, index) => assertNetStatsBudget(`client-${index + 1}`, stats));

    console.log(
      JSON.stringify(
        {
          ok: true,
          clients: CLIENT_COUNT,
          soakMs: SOAK_MS,
          hostInfo,
          clientInfos,
          hostNetStats,
          clientNetStats,
          hostInputStats: await host.evaluate(() => (window as any).__sl.hostInputStats?.() ?? null),
          turnRequests: signaling.turnRequests(),
          hostRemoteMoved,
          clientLocalZ: clientLocals.map((pos) => Number(pos.z.toFixed(3))),
          remoteCounts: {
            host: movedRemote.length,
            clients: await Promise.all(clients.map((client) => remotePositions(client).then((positions) => positions.length))),
          },
          signalingUrl: signaling.baseUrl,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser?.close();
    stopLookdev(vite);
    await signaling.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
