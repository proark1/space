import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import WebSocket, { WebSocketServer } from 'ws';

const LOOKDEV_PORT = Number(process.env.LOOKDEV_FLOW_SMOKE_PORT ?? 4181);
const TIMEOUT_MS = Number(process.env.LOOKDEV_FLOW_SMOKE_TIMEOUT_MS ?? 75_000);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

function sendSignal(ws: WebSocket, msg: SignalMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

async function startLocalSignaling(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
    res.end('signal-lost local flow signaling');
  });
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map<string, Map<string, WebSocket>>();
  let nextId = 0;
  const roomFor = (id: string): Map<string, WebSocket> => {
    let room = rooms.get(id);
    if (!room) { room = new Map(); rooms.set(id, room); }
    return room;
  };
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    const match = url.pathname.match(/^\/room\/([0-9A-Za-z-]+)$/);
    if (!match) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => {
      const room = roomFor(match[1]!);
      const id = `p${++nextId}`;
      const peers = [...room.keys()];
      room.set(id, ws);
      sendSignal(ws, { t: 'welcome', self: id, peers });
      for (const [peerId, peer] of room) if (peerId !== id) sendSignal(peer, { t: 'peer-join', peerId: id });
      ws.on('message', raw => {
        let msg: SignalMsg;
        try { msg = JSON.parse(raw.toString()) as SignalMsg; } catch { return; }
        if (msg.t !== 'signal' || !msg.to) return;
        const target = room.get(msg.to);
        if (target) sendSignal(target, { ...msg, from: id });
      });
      const close = (): void => {
        if (!room.delete(id)) return;
        for (const peer of room.values()) sendSignal(peer, { t: 'peer-leave', peerId: id });
        if (room.size === 0) rooms.delete(match[1]!);
      };
      ws.on('close', close);
      ws.on('error', close);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to bind local signaling');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      for (const room of rooms.values()) for (const ws of room.values()) ws.close();
      await new Promise<void>(resolve => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) => (server as Server).close(err => (err ? reject(err) : resolve())));
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
      // Static lookdev server is still booting.
    }
    await delay(250);
  }
  throw new Error(`timed out waiting for ${url}`);
}

function startLookdev(): ChildProcessWithoutNullStreams {
  const child = spawn('python3', ['lookdev/serve.py'], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(LOOKDEV_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[lookdev] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[lookdev] ${chunk}`));
  return child;
}

function stopLookdev(child: ChildProcessWithoutNullStreams | undefined): void {
  if (!child || child.killed) return;
  if (child.pid && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGTERM');
      return;
    } catch {
      // Fall back to direct child kill if process-group termination is unavailable.
    }
  }
  child.kill('SIGTERM');
}

async function launchBrowser(): Promise<Browser> {
  const options = {
    headless: true,
    args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  };
  try {
    return await chromium.launch({ ...options, channel: 'chrome' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('Executable doesn')) throw err;
    return chromium.launch(options);
  }
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) errors.push(msg.text());
  });
  return errors;
}

async function assertNoPageErrors(errors: readonly string[], label: string): Promise<void> {
  assert(errors.length === 0, `${label} page errors:\n${errors.join('\n')}`);
}

async function assertCanvasNonBlank(page: Page, label: string): Promise<void> {
  await page.waitForSelector('canvas', { state: 'attached', timeout: TIMEOUT_MS });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return Boolean(canvas && canvas.width > 100 && canvas.height > 100);
  }, null, { timeout: TIMEOUT_MS });
  await page.waitForTimeout(2_000);

  const image = await page.locator('canvas').screenshot({ timeout: TIMEOUT_MS });
  const sample = await page.evaluate(async (dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = img.naturalWidth;
    sampleCanvas.height = img.naturalHeight;
    const ctx = sampleCanvas.getContext('2d');
    if (!ctx) return { lit: 0, total: 0, max: 0, range: 0, width: img.naturalWidth, height: img.naturalHeight };
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
    const stride = Math.max(1, Math.floor((sampleCanvas.width * sampleCanvas.height) / 6000));
    let lit = 0;
    let total = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (let i = 0; i < data.length; i += 4 * stride) {
      const value = data[i] + data[i + 1] + data[i + 2];
      if (value > 36) lit++;
      min = Math.min(min, value);
      max = Math.max(max, value);
      total++;
    }
    return { lit, total, max, range: max - min, width: sampleCanvas.width, height: sampleCanvas.height };
  }, `data:image/png;base64,${image.toString('base64')}`);

  assert(
    sample.max > 36 && sample.range > 12 && sample.lit > 5,
    `${label} canvas appears blank (${sample.width}x${sample.height}, lit ${sample.lit}/${sample.total}, max ${sample.max}, range ${sample.range})`,
  );
}

async function checkRenderablePage(page: Page, baseUrl: string, path: string, label: string): Promise<void> {
  const errors = collectPageErrors(page);
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'commit', timeout: TIMEOUT_MS });
  await assertCanvasNonBlank(page, label);
  await assertNoPageErrors(errors, label);
}

async function checkLobbyAutoBoards(page: Page, baseUrl: string): Promise<void> {
  const errors = collectPageErrors(page);
  await page.goto(`${baseUrl}/lobby?flow=1`, { waitUntil: 'commit', timeout: TIMEOUT_MS });
  await page.waitForSelector('#status', { state: 'attached', timeout: TIMEOUT_MS });
  await page.waitForFunction(() => (window as any).__lobby?.state?.crewCount === 3, null, { timeout: TIMEOUT_MS });
  const lobbyCrew = await page.evaluate(() => (window as any).__lobby.state);
  assert(lobbyCrew.player && lobbyCrew.crewCount === 3, `expected lobby player plus 3 NPC crew, got ${JSON.stringify(lobbyCrew)}`);
  await page.goto(`${baseUrl}/lobby?flow=1&auto=1`, { waitUntil: 'commit', timeout: TIMEOUT_MS });
  await page.waitForSelector('#status', { state: 'attached', timeout: TIMEOUT_MS });
  await page.waitForTimeout(12_000);
  assert(page.url().includes('/pad?flow=1'), `expected lobby flow to reach /pad?flow=1, got ${page.url()}`);
  await assertNoPageErrors(errors, 'lobby flow');
}

async function checkPadAscentHandoff(page: Page, baseUrl: string): Promise<void> {
  const errors = collectPageErrors(page);
  await page.goto(`${baseUrl}/pad?flow=1&fast=1`, { waitUntil: 'commit', timeout: TIMEOUT_MS });
  await assertCanvasNonBlank(page, 'launch pad');
  await page.waitForFunction(() => Boolean((window as any).__pad?.state?.flowFast), null, { timeout: TIMEOUT_MS });
  const start = await page.evaluate(() => (window as any).__pad.state);
  await page.waitForFunction((baseline) => {
    const state = (window as any).__pad?.state;
    return Boolean(
      state &&
      state.rocketY > baseline.rocketY + 18 &&
      state.cameraY > baseline.cameraY + 3 &&
      state.targetY > baseline.targetY + 3,
    );
  }, start, { timeout: TIMEOUT_MS });
  const ascent = await page.evaluate(() => (window as any).__pad.state);
  assert(ascent.rocketY > start.rocketY + 18, `expected rocket ascent, y ${start.rocketY} -> ${ascent.rocketY}`);
  assert(ascent.cameraY > start.cameraY + 3, `expected camera to follow ascent, y ${start.cameraY} -> ${ascent.cameraY}`);
  assert(ascent.targetY > start.targetY + 3, `expected camera target to follow rocket, y ${start.targetY} -> ${ascent.targetY}`);
  await page.waitForFunction(() => location.pathname === '/launch' && new URLSearchParams(location.search).has('flow'), null, { timeout: TIMEOUT_MS });
  await assertNoPageErrors(errors, 'launch pad flow');
}

async function checkCapsuleTransitHandoff(page: Page, baseUrl: string): Promise<void> {
  const errors = collectPageErrors(page);
  await page.goto(`${baseUrl}/launch?flow=1&fast=1`, { waitUntil: 'commit', timeout: TIMEOUT_MS });
  await assertCanvasNonBlank(page, 'capsule approach');
  await page.waitForFunction(() => Boolean((window as any).__launch?.state?.flowFast), null, { timeout: TIMEOUT_MS });
  const start = await page.evaluate(() => (window as any).__launch.state);
  assert(start.crewCount === 3, `expected capsule transit to seat 3 NPC crew, got ${start.crewCount}`);
  await page.waitForTimeout(7_000);
  const transit = await page.evaluate(() => (window as any).__launch.state);
  assert(transit.earthZ < start.earthZ - 40, `expected Earth to recede, z ${start.earthZ} -> ${transit.earthZ}`);
  assert(transit.earthScale < start.earthScale - 0.08, `expected Earth to shrink, scale ${start.earthScale} -> ${transit.earthScale}`);
  assert(transit.shipZ > start.shipZ + 60, `expected station to approach, z ${start.shipZ} -> ${transit.shipZ}`);
  assert(transit.shipScale > start.shipScale + 0.4, `expected station to grow, scale ${start.shipScale} -> ${transit.shipScale}`);
  await page.waitForFunction(() => location.pathname === '/dock' && new URLSearchParams(location.search).has('flow') && new URLSearchParams(location.search).get('auto') === '1', null, { timeout: TIMEOUT_MS });
  await assertNoPageErrors(errors, 'capsule transit flow');
}

async function checkDockingHandoff(page: Page, baseUrl: string): Promise<void> {
  const errors = collectPageErrors(page);
  await page.goto(`${baseUrl}/dock?flow=1&auto=1`, { waitUntil: 'commit', timeout: TIMEOUT_MS });
  await assertCanvasNonBlank(page, 'manual docking');
  await page.waitForFunction(() => Boolean((window as any).__dock?.state?.auto), null, { timeout: TIMEOUT_MS });
  const dockStart = await page.evaluate(() => (window as any).__dock.state);
  assert(dockStart.crewCount === 3, `expected docking transfer to keep 3 NPC crew, got ${dockStart.crewCount}`);
  await page.waitForFunction(() => {
    const state = (window as any).__dock?.state?.state;
    return state === 'soft' || state === 'docked' || state === 'board' || state === 'inside';
  }, null, { timeout: TIMEOUT_MS });
  const capture = await page.evaluate(() => (window as any).__dock.state);
  assert(capture.off < 0.7, `expected auto-dock to align before capture, got offset ${capture.off}`);
  assert(capture.speed < 1.8, `expected auto-dock speed to be safe, got ${capture.speed}`);
  await page.waitForURL('**/game?flow=1', { timeout: TIMEOUT_MS });
  await assertNoPageErrors(errors, 'manual docking flow');
}

async function checkStationFlowEntry(page: Page, baseUrl: string): Promise<void> {
  const errors = collectPageErrors(page);
  await page.goto(`${baseUrl}/game?flow=1`, { waitUntil: 'commit', timeout: TIMEOUT_MS });
  await page.waitForSelector('#go', { state: 'attached', timeout: TIMEOUT_MS });
  await page.waitForFunction(() => (window as any).__chorus?.crewCount === 3, null, { timeout: TIMEOUT_MS });
  await page.waitForFunction(() => document.querySelector('#panel h1')?.textContent === 'AIRLOCK OPEN', null, { timeout: TIMEOUT_MS });
  const title = await page.locator('#panel h1').textContent();
  const button = await page.locator('#go').textContent();
  assert(title === 'AIRLOCK OPEN', `expected AIRLOCK OPEN flow entry title, got ${title}`);
  assert(button === 'ENTER STATION', `expected ENTER STATION flow entry button, got ${button}`);
  await page.goto(`${baseUrl}/game?flow=1&players=ana,bob`, { waitUntil: 'commit', timeout: TIMEOUT_MS });
  await page.waitForFunction(() => (window as any).__chorus?.state?.crewSummary?.remote === 2, null, { timeout: TIMEOUT_MS });
  const remoteCrew = await page.evaluate(() => (window as any).__chorus.state.crewSummary);
  assert(remoteCrew.remote === 2 && remoteCrew.npc === 1 && remoteCrew.total === 4, `expected 2 remote players plus 1 NPC fallback, got ${JSON.stringify(remoteCrew)}`);
  await assertNoPageErrors(errors, 'station flow entry');
}

async function checkStationHideMechanic(page: Page, baseUrl: string): Promise<void> {
  const errors = collectPageErrors(page);
  await page.goto(`${baseUrl}/game?smoke=1`, { waitUntil: 'commit', timeout: TIMEOUT_MS });
  await page.waitForFunction(() => Boolean((window as any).__chorus?.smoke), null, { timeout: TIMEOUT_MS });
  await page.evaluate(() => {
    (window as any).__chorus.smoke.moveTo(0.75, -12.05);
    (window as any).__chorus.smoke.forceThreat();
  });
  await page.waitForFunction(() => (window as any).__chorus.state.prompt === '[E] HIDE', null, { timeout: TIMEOUT_MS });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => {
    const state = (window as any).__chorus.state;
    return state.hidden === true && state.prompt === '[E] LEAVE LOCKER';
  }, null, { timeout: TIMEOUT_MS });
  const hidden = await page.evaluate(() => (window as any).__chorus.state);
  assert(hidden.prompt === '[E] LEAVE LOCKER', `expected leave-locker prompt while hidden, got ${hidden.prompt}`);
  await page.evaluate(() => (window as any).__chorus.smoke.makeNoise(0.75, -12.05, 85));
  await page.waitForFunction(() => {
    const mode = (window as any).__chorus.state.director.mode;
    return mode === 'investigate' || mode === 'search' || mode === 'chase';
  }, null, { timeout: TIMEOUT_MS });
  await page.evaluate(() => (window as any).__chorus.smoke.forceSearchLocker());
  await page.waitForFunction(() => (window as any).__chorus.state.director.mode === 'search', null, { timeout: TIMEOUT_MS });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window as any).__chorus.state.hidden === false, null, { timeout: TIMEOUT_MS });
  await assertNoPageErrors(errors, 'station hide');
}

async function checkStationMultiplayer(browser: Browser, baseUrl: string, signalUrl: string): Promise<void> {
  const room = 'FLOWMP';
  const host = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const client = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const hostErrors = collectPageErrors(host);
  const clientErrors = collectPageErrors(client);
  const qs = `smoke=1&room=${room}&signal=${encodeURIComponent(signalUrl)}`;
  await host.goto(`${baseUrl}/game?${qs}&name=host`, { waitUntil: 'commit', timeout: TIMEOUT_MS });
  await client.goto(`${baseUrl}/game?${qs}&name=client`, { waitUntil: 'commit', timeout: TIMEOUT_MS });
  await host.waitForFunction(() => (window as any).__chorus?.state?.multiplayer?.peers === 1, null, { timeout: TIMEOUT_MS });
  await client.waitForFunction(() => (window as any).__chorus?.state?.multiplayer?.peers === 1, null, { timeout: TIMEOUT_MS });
  const hostIsHost = await host.evaluate(() => Boolean((window as any).__chorus.state.multiplayer.isHost));
  const hostPage = hostIsHost ? host : client;
  const clientPage = hostIsHost ? client : host;
  const hostPageErrors = hostIsHost ? hostErrors : clientErrors;
  const clientPageErrors = hostIsHost ? clientErrors : hostErrors;

  await hostPage.evaluate(() => (window as any).__chorus.camera.position.set(1.1, 1.6, -18.25));
  await clientPage.waitForFunction(() => {
    const poses = Object.values((window as any).__chorus.state.remotePoses || {}) as Array<{ x: number; z: number }>;
    return poses.some(pose => Math.abs(pose.x - 1.1) < 0.35 && Math.abs(pose.z + 18.25) < 0.35);
  }, null, { timeout: TIMEOUT_MS });
  const liveCrew = await clientPage.evaluate(() => (window as any).__chorus.state.liveCrew);
  assert(liveCrew.some((member: { remote: boolean; name: string }) => member.remote), `expected remote player to replace an NPC slot, got ${JSON.stringify(liveCrew)}`);
  await hostPage.evaluate(() => {
    const api = (window as any).__chorus;
    api.camera.position.set(-1.35, 1.6, -16);
    api.smoke.interact();
    api.camera.position.set(-1.25, 1.6, -33);
    api.smoke.interact();
    api.camera.position.set(6.22, 1.6, -61.1);
    api.smoke.interact();
    api.camera.position.set(0, 1.6, -76.7);
    api.smoke.interact();
  });
  try {
    await clientPage.waitForFunction(() => (window as any).__chorus.state.restored === true, null, { timeout: TIMEOUT_MS });
  } catch (err) {
    const context = {
      host: await hostPage.evaluate(() => (window as any).__chorus.state),
      client: await clientPage.evaluate(() => (window as any).__chorus.state),
    };
    throw new Error(`timed out waiting for restored sync: ${JSON.stringify(context)}\n${String(err)}`);
  }
  await clientPage.waitForFunction(() => (window as any).__chorus.state.needValve === true, null, { timeout: TIMEOUT_MS });
  await clientPage.evaluate(() => (window as any).__chorus.camera.position.set(5.72, 1.6, -35.9));
  await clientPage.evaluate(() => (window as any).__chorus.smoke.interact());
  await hostPage.waitForFunction(() => (window as any).__chorus.state.valveFixing === true || (window as any).__chorus.state.valveDone === true, null, { timeout: TIMEOUT_MS });
  await clientPage.waitForFunction(() => (window as any).__chorus.state.valveDone === true, null, { timeout: TIMEOUT_MS });
  await hostPage.close();
  await clientPage.waitForFunction(() => (window as any).__chorus.state.multiplayer.isHost === true, null, { timeout: TIMEOUT_MS });
  await assertNoPageErrors(hostPageErrors, 'station multiplayer host');
  await assertNoPageErrors(clientPageErrors, 'station multiplayer client');
  await clientPage.close();
}

async function checkStationObjectivePath(page: Page, baseUrl: string): Promise<void> {
  const errors = collectPageErrors(page);
  await page.goto(`${baseUrl}/game`, { waitUntil: 'commit', timeout: TIMEOUT_MS });
  await page.waitForFunction(() => Boolean((window as any).__chorus?.camera), null, { timeout: TIMEOUT_MS });
  await page.waitForTimeout(1_500);

  await page.evaluate(() => (window as any).__chorus.camera.position.set(-1.35, 1.6, -16));
  await page.keyboard.press('KeyE');
  await page.evaluate(() => (window as any).__chorus.camera.position.set(-1.25, 1.6, -33));
  await page.keyboard.press('KeyE');
  await page.evaluate(() => (window as any).__chorus.camera.position.set(6.22, 1.6, -61.1));
  await page.keyboard.press('KeyE');
  await page.evaluate(() => (window as any).__chorus.camera.position.set(0, 1.6, -76.7));
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(6_800);
  const afterLogs = await page.locator('#obj').textContent();
  assert(afterLogs?.includes('COOLANT'), `expected coolant objective after logs, got ${afterLogs}`);

  await page.evaluate(() => (window as any).__chorus.camera.position.set(5.72, 1.6, -35.9));
  await page.waitForTimeout(200);
  const valvePrompt = await page.locator('#prompt').textContent();
  assert(valvePrompt === '[E] SEAL COOLANT LEAK', `expected coolant prompt, got ${valvePrompt}`);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(3_200);
  const afterValve = await page.locator('#obj').textContent();
  assert(afterValve?.includes('BREAKER'), `expected breaker objective after valve, got ${afterValve}`);

  await page.evaluate(() => (window as any).__chorus.camera.position.set(6.32, 1.6, -12.8));
  await page.waitForTimeout(200);
  const breakerPrompt = await page.locator('#prompt').textContent();
  assert(breakerPrompt === '[E] REROUTE POWER', `expected breaker prompt, got ${breakerPrompt}`);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(3_600);
  const afterBreaker = await page.locator('#obj').textContent();
  assert(afterBreaker?.includes('COMMAND'), `expected command return objective after breaker, got ${afterBreaker}`);

  await page.evaluate(() => (window as any).__chorus.camera.position.set(0, 1.6, -76.7));
  await page.waitForTimeout(400);
  const sendPrompt = await page.locator('#prompt').textContent();
  assert(sendPrompt === '[E] SEND MESSAGE TO EARTH', `expected send prompt, got ${sendPrompt}`);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(5_000);
  const ending = await page.locator('#overTxt').textContent();
  assert(ending === 'MESSAGE SENT', `expected MESSAGE SENT ending, got ${ending}`);
  await assertNoPageErrors(errors, 'station objective');
}

async function main(): Promise<void> {
  let server: ChildProcessWithoutNullStreams | undefined;
  let signaling: Awaited<ReturnType<typeof startLocalSignaling>> | undefined;
  let browser: Browser | undefined;
  try {
    signaling = await startLocalSignaling();
    server = startLookdev();
    const baseUrl = `http://127.0.0.1:${LOOKDEV_PORT}`;
    await waitForHttp(baseUrl, TIMEOUT_MS);

    browser = await launchBrowser();
    const runPageCheck = async (fn: (page: Page) => Promise<void>): Promise<void> => {
      const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await fn(page);
      } finally {
        await page.close().catch(() => undefined);
      }
    };
    await runPageCheck(page => checkLobbyAutoBoards(page, baseUrl));
    await runPageCheck(page => checkPadAscentHandoff(page, baseUrl));
    await runPageCheck(page => checkCapsuleTransitHandoff(page, baseUrl));
    await runPageCheck(page => checkDockingHandoff(page, baseUrl));
    await runPageCheck(page => checkStationFlowEntry(page, baseUrl));
    await runPageCheck(page => checkStationHideMechanic(page, baseUrl));
    await checkStationMultiplayer(browser, baseUrl, signaling.baseUrl);
    await runPageCheck(page => checkStationObjectivePath(page, baseUrl));
    console.log('lookdev full-loop smoke passed');
  } finally {
    await browser?.close().catch(() => undefined);
    await signaling?.close().catch(() => undefined);
    stopLookdev(server);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
