import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface PanelStats {
  total: number;
  approved: number;
  generated: number;
  missing: number;
  stale: number;
}

interface Admin3DProps {
  onStats: (stats: PanelStats) => void;
  onToast: (message: string) => void;
}

interface UnitItem {
  id: string;
  name: string;
  kind: string;
  prompt: string;
  role?: string;
  rig?: boolean;
  frontUrl?: string;
  backUrl?: string;
  sideUrl?: string;
  glbUrl?: string;
  riggedUrl?: string;
  model_status?: string;
  rig_status?: string;
  height?: number;
  scale?: number;
  yaw?: number;
  colliderRadius?: number;
  colliderHeight?: number;
}

interface UnitDraft {
  name: string;
  kind: string;
  prompt: string;
  role: string;
  height: number;
  scale: number;
  yaw: number;
  colliderRadius: number;
  colliderHeight: number;
  uploadAsRigged: boolean;
}

interface SceneSettings {
  id: 'spaceship' | 'lobby';
  name: string;
  modelUrl: string;
  baseColor: string;
  emissiveColor: string;
  emissiveIntensity: number;
  scale: number;
  positionY: number;
  rotationY: number;
  ambientIntensity: number;
  keyIntensity: number;
  fogDensity: number;
  updatedAt?: string;
}

const UNIT_SEED: UnitItem[] = [
  {
    id: 'unit-crew',
    name: 'Rescue-suit crew',
    kind: 'crew',
    rig: true,
    prompt: 'Low-poly PS1-style salvage astronaut in a worn white-grey rescue suit, bulky gloves and boots, amber helmet light, full body.',
  },
  {
    id: 'unit-captain',
    name: 'Lost captain',
    kind: 'crew',
    rig: true,
    prompt: 'The derelict ship lost captain in a battered grey-green flight suit, gaunt face, faded mission patches, exhausted and haunted.',
  },
  {
    id: 'unit-chorus',
    name: 'THE CHORUS',
    kind: 'monster',
    rig: true,
    prompt: 'Eyeless wet-chitin mimic creature with a bioluminescent throat, long predatory limbs, readable horror silhouette.',
  },
  {
    id: 'unit-swarmer',
    name: 'Swarmer',
    kind: 'enemy',
    rig: true,
    prompt: 'Small many-limbed vent creature, low-poly, fast and skittering, wet black shell with pale throat glow.',
  },
  {
    id: 'unit-crate',
    name: 'Supply crate',
    kind: 'prop',
    rig: false,
    prompt: 'Chunky salvage supply crate with hazard strips, low-poly game prop, readable from a distance.',
  },
];

const SCENE_DEFAULTS: Record<SceneSettings['id'], SceneSettings> = {
  spaceship: {
    id: 'spaceship',
    name: 'Space Ship',
    modelUrl: '',
    baseColor: '#717a86',
    emissiveColor: '#36e0d0',
    emissiveIntensity: 2.4,
    scale: 1,
    positionY: 0,
    rotationY: 0.15,
    ambientIntensity: 0.85,
    keyIntensity: 3.3,
    fogDensity: 0.00045,
  },
  lobby: {
    id: 'lobby',
    name: 'Lobby',
    modelUrl: '',
    baseColor: '#c9ced6',
    emissiveColor: '#bfe9ff',
    emissiveIntensity: 1.6,
    scale: 1,
    positionY: 0,
    rotationY: 0,
    ambientIntensity: 0.7,
    keyIntensity: 1.5,
    fogDensity: 0.009,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function assetUrl(file: string | undefined): string {
  if (!file) return '';
  return /^(https?:|data:|blob:|\/)/.test(file) ? file : `/${file}`;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function normalizeUnit(item: unknown): UnitItem | undefined {
  if (!isRecord(item)) return undefined;
  const id = stringValue(item.id).trim();
  if (!id) return undefined;
  return {
    id,
    name: stringValue(item.name, id),
    kind: stringValue(item.kind, 'custom'),
    prompt: stringValue(item.prompt),
    role: stringValue(item.role),
    rig: booleanValue(item.rig, true),
    frontUrl: assetUrl(stringValue(item.frontUrl)),
    backUrl: assetUrl(stringValue(item.backUrl)),
    sideUrl: assetUrl(stringValue(item.sideUrl)),
    glbUrl: assetUrl(stringValue(item.glbUrl)),
    riggedUrl: assetUrl(stringValue(item.riggedUrl)),
    model_status: stringValue(item.model_status),
    rig_status: stringValue(item.rig_status),
    height: numberValue(item.height, 1.8),
    scale: numberValue(item.scale, 1),
    yaw: numberValue(item.yaw, 0),
    colliderRadius: numberValue(item.colliderRadius, 0.35),
    colliderHeight: numberValue(item.colliderHeight, numberValue(item.height, 1.8)),
  };
}

function mergeUnits(serverItems: unknown[]): UnitItem[] {
  const server = new Map<string, UnitItem>();
  for (const item of serverItems) {
    const unit = normalizeUnit(item);
    if (unit) server.set(unit.id, unit);
  }
  const merged = UNIT_SEED.map((seed) => ({ ...seed, ...(server.get(seed.id) ?? {}) }));
  for (const unit of server.values()) {
    if (!UNIT_SEED.some((seed) => seed.id === unit.id)) merged.push(unit);
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

function unitDraft(unit: UnitItem | undefined): UnitDraft {
  return {
    name: unit?.name ?? '',
    kind: unit?.kind ?? 'custom',
    prompt: unit?.prompt ?? '',
    role: unit?.role ?? '',
    height: unit?.height ?? 1.8,
    scale: unit?.scale ?? 1,
    yaw: unit?.yaw ?? 0,
    colliderRadius: unit?.colliderRadius ?? 0.35,
    colliderHeight: unit?.colliderHeight ?? unit?.height ?? 1.8,
    uploadAsRigged: false,
  };
}

function normalizeScene(id: SceneSettings['id'], item: unknown): SceneSettings {
  const base = SCENE_DEFAULTS[id];
  if (!isRecord(item)) return base;
  return {
    ...base,
    modelUrl: assetUrl(stringValue(item.modelUrl, base.modelUrl)),
    baseColor: stringValue(item.baseColor, base.baseColor),
    emissiveColor: stringValue(item.emissiveColor, base.emissiveColor),
    emissiveIntensity: numberValue(item.emissiveIntensity, base.emissiveIntensity),
    scale: numberValue(item.scale, base.scale),
    positionY: numberValue(item.positionY, base.positionY),
    rotationY: numberValue(item.rotationY, base.rotationY),
    ambientIntensity: numberValue(item.ambientIntensity, base.ambientIntensity),
    keyIntensity: numberValue(item.keyIntensity, base.keyIntensity),
    fogDensity: numberValue(item.fogDensity, base.fogDensity),
    updatedAt: stringValue(item.updatedAt),
  };
}

function readyUnit(unit: UnitItem): boolean {
  return Boolean(unit.glbUrl || unit.riggedUrl);
}

function previewStats(units: UnitItem[]): PanelStats {
  const ready = units.filter(readyUnit).length;
  const running = units.filter((unit) => unit.model_status === 'running' || unit.rig_status === 'running').length;
  return {
    total: units.length,
    approved: ready,
    generated: ready,
    missing: units.length - ready,
    stale: running,
  };
}

const PREVIEW_DOC = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:#05070a;font-family:ui-monospace,Menlo,monospace}
  #c{width:100%;height:100%;display:block}
  #label{position:fixed;left:12px;bottom:10px;color:#9fb0bd;font:11px ui-monospace,Menlo,monospace;pointer-events:none}
</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
</head>
<body>
<canvas id="c"></canvas>
<div id="label">drag orbit · scroll zoom</div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);
scene.fog = new THREE.FogExp2(0x05070a, 0.02);
const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 500);
camera.position.set(4, 3, 6);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
const ambient = new THREE.AmbientLight(0x9fb0c8, 0.8);
scene.add(ambient);
const key = new THREE.DirectionalLight(0xfff0d6, 2.4);
key.position.set(5, 8, 4);
key.castShadow = true;
scene.add(key);
const fill = new THREE.DirectionalLight(0x7fd2ff, 0.55);
fill.position.set(-5, 2, -3);
scene.add(fill);
const grid = new THREE.GridHelper(12, 12, 0x33414d, 0x17202a);
scene.add(grid);

const baseMat = new THREE.MeshStandardMaterial({ color: 0x717a86, roughness: 0.72, metalness: 0.36 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.6, metalness: 0.5 });
const glowMat = new THREE.MeshStandardMaterial({ color: 0x06131a, emissive: 0x36e0d0, emissiveIntensity: 1.8, roughness: 1 });
const root = new THREE.Group();
scene.add(root);
const placeholder = new THREE.Group();
root.add(placeholder);

function mesh(geo, mat, x, y, z, rx=0, ry=0, rz=0) {
  const out = new THREE.Mesh(geo, mat);
  out.position.set(x, y, z);
  out.rotation.set(rx, ry, rz);
  out.castShadow = true;
  out.receiveShadow = true;
  placeholder.add(out);
  return out;
}

function buildFallback(kind) {
  placeholder.clear();
  if (kind === 'spaceship') {
    for (let i = 0; i < 6; i += 1) mesh(new THREE.BoxGeometry(1.8, 1.1, 1.8), i % 2 ? trimMat : baseMat, 0, 1, -4 + i * 1.65);
    mesh(new THREE.BoxGeometry(3.5, 0.18, 1.8), trimMat, 2.8, 1.7, 3, 0, 0, -0.35);
    mesh(new THREE.BoxGeometry(3.5, 0.18, 1.8), trimMat, -2.8, 1.7, 3, 0, 0, 0.35);
    for (const x of [-0.8, 0, 0.8]) mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.7, 16), glowMat, x, 1, 5.2, Math.PI / 2, 0, 0);
  } else if (kind === 'lobby') {
    mesh(new THREE.BoxGeometry(6, 0.15, 6), baseMat, 0, 0, 0);
    mesh(new THREE.BoxGeometry(6, 3, 0.15), baseMat, 0, 1.5, -3);
    mesh(new THREE.BoxGeometry(0.15, 3, 6), baseMat, -3, 1.5, 0);
    mesh(new THREE.BoxGeometry(0.15, 3, 6), baseMat, 3, 1.5, 0);
    mesh(new THREE.BoxGeometry(2.4, 1.2, 0.08), glowMat, 2.92, 1.8, 0, 0, Math.PI / 2, 0);
    mesh(new THREE.BoxGeometry(1.4, 2, 0.12), trimMat, 0, 1, -2.92);
  } else {
    mesh(new THREE.CapsuleGeometry(0.32, 0.9, 6, 16), baseMat, 0, 1.2, 0);
    mesh(new THREE.SphereGeometry(0.32, 20, 16), trimMat, 0, 1.92, 0);
    mesh(new THREE.BoxGeometry(0.88, 0.2, 0.18), glowMat, 0, 1.9, -0.26);
    mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), baseMat, -0.48, 1.22, 0);
    mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), baseMat, 0.48, 1.22, 0);
    mesh(new THREE.BoxGeometry(0.18, 0.72, 0.18), trimMat, -0.18, 0.45, 0);
    mesh(new THREE.BoxGeometry(0.18, 0.72, 0.18), trimMat, 0.18, 0.45, 0);
  }
}

const loader = new GLTFLoader();
let settings = {};
let loaded = null;
let loadedUrl = '';

function validHex(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeModel(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.set(-center.x, -box.min.y, -center.z);
  const maxAxis = Math.max(size.x, size.y, size.z, 1);
  object.scale.setScalar(2.2 / maxAxis);
  object.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
}

function loadModel(url) {
  if (!url) {
    if (loaded) loaded.visible = false;
    placeholder.visible = true;
    loadedUrl = '';
    return;
  }
  if (url === loadedUrl) return;
  loadedUrl = url;
  loader.load(url, (gltf) => {
    if (loaded) root.remove(loaded);
    loaded = gltf.scene;
    normalizeModel(loaded);
    root.add(loaded);
    placeholder.visible = false;
  }, undefined, () => {
    loadedUrl = '';
    if (loaded) loaded.visible = false;
    placeholder.visible = true;
  });
}

function applySettings() {
  buildFallback(settings.previewKind || 'unit');
  baseMat.color.set(validHex(settings.baseColor, '#717a86'));
  glowMat.emissive.set(validHex(settings.emissiveColor, '#36e0d0'));
  glowMat.emissiveIntensity = num(settings.emissiveIntensity, 1.8);
  ambient.intensity = num(settings.ambientIntensity, 0.8);
  key.intensity = num(settings.keyIntensity, 2.4);
  scene.fog.density = num(settings.fogDensity, 0.02);
  root.scale.setScalar(num(settings.scale, 1));
  root.position.y = num(settings.positionY, 0);
  root.rotation.y = num(settings.rotationY, num(settings.yaw, 0));
  loadModel(settings.modelUrl || '');
}

addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'sl-admin-preview') return;
  settings = event.data.settings || {};
  applySettings();
});

function resize() {
  const w = Math.max(1, canvas.clientWidth || innerWidth);
  const h = Math.max(1, canvas.clientHeight || innerHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
buildFallback('unit');
function tick() {
  requestAnimationFrame(tick);
  controls.update();
  renderer.render(scene, camera);
}
tick();
parent.postMessage({ type: 'sl-admin-preview-ready' }, '*');
</script>
</body>
</html>`;

function ThreePreviewFrame(props: { settings: Record<string, unknown> }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.source === iframeRef.current?.contentWindow && isRecord(event.data) && event.data.type === 'sl-admin-preview-ready') {
        setReady(true);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    iframeRef.current?.contentWindow?.postMessage({ type: 'sl-admin-preview', settings: props.settings }, '*');
  }, [props.settings, ready]);

  return <iframe ref={iframeRef} className="model-preview-frame" title="3D editor preview" srcDoc={PREVIEW_DOC} />;
}

function NumberField(props: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="model-field">
      <span>{props.label}</span>
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step ?? 0.1}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="model-field">
      <span>{props.label}</span>
      {props.multiline ? (
        <textarea value={props.value} rows={4} onChange={(event) => props.onChange(event.target.value)} />
      ) : (
        <input value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      )}
    </label>
  );
}

function ColorField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="model-field model-field--color">
      <span>{props.label}</span>
      <input type="color" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function ModelStatusPill(props: { unit: UnitItem }) {
  if (props.unit.riggedUrl) return <span className="model-pill model-pill--ready">rigged model</span>;
  if (props.unit.glbUrl) return <span className="model-pill model-pill--ready">model ready</span>;
  if (props.unit.model_status === 'running' || props.unit.rig_status === 'running') return <span className="model-pill model-pill--work">building</span>;
  return <span className="model-pill">missing model</span>;
}

export function UnitsAdminPanel({ onStats, onToast }: Admin3DProps) {
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<UnitDraft>(() => unitDraft(undefined));
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => units.find((unit) => unit.id === selectedId) ?? units[0], [selectedId, units]);
  const selectedModelUrl = selected?.riggedUrl || selected?.glbUrl || '';

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/units', { cache: 'no-store' });
      const payload: unknown = await response.json();
      const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
      const merged = mergeUnits(items);
      setUnits(merged);
      onStats(previewStats(merged));
      if (!selectedId && merged[0]) setSelectedId(merged[0].id);
    } catch (error) {
      const fallback = mergeUnits([]);
      setUnits(fallback);
      onStats(previewStats(fallback));
      onToast(`Units endpoint unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }, [onStats, onToast, selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setDraft(unitDraft(selected));
  }, [selected]);

  const save = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    onToast(`Saving ${selected.id}...`);
    try {
      const response = await fetch('/api/admin/unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, ...draft }),
      });
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.ok !== true) {
        onToast(`Unit save failed: ${stringValue(isRecord(payload) ? payload.error : undefined, 'unknown error')}`);
        return;
      }
      onToast(`Saved ${selected.id}. New games will load this unit metadata.`);
      await refresh();
    } catch (error) {
      onToast(`Unit save failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const uploadGlb = async (file: File): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    onToast(`Uploading ${file.name} for ${selected.id}...`);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const response = await fetch('/api/unit-glb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, name: draft.name, dataUrl, rigged: draft.uploadAsRigged }),
      });
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.ok !== true) {
        onToast(`GLB upload failed: ${stringValue(isRecord(payload) ? payload.error : undefined, 'unknown error')}`);
        return;
      }
      const size = numberValue(payload.size, 0);
      onToast(`Uploaded ${selected.id}${size ? ` (${formatBytes(size)})` : ''}.`);
      await refresh();
    } catch (error) {
      onToast(`GLB upload failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const previewSettings = useMemo(() => ({
    previewKind: 'unit',
    modelUrl: selectedModelUrl,
    scale: draft.scale,
    yaw: draft.yaw,
    rotationY: draft.yaw,
    positionY: 0,
    baseColor: '#b7b4a9',
    emissiveColor: '#7fd2ff',
    emissiveIntensity: 1.3,
    ambientIntensity: 0.9,
    keyIntensity: 2.4,
    fogDensity: 0.018,
  }), [draft.scale, draft.yaw, selectedModelUrl]);

  return (
    <section className="model-admin">
      <div className="model-admin__split">
        <aside className="model-list" aria-label="Units">
          <div className="model-list__head">
            <h2>Units</h2>
            <button onClick={() => void refresh()} disabled={busy}>Refresh</button>
          </div>
          {units.map((unit) => (
            <button
              className={unit.id === selected?.id ? 'active' : ''}
              key={unit.id}
              onClick={() => setSelectedId(unit.id)}
            >
              <strong>{unit.name}</strong>
              <span>{unit.id}</span>
              <ModelStatusPill unit={unit} />
            </button>
          ))}
        </aside>

        <div className="model-workspace">
          <div className="model-workspace__preview">
            <ThreePreviewFrame settings={previewSettings} />
          </div>
          {selected ? (
            <div className="model-editor">
              <div className="model-editor__head">
                <div>
                  <p className="eyebrow">Unit editor</p>
                  <h2>{selected.name}</h2>
                </div>
                <div className="model-editor__actions">
                  {selectedModelUrl ? <a href={`/model?id=${selected.id}${selected.riggedUrl ? '&rig=1' : ''}`} target="_blank" rel="noreferrer">Open viewer</a> : null}
                  <a href="/forge" target="_blank" rel="noreferrer">Open Forge</a>
                  <button onClick={() => fileRef.current?.click()} disabled={busy}>Upload GLB</button>
                  <button onClick={() => void save()} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
                </div>
              </div>

              <div className="model-editor__grid">
                <TextField label="Name" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
                <TextField label="Kind" value={draft.kind} onChange={(kind) => setDraft((current) => ({ ...current, kind }))} />
                <TextField label="Gameplay role" value={draft.role} onChange={(role) => setDraft((current) => ({ ...current, role }))} />
                <NumberField label="Height" value={draft.height} step={0.05} min={0.1} onChange={(height) => setDraft((current) => ({ ...current, height, colliderHeight: current.colliderHeight || height }))} />
                <NumberField label="Preview scale" value={draft.scale} step={0.05} min={0.05} onChange={(scale) => setDraft((current) => ({ ...current, scale }))} />
                <NumberField label="Yaw" value={draft.yaw} step={0.05} onChange={(yaw) => setDraft((current) => ({ ...current, yaw }))} />
                <NumberField label="Collider radius" value={draft.colliderRadius} step={0.05} min={0.01} onChange={(colliderRadius) => setDraft((current) => ({ ...current, colliderRadius }))} />
                <NumberField label="Collider height" value={draft.colliderHeight} step={0.05} min={0.01} onChange={(colliderHeight) => setDraft((current) => ({ ...current, colliderHeight }))} />
                <label className="model-field model-field--check">
                  <input type="checkbox" checked={draft.uploadAsRigged} onChange={(event) => setDraft((current) => ({ ...current, uploadAsRigged: event.target.checked }))} />
                  <span>Upload as rigged model</span>
                </label>
                <TextField label="Generation prompt" value={draft.prompt} multiline onChange={(prompt) => setDraft((current) => ({ ...current, prompt }))} />
              </div>

              <div className="model-meta">
                {selected.frontUrl ? <a href={selected.frontUrl} target="_blank" rel="noreferrer">front view</a> : <span>front missing</span>}
                {selected.backUrl ? <a href={selected.backUrl} target="_blank" rel="noreferrer">back view</a> : <span>back missing</span>}
                {selected.sideUrl ? <a href={selected.sideUrl} target="_blank" rel="noreferrer">side view</a> : <span>side missing</span>}
                {selected.glbUrl ? <a href={selected.glbUrl} target="_blank" rel="noreferrer">glb</a> : <span>glb missing</span>}
                {selected.riggedUrl ? <a href={selected.riggedUrl} target="_blank" rel="noreferrer">rigged glb</a> : <span>rigged missing</span>}
              </div>

              <input
                ref={fileRef}
                type="file"
                accept=".glb,model/gltf-binary"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void uploadGlb(file);
                }}
              />
            </div>
          ) : (
            <section className="admin-empty">No units are available.</section>
          )}
        </div>
      </div>
    </section>
  );
}

export function SceneAdminPanel(props: Admin3DProps & {
  sceneId: SceneSettings['id'];
  title: string;
  copy: string;
  liveUrl: string;
}) {
  const { onStats, onToast, sceneId, title } = props;
  const [settings, setSettings] = useState<SceneSettings>(() => SCENE_DEFAULTS[props.sceneId]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/admin/scene/${props.sceneId}`, { cache: 'no-store' });
      const payload: unknown = await response.json();
      const scene = normalizeScene(props.sceneId, isRecord(payload) ? payload.scene : undefined);
      setSettings(scene);
      onStats({
        total: 1,
        approved: scene.updatedAt ? 1 : 0,
        generated: scene.modelUrl ? 1 : 0,
        missing: 0,
        stale: 0,
      });
    } catch (error) {
      onStats({ total: 1, approved: 0, generated: 0, missing: 0, stale: 1 });
      onToast(`${title} settings unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }, [onStats, onToast, props.sceneId, title]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (): Promise<void> => {
    setBusy(true);
    onToast(`Saving ${title}...`);
    try {
      const response = await fetch(`/api/admin/scene/${props.sceneId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.ok !== true) {
        onToast(`${title} save failed: ${stringValue(isRecord(payload) ? payload.error : undefined, 'unknown error')}`);
        return;
      }
      const scene = normalizeScene(props.sceneId, payload.scene);
      setSettings(scene);
      onStats({ total: 1, approved: 1, generated: scene.modelUrl ? 1 : 0, missing: 0, stale: 0 });
      onToast(`Saved ${title}. Open scenes will use the new settings on reload.`);
    } catch (error) {
      onToast(`${title} save failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const uploadModel = async (file: File): Promise<void> => {
    setBusy(true);
    onToast(`Uploading ${file.name}...`);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const response = await fetch('/api/admin/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: `${props.sceneId}-model`, dataUrl }),
      });
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.ok !== true) {
        onToast(`Model upload failed: ${stringValue(isRecord(payload) ? payload.error : undefined, 'unknown error')}`);
        return;
      }
      const url = stringValue(payload.url);
      const size = numberValue(payload.size, 0);
      setSettings((current) => ({ ...current, modelUrl: url }));
      onToast(`Uploaded ${file.name}${size ? ` (${formatBytes(size)})` : ''}. Click Save to publish it.`);
    } catch (error) {
      onToast(`Model upload failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const previewSettings = useMemo(() => ({
    ...settings,
    previewKind: props.sceneId,
  }), [props.sceneId, settings]);

  return (
    <section className="model-admin">
      <div className="model-scene">
        <div className="model-workspace__preview">
          <ThreePreviewFrame settings={previewSettings} />
        </div>
        <div className="model-editor">
          <div className="model-editor__head">
            <div>
              <p className="eyebrow">Scene editor</p>
              <h2>{props.title}</h2>
              <p>{props.copy}</p>
            </div>
            <div className="model-editor__actions">
              <a href={props.liveUrl} target="_blank" rel="noreferrer">Open live scene</a>
              <button onClick={() => void refresh()} disabled={busy}>Refresh</button>
              <button onClick={() => fileRef.current?.click()} disabled={busy}>Upload GLB</button>
              <button onClick={() => void save()} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
            </div>
          </div>

          <div className="model-editor__grid">
            <TextField label="Replacement model URL" value={settings.modelUrl} onChange={(modelUrl) => setSettings((current) => ({ ...current, modelUrl }))} />
            <ColorField label="Base color" value={settings.baseColor} onChange={(baseColor) => setSettings((current) => ({ ...current, baseColor }))} />
            <ColorField label="Emissive color" value={settings.emissiveColor} onChange={(emissiveColor) => setSettings((current) => ({ ...current, emissiveColor }))} />
            <NumberField label="Emissive" value={settings.emissiveIntensity} step={0.1} min={0} max={12} onChange={(emissiveIntensity) => setSettings((current) => ({ ...current, emissiveIntensity }))} />
            <NumberField label="Scale" value={settings.scale} step={0.05} min={0.05} onChange={(scale) => setSettings((current) => ({ ...current, scale }))} />
            <NumberField label="Position Y" value={settings.positionY} step={0.05} onChange={(positionY) => setSettings((current) => ({ ...current, positionY }))} />
            <NumberField label="Rotation Y" value={settings.rotationY} step={0.05} onChange={(rotationY) => setSettings((current) => ({ ...current, rotationY }))} />
            <NumberField label="Ambient" value={settings.ambientIntensity} step={0.05} min={0} max={5} onChange={(ambientIntensity) => setSettings((current) => ({ ...current, ambientIntensity }))} />
            <NumberField label="Key light" value={settings.keyIntensity} step={0.05} min={0} max={12} onChange={(keyIntensity) => setSettings((current) => ({ ...current, keyIntensity }))} />
            <NumberField label="Fog density" value={settings.fogDensity} step={0.0005} min={0} max={0.05} onChange={(fogDensity) => setSettings((current) => ({ ...current, fogDensity }))} />
          </div>

          <div className="model-meta">
            <span>{settings.updatedAt ? `Last saved ${settings.updatedAt}` : 'Not saved yet'}</span>
            {settings.modelUrl ? <a href={settings.modelUrl} target="_blank" rel="noreferrer">current GLB</a> : <span>using procedural scene</span>}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".glb,model/gltf-binary"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void uploadModel(file);
            }}
          />
        </div>
      </div>
    </section>
  );
}
