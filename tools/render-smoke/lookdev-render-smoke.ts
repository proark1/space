import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { inflateSync } from 'node:zlib';
import { chromium, type Browser, type Page } from 'playwright';

interface RenderMetrics {
  readonly frames: number;
  readonly backend: string;
  readonly fps: number;
  readonly budget: {
    readonly samples: number;
    readonly drawCalls: number;
    readonly triangles: number;
    readonly lastFrameMs: number;
    readonly medianFrameMs: number;
    readonly p95FrameMs: number;
    readonly maxDrawCalls: number;
    readonly maxMedianFrameMs: number;
    readonly maxP95FrameMs: number;
    readonly ok: boolean;
  };
  readonly info: {
    readonly drawCalls: number;
    readonly triangles: number;
    readonly geometries: number;
    readonly textures: number;
  };
}

interface CanvasProbe {
  readonly source: 'screenshot';
  readonly width: number;
  readonly height: number;
  readonly nonBlackRatio: number;
  readonly avgLuma: number;
  readonly lumaRange: number;
}

const LOOKDEV_PORT = Number(process.env.LOOKDEV_RENDER_SMOKE_PORT ?? 4178);
const TIMEOUT_MS = Number(process.env.LOOKDEV_RENDER_SMOKE_TIMEOUT_MS ?? 60_000);
const FRAMES = Number(process.env.LOOKDEV_RENDER_SMOKE_FRAMES ?? 300);
const SCENE = process.env.LOOKDEV_RENDER_SMOKE_SCENE ?? 'corridor';
const TIER = process.env.LOOKDEV_RENDER_SMOKE_TIER ?? 'high';
const CHAOS_COUNT = Number(process.env.LOOKDEV_RENDER_SMOKE_N ?? 300);
const MAX_DRAWS = Number(process.env.LOOKDEV_RENDER_SMOKE_MAX_DRAWS ?? 150);
const MAX_MEDIAN_FRAME_MS = Number(process.env.LOOKDEV_RENDER_SMOKE_MAX_MEDIAN_FRAME_MS ?? 20);
const MAX_P95_FRAME_MS = Number(process.env.LOOKDEV_RENDER_SMOKE_MAX_P95_FRAME_MS ?? 50);
// Headless Chromium rAF cadence varies heavily on local Macs under load; CPU/GPU frame budgets carry
// the perf gate, while FPS remains a liveness check that the render loop is advancing.
const MIN_FPS = Number(process.env.LOOKDEV_RENDER_SMOKE_MIN_FPS ?? 1);
const MIN_NONBLACK_RATIO = Number(process.env.LOOKDEV_RENDER_SMOKE_MIN_NONBLACK_RATIO ?? 0.01);
const MIN_LUMA_RANGE = Number(process.env.LOOKDEV_RENDER_SMOKE_MIN_LUMA_RANGE ?? 8);

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

async function renderMetrics(page: Page): Promise<RenderMetrics> {
  return page.evaluate(() => (window as any).__sl.renderMetrics() as RenderMetrics);
}

function paeth(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upLeft;
}

function decodePngPixels(buffer: Buffer): { readonly width: number; readonly height: number; readonly channels: number; readonly data: Uint8Array } {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) throw new Error('screenshot is not a PNG');

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG format: bitDepth=${bitDepth}, interlace=${interlace}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`unsupported PNG color type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  let inputOffset = 0;
  let outputOffset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[inputOffset++]!;
    for (let x = 0; x < stride; x++) {
      const value = raw[inputOffset++]!;
      const left = x >= channels ? pixels[outputOffset + x - channels]! : 0;
      const up = y > 0 ? pixels[outputOffset + x - stride]! : 0;
      const upLeft = y > 0 && x >= channels ? pixels[outputOffset + x - stride - channels]! : 0;
      const prediction =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((left + up) / 2)
                : filter === 4
                  ? paeth(left, up, upLeft)
                  : undefined;
      if (prediction === undefined) throw new Error(`unsupported PNG filter ${filter}`);
      pixels[outputOffset + x] = (value + prediction) & 0xff;
    }
    outputOffset += stride;
  }
  return { width, height, channels, data: pixels };
}

function probePng(buffer: Buffer): CanvasProbe {
  const png = decodePngPixels(buffer);
  let nonBlack = 0;
  let lumaSum = 0;
  let minLuma = 255;
  let maxLuma = 0;
  for (let i = 0; i < png.data.length; i += png.channels) {
    const r = png.data[i]!;
    const g = png.data[i + 1]!;
    const b = png.data[i + 2]!;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luma > 4) nonBlack++;
    lumaSum += luma;
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
  }
  const pixels = png.width * png.height;
  return {
    source: 'screenshot',
    width: png.width,
    height: png.height,
    nonBlackRatio: nonBlack / pixels,
    avgLuma: lumaSum / pixels,
    lumaRange: maxLuma - minLuma,
  };
}

async function canvasProbe(page: Page): Promise<CanvasProbe> {
  const box = await page.locator('#scene').boundingBox();
  if (!box) throw new Error('missing #scene canvas box');
  const marginX = Math.min(Math.max(16, box.width * 0.1), box.width * 0.3);
  const marginTop = Math.min(Math.max(72, box.height * 0.15), box.height * 0.4);
  const marginBottom = Math.min(Math.max(24, box.height * 0.08), box.height * 0.25);
  const clip = {
    x: Math.floor(box.x + marginX),
    y: Math.floor(box.y + marginTop),
    width: Math.max(1, Math.floor(box.width - marginX * 2)),
    height: Math.max(1, Math.floor(box.height - marginTop - marginBottom)),
  };
  const screenshot = await page.screenshot({ type: 'png', clip });
  return probePng(screenshot);
}

function assertRenderBudgets(metrics: RenderMetrics, probe: CanvasProbe): void {
  if (metrics.backend !== 'webgl2') throw new Error(`expected forced WebGL2 backend, got ${metrics.backend}`);
  if (metrics.info.drawCalls > MAX_DRAWS) throw new Error(`draw calls ${metrics.info.drawCalls} exceeds ${MAX_DRAWS}`);
  if (metrics.budget.medianFrameMs > MAX_MEDIAN_FRAME_MS) {
    throw new Error(`median render frame ${metrics.budget.medianFrameMs.toFixed(2)}ms exceeds ${MAX_MEDIAN_FRAME_MS}ms`);
  }
  if (metrics.budget.p95FrameMs > MAX_P95_FRAME_MS) {
    throw new Error(`p95 render frame ${metrics.budget.p95FrameMs.toFixed(2)}ms exceeds ${MAX_P95_FRAME_MS}ms`);
  }
  if (metrics.fps < MIN_FPS) throw new Error(`fps ${metrics.fps} below ${MIN_FPS}`);
  if (probe.nonBlackRatio < MIN_NONBLACK_RATIO) {
    throw new Error(`canvas non-black ratio ${probe.nonBlackRatio.toFixed(4)} below ${MIN_NONBLACK_RATIO}`);
  }
  if (probe.lumaRange < MIN_LUMA_RANGE) {
    throw new Error(`canvas luma range ${probe.lumaRange.toFixed(2)} below ${MIN_LUMA_RANGE}`);
  }
}

async function main(): Promise<void> {
  let vite: ChildProcessWithoutNullStreams | undefined;
  let browser: Browser | undefined;
  try {
    vite = startLookdev();
    const baseUrl = `http://127.0.0.1:${LOOKDEV_PORT}`;
    await waitForHttp(baseUrl, TIMEOUT_MS);

    browser = await chromium.launch({
      headless: true,
      args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
    });
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type())) {
        process.stderr.write(`[browser:${msg.type()}] ${msg.text()}\n`);
      }
    });

    const sceneParams = new URLSearchParams({ gl: '2', scene: SCENE, tier: TIER });
    if (SCENE === 'chaos') sceneParams.set('n', String(CHAOS_COUNT));
    await page.goto(`${baseUrl}/?${sceneParams}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      (frames) => {
        const metrics = (window as any).__sl?.renderMetrics?.() as RenderMetrics | undefined;
        return metrics && metrics.frames >= frames && metrics.fps > 0;
      },
      FRAMES,
      { timeout: TIMEOUT_MS },
    );
    if (pageErrors.length > 0) throw new Error(`browser page errors:\n${pageErrors.join('\n')}`);

    const metrics = await renderMetrics(page);
    const probe = await canvasProbe(page);
    assertRenderBudgets(metrics, probe);
    console.log(JSON.stringify({ ok: true, scene: SCENE, frames: FRAMES, metrics, canvas: probe }, null, 2));
  } finally {
    await browser?.close();
    stopLookdev(vite);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
