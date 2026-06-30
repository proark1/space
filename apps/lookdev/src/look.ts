import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  FogExp2,
  HemisphereLight,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
} from 'three';
import type { PostUniformsBank } from '@sl/render';

export const LOOK = {
  black: 0x05070a,
  fog: 0x071019,
  steelDark: 0x2b2f36,
  steel: 0x3a4048,
  steelLight: 0x56616c,
  floor: 0x242b31,
  grime: 0x10161d,
  rubber: 0x080b0d,
  rust: 0x6e4a33,
  amber: 0xe8a33d,
  orange: 0xc97b3b,
  cyan: 0x9fd0ff,
  blood: 0x4a0c0c,
} as const;

export interface IndustrialMaterials {
  readonly wall: MeshStandardMaterial;
  readonly floor: MeshStandardMaterial;
  readonly crate: MeshStandardMaterial;
  readonly trim: MeshStandardMaterial;
  readonly darkRubber: MeshStandardMaterial;
  readonly hazard: MeshStandardMaterial;
  readonly amberLight: MeshStandardMaterial;
  readonly cyanLight: MeshStandardMaterial;
  readonly bloodDecal: MeshBasicMaterial;
  readonly scorchDecal: MeshBasicMaterial;
}

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function rgba(color: number, alpha: number): string {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function textureFromCanvas(
  width: number,
  height: number,
  repeat: readonly [number, number],
  draw: (ctx: CanvasRenderingContext2D, rng: () => number) => void,
  seed: number,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');
  draw(ctx, makeRng(seed));

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.generateMipmaps = false;
  return texture;
}

function drawGrime(ctx: CanvasRenderingContext2D, rng: () => number, color: number, count: number): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rgba(color, 0.08 + rng() * 0.16);
    ctx.fillRect(Math.floor(rng() * 128), Math.floor(rng() * 128), 1 + Math.floor(rng() * 9), 1 + Math.floor(rng() * 3));
  }
}

function wallTexture(): CanvasTexture {
  return textureFromCanvas(
    128,
    128,
    [2, 10],
    (ctx, rng) => {
      ctx.fillStyle = css(LOOK.steel);
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = css(LOOK.steelDark);
      ctx.lineWidth = 2;
      for (const x of [0, 31, 64, 96, 127]) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 128);
        ctx.stroke();
      }
      for (const y of [18, 63, 110]) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(128, y);
        ctx.stroke();
      }
      ctx.fillStyle = css(LOOK.rust);
      for (const x of [30, 63, 95]) {
        for (const y of [16, 61, 108]) ctx.fillRect(x - 1, y - 1, 3, 3);
      }
      drawGrime(ctx, rng, LOOK.black, 90);
      drawGrime(ctx, rng, LOOK.rust, 30);
    },
    17,
  );
}

function floorTexture(): CanvasTexture {
  return textureFromCanvas(
    128,
    128,
    [2, 12],
    (ctx, rng) => {
      ctx.fillStyle = css(LOOK.floor);
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = css(LOOK.grime);
      ctx.lineWidth = 2;
      for (let y = 8; y < 128; y += 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(128, y);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(LOOK.steelLight, 0.28);
      ctx.lineWidth = 1;
      for (let x = 8; x < 128; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 128);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(LOOK.amber, 0.65);
      for (let y = 8; y < 128; y += 32) {
        ctx.save();
        ctx.translate(98, y);
        ctx.rotate(-Math.PI / 4);
        ctx.fillRect(-4, -18, 8, 36);
        ctx.restore();
      }
      drawGrime(ctx, rng, LOOK.black, 120);
      drawGrime(ctx, rng, LOOK.rust, 26);
    },
    29,
  );
}

function crateTexture(): CanvasTexture {
  return textureFromCanvas(
    128,
    128,
    [2, 2],
    (ctx, rng) => {
      ctx.fillStyle = css(LOOK.rust);
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = css(LOOK.steelDark);
      ctx.lineWidth = 5;
      ctx.strokeRect(7, 7, 114, 114);
      ctx.beginPath();
      ctx.moveTo(14, 64);
      ctx.lineTo(114, 64);
      ctx.moveTo(64, 14);
      ctx.lineTo(64, 114);
      ctx.stroke();
      drawGrime(ctx, rng, LOOK.black, 85);
      drawGrime(ctx, rng, LOOK.orange, 26);
    },
    43,
  );
}

function hazardTexture(): CanvasTexture {
  return textureFromCanvas(
    64,
    64,
    [1, 1],
    (ctx) => {
      ctx.fillStyle = css(LOOK.amber);
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = css(LOOK.black);
      for (let x = -64; x < 128; x += 24) {
        ctx.save();
        ctx.translate(x, 32);
        ctx.rotate(-Math.PI / 4);
        ctx.fillRect(-6, -48, 12, 96);
        ctx.restore();
      }
    },
    59,
  );
}

function decalTexture(kind: 'blood' | 'scorch'): CanvasTexture {
  return textureFromCanvas(
    64,
    64,
    [1, 1],
    (ctx, rng) => {
      ctx.clearRect(0, 0, 64, 64);
      const color = kind === 'blood' ? LOOK.blood : LOOK.black;
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = rgba(color, kind === 'blood' ? 0.18 + rng() * 0.28 : 0.08 + rng() * 0.18);
        ctx.beginPath();
        ctx.ellipse(24 + rng() * 22, 24 + rng() * 20, 8 + rng() * 12, 3 + rng() * 9, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      if (kind === 'blood') {
        ctx.strokeStyle = rgba(LOOK.blood, 0.42);
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const x = 25 + rng() * 18;
          ctx.beginPath();
          ctx.moveTo(x, 28 + rng() * 8);
          ctx.lineTo(x + rng() * 5 - 2, 54 + rng() * 8);
          ctx.stroke();
        }
      }
    },
    kind === 'blood' ? 71 : 73,
  );
}

export function createIndustrialMaterials(): IndustrialMaterials {
  const material = (color: number, map?: CanvasTexture): MeshStandardMaterial =>
    new MeshStandardMaterial({ color, ...(map ? { map } : {}), roughness: 0.92, metalness: 0.04, flatShading: true });

  return {
    wall: material(LOOK.steel, wallTexture()),
    floor: material(LOOK.floor, floorTexture()),
    crate: material(LOOK.rust, crateTexture()),
    trim: material(LOOK.steelDark),
    darkRubber: material(LOOK.rubber),
    hazard: material(LOOK.amber, hazardTexture()),
    amberLight: new MeshStandardMaterial({
      color: LOOK.amber,
      emissive: LOOK.amber,
      emissiveIntensity: 1.25,
      roughness: 0.55,
      metalness: 0.0,
      flatShading: true,
    }),
    cyanLight: new MeshStandardMaterial({
      color: LOOK.cyan,
      emissive: LOOK.cyan,
      emissiveIntensity: 0.85,
      roughness: 0.5,
      metalness: 0.0,
      flatShading: true,
    }),
    bloodDecal: new MeshBasicMaterial({
      map: decalTexture('blood'),
      transparent: true,
      depthWrite: false,
      color: new Color(LOOK.blood),
    }),
    scorchDecal: new MeshBasicMaterial({
      map: decalTexture('scorch'),
      transparent: true,
      depthWrite: false,
      color: new Color(0x222222),
    }),
  };
}

export function applyLookdevAtmosphere(
  scene: Scene,
  opts: { readonly fogDensity?: number; readonly hemiIntensity?: number } = {},
): void {
  scene.background = new Color(LOOK.black);
  scene.fog = new FogExp2(LOOK.fog, opts.fogDensity ?? 0.012);
  scene.add(new HemisphereLight(0x172331, LOOK.black, opts.hemiIntensity ?? 0.42));
}

export function configureLookdevPost(uniforms: PostUniformsBank): void {
  uniforms.exposure.value = 1.2;
  uniforms.saturation.value = 0.78;
  uniforms.fogDensity.value = 0.044;
  uniforms.vignette.value = 0.52;
  uniforms.posterizeLevels.value = 6;
  uniforms.ditherAmount.value = 0.28;
}

export function createDustField(
  width: number,
  height: number,
  length: number,
  count: number,
  seed = 101,
): Points {
  const rng = makeRng(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rng() - 0.5) * width;
    positions[i * 3 + 1] = 0.2 + rng() * height;
    positions[i * 3 + 2] = (rng() - 0.5) * length;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return new Points(
    geometry,
    new PointsMaterial({
      color: LOOK.cyan,
      size: 0.018,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: true,
    }),
  );
}
