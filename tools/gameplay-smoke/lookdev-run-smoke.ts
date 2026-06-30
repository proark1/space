import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';

interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface DoorView {
  readonly id: string;
  readonly unlock: string;
  readonly unlocked: boolean;
}

interface StationView {
  readonly id: string;
  readonly kind: string;
  readonly pos: Vec3;
}

interface PickupView {
  readonly id: string;
  readonly kind: string;
  readonly active: boolean;
  readonly collected: boolean;
  readonly pos: Vec3;
}

interface RunStateView {
  readonly stage: 'restorePower' | 'findFuse' | 'installFuse' | 'holdout' | 'extract' | 'won' | 'dead';
  readonly health: number;
  readonly battery: number;
  readonly resolve: number;
  readonly ammoMag: number;
  readonly ammoReserve: number;
  readonly hasFuse: boolean;
  readonly powered: boolean;
  readonly flashlightOn: boolean;
  readonly holdoutSeconds: number;
  readonly simTime: number;
  readonly status: string;
  readonly inSafeRoom: boolean;
  readonly activeFuse: { readonly id: string; readonly pos: Vec3 };
  readonly collectedPickupIds: readonly string[];
  readonly doors: readonly DoorView[];
  readonly stations: readonly StationView[];
  readonly pickups: readonly PickupView[];
}

interface MonsterStateView {
  readonly mode: 'patrol' | 'investigate' | 'chase' | 'attack' | 'stunned';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly attackCooldown: number;
  readonly attackWindup: number;
  readonly stunTimer: number;
}

interface UiFeedbackView {
  readonly promptText: string;
  readonly promptVisible: boolean;
  readonly damageFlash: number;
  readonly damageFlashOpacity: number;
  readonly endVisible: boolean;
  readonly endTitle: string;
  readonly endDetail: string;
  readonly stunBeamVisible: boolean;
  readonly monsterHitFlash: number;
}

const LOOKDEV_PORT = Number(process.env.LOOKDEV_RUN_SMOKE_PORT ?? 4179);
const TIMEOUT_MS = Number(process.env.LOOKDEV_RUN_SMOKE_TIMEOUT_MS ?? 90_000);
const SEED = Number(process.env.LOOKDEV_RUN_SMOKE_SEED ?? 1);
const TIER = process.env.LOOKDEV_RUN_SMOKE_TIER ?? 'high';
const HOLDOUT_CHUNK_SECONDS = Number(process.env.LOOKDEV_RUN_SMOKE_HOLDOUT_CHUNK_SECONDS ?? 5);

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

function startLookdev(): ChildProcessWithoutNullStreams {
  const child = spawn(
    'pnpm',
    ['-F', '@sl/lookdev', 'exec', 'vite', '--host', '127.0.0.1', '--port', String(LOOKDEV_PORT), '--strictPort'],
    {
      cwd: process.cwd(),
      detached: true,
      env: { ...process.env, VITE_SMOKE_NO_WATCH: '1' },
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runState(page: Page): Promise<RunStateView> {
  return page.evaluate(() => (window as any).__sl.runState() as RunStateView);
}

async function monsterState(page: Page): Promise<MonsterStateView> {
  return page.evaluate(() => (window as any).__sl.monsterState() as MonsterStateView);
}

async function uiFeedback(page: Page): Promise<UiFeedbackView> {
  return page.evaluate(() => (window as any).__sl.uiFeedback() as UiFeedbackView);
}

function station(state: RunStateView, kind: string): StationView {
  const found = state.stations.find((candidate) => candidate.kind === kind);
  if (!found) throw new Error(`missing ${kind} station`);
  return found;
}

function door(state: RunStateView, id: string): DoorView {
  const found = state.doors.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing ${id} door`);
  return found;
}

async function setPlayer(page: Page, pos: Vec3, yaw = 0): Promise<void> {
  await page.evaluate(
    ({ x, y, z, lookYaw }) => (window as any).__sl.setPlayerPoseForSmoke({ x, y, z, yaw: lookYaw }),
    { x: pos.x, y: pos.y, z: pos.z, lookYaw: yaw },
  );
}

async function setMonster(page: Page, pos: Vec3, yaw = 0): Promise<void> {
  await page.evaluate(
    ({ x, y, z, lookYaw }) => (window as any).__sl.setMonsterPoseForSmoke({ x, y, z, yaw: lookYaw }),
    { x: pos.x, y: pos.y, z: pos.z, lookYaw: yaw },
  );
}

async function interact(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__sl.interactForSmoke());
}

async function fire(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__sl.fireForSmoke());
}

function assertPrompt(ui: UiFeedbackView, expected: string): void {
  assert(ui.promptVisible, `expected visible prompt containing "${expected}"`);
  assert(ui.promptText.toLowerCase().includes(expected.toLowerCase()), `expected prompt containing "${expected}", got "${ui.promptText}"`);
}

async function stepFrames(page: Page, frames: number, dt = 1 / 60): Promise<void> {
  await page.evaluate(
    ({ count, frameDt }) => {
      for (let i = 0; i < count; i++) (window as any).__sl.stepForSmoke(undefined, frameDt);
    },
    { count: frames, frameDt: dt },
  );
}

async function advanceHoldoutChunk(page: Page, seconds: number): Promise<void> {
  const monsterParking = { x: 12, y: 1, z: -12 };
  const chunks = Math.max(1, Math.ceil(seconds));
  for (let i = 0; i < chunks; i++) {
    await setMonster(page, monsterParking);
    await stepFrames(page, 60);
  }
}

async function main(): Promise<void> {
  let vite: ChildProcessWithoutNullStreams | undefined;
  let browser: Browser | undefined;
  const pageErrors: string[] = [];
  try {
    vite = startLookdev();
    const baseUrl = `http://127.0.0.1:${LOOKDEV_PORT}`;
    await waitForHttp(baseUrl, TIMEOUT_MS);

    browser = await chromium.launch({
      headless: true,
      args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
    });
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type())) {
        process.stderr.write(`[browser:${msg.type()}] ${msg.text()}\n`);
      }
    });

    const params = new URLSearchParams({ gl: '2', tier: TIER, seed: String(SEED) });
    await page.goto(`${baseUrl}/?${params}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean((window as any).__sl?.runState?.()), null, { timeout: TIMEOUT_MS });
    await page.evaluate(() => (window as any).__sl.loop.stop());
    await stepFrames(page, 2);

    const checkpoints: Array<{ readonly label: string; readonly state: RunStateView }> = [];
    const capture = async (label: string): Promise<RunStateView> => {
      const state = await runState(page);
      checkpoints.push({ label, state });
      return state;
    };

    let state = await capture('initial');
    assert(state.stage === 'restorePower', `expected restorePower, got ${state.stage}`);
    assert(!state.powered && !state.hasFuse, 'initial run should not be powered or have fuse');
    assert(!door(state, 'engineering-door').unlocked, 'engineering door should start locked');
    assert(!door(state, 'comms-door').unlocked, 'comms door should start locked');
    assert(!door(state, 'escape-lock').unlocked, 'escape should start locked');

    const combatStartHealth = state.health;
    await setPlayer(page, { x: 0, y: 1, z: 0 }, 0);
    await setMonster(page, { x: 0, y: 1, z: -0.95 });
    await stepFrames(page, 2);
    let monster = await monsterState(page);
    assert(monster.mode === 'attack', `expected attack windup mode, got ${monster.mode}`);
    assert(monster.attackWindup > 0, 'monster attack should telegraph with windup before damage');
    await stepFrames(page, 35);
    state = await capture('damage-feedback');
    const damageUi = await uiFeedback(page);
    assert(state.health < combatStartHealth, `monster hit should reduce health from ${combatStartHealth}, got ${state.health}`);
    assert(damageUi.damageFlash > 0, 'monster hit should latch damage flash feedback');

    await setPlayer(page, { x: 0, y: 1, z: 0 }, 0);
    await setMonster(page, { x: 0, y: 1, z: -5 });
    await fire(page);
    monster = await monsterState(page);
    const stunUi = await uiFeedback(page);
    state = await capture('stun-feedback');
    assert(monster.mode === 'stunned', `expected stun pulse to stun monster, got ${monster.mode}`);
    assert(monster.stunTimer > 0, 'stun pulse should start a stun timer');
    assert(stunUi.stunBeamVisible, 'stun pulse should show the beam');
    assert(stunUi.monsterHitFlash > 0, 'stun hit should flash the monster');
    assert(state.ammoMag === 2, `stun pulse should spend one cell, got ${state.ammoMag}`);

    await setPlayer(page, { x: -4, y: 1, z: -4 }, 0);
    const safeHealth = (await runState(page)).health;
    await setMonster(page, { x: -4, y: 1, z: -5 });
    await stepFrames(page, 20);
    state = await capture('safe-room-feedback');
    monster = await monsterState(page);
    const safeUi = await uiFeedback(page);
    assert(state.inSafeRoom, 'player should be inside the med safe room');
    assert(monster.mode !== 'attack', `safe room should suppress attacks, got ${monster.mode}`);
    assert(state.health >= safeHealth, 'safe room should prevent close monster damage');
    assertPrompt(safeUi, 'safe room');

    await setMonster(page, { x: 12, y: 1, z: -12 });

    const power = station(state, 'power');
    const comms = station(state, 'comms');
    const extract = station(state, 'extract');

    await setPlayer(page, power.pos);
    assertPrompt(await uiFeedback(page), 'restore engineering power');
    await interact(page);
    state = await capture('power-restored');
    assert(state.stage === 'findFuse', `expected findFuse after power, got ${state.stage}`);
    assert(state.powered, 'power station should set powered');
    assert(door(state, 'engineering-door').unlocked, 'power door should unlock after power');
    assert(!door(state, 'comms-door').unlocked, 'comms door should stay locked until fuse');
    assert(!door(state, 'escape-lock').unlocked, 'escape should stay locked before holdout');

    await setPlayer(page, extract.pos);
    assertPrompt(await uiFeedback(page), 'airlock clamp sealed');
    await interact(page);
    state = await capture('early-extract-rejected');
    assert(state.stage === 'findFuse', `extract should not win before fuse, got ${state.stage}`);

    await setPlayer(page, state.activeFuse.pos);
    assertPrompt(await uiFeedback(page), 'comms fuse');
    await stepFrames(page, 4);
    state = await capture('fuse-collected');
    assert(state.stage === 'installFuse', `expected installFuse after fuse pickup, got ${state.stage}`);
    assert(state.hasFuse, 'fuse pickup should set hasFuse');
    assert(state.collectedPickupIds.includes(state.activeFuse.id), 'active fuse should be collected');
    assert(door(state, 'comms-door').unlocked, 'comms door should unlock after fuse');
    assert(!door(state, 'escape-lock').unlocked, 'escape should stay locked before holdout');

    const pickupCount = state.collectedPickupIds.length;
    await stepFrames(page, 4);
    state = await capture('fuse-not-collected-twice');
    assert(state.collectedPickupIds.length === pickupCount, 'fuse pickup should collect once');

    await setPlayer(page, extract.pos);
    await interact(page);
    state = await capture('pre-holdout-extract-rejected');
    assert(state.stage === 'installFuse', `extract should not win before holdout, got ${state.stage}`);

    await setPlayer(page, comms.pos);
    assertPrompt(await uiFeedback(page), 'install comms fuse');
    await interact(page);
    state = await capture('holdout-started');
    assertPrompt(await uiFeedback(page), 'transmitter charging');
    assert(state.stage === 'holdout', `expected holdout after comms install, got ${state.stage}`);
    const holdoutStart = state.holdoutSeconds;
    assert(holdoutStart > 0, 'holdout timer should start above zero');

    await advanceHoldoutChunk(page, HOLDOUT_CHUNK_SECONDS);
    state = await capture('holdout-counting-down');
    assert(state.stage === 'holdout', `expected holdout while timer remains, got ${state.stage}`);
    assert(state.holdoutSeconds < holdoutStart - 1, 'holdout timer should count down');
    assert(state.health > 0, 'player should survive the first holdout chunk');

    let guard = 0;
    while (state.stage === 'holdout' && guard++ < 20) {
      await advanceHoldoutChunk(page, HOLDOUT_CHUNK_SECONDS);
      state = await runState(page);
      assert(state.health > 0, `player died during holdout at ${state.holdoutSeconds}s`);
    }
    checkpoints.push({ label: 'holdout-complete', state });
    assert(state.stage === 'extract', `expected extract after holdout, got ${state.stage}`);
    assert(door(state, 'escape-lock').unlocked, 'escape should unlock after holdout');

    await setPlayer(page, extract.pos);
    assertPrompt(await uiFeedback(page), 'cycle airlock');
    await interact(page);
    state = await capture('won');
    const endUi = await uiFeedback(page);
    assert(state.stage === 'won', `expected won after extraction, got ${state.stage}`);
    assert(state.health > 0, 'player should finish alive');
    assert(endUi.endVisible, 'winning should show the end screen');
    assert(endUi.endTitle === 'Signal Restored', `expected win title, got "${endUi.endTitle}"`);
    if (pageErrors.length > 0) throw new Error(`browser page errors:\n${pageErrors.join('\n')}`);

    console.log(
      JSON.stringify(
        {
          ok: true,
          seed: SEED,
          activeFuse: state.activeFuse.id,
          checkpoints: checkpoints.map(({ label, state: snapshot }) => ({
            label,
            stage: snapshot.stage,
            health: Math.round(snapshot.health),
            holdoutSeconds: Number(snapshot.holdoutSeconds.toFixed(2)),
            collectedPickupIds: snapshot.collectedPickupIds,
            doors: Object.fromEntries(snapshot.doors.map((candidate) => [candidate.id, candidate.unlocked])),
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await browser?.close();
    stopLookdev(vite);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
