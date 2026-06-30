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
  onDirtyChange?: (dirty: boolean) => void;
}

export type ModelAdminTab = 'views' | 'units' | 'spaceship' | 'lobby';
type UnitPreviewState = 'bench' | 'idle' | 'walk' | 'run' | 'attack' | 'death';

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
  glbSize?: number;
  riggedSize?: number;
  glbUpdatedAt?: string;
  riggedUpdatedAt?: string;
  model_status?: string;
  rig_status?: string;
  adminUpdatedAt?: string;
  height?: number;
  scale?: number;
  yaw?: number;
  positionY?: number;
  colliderRadius?: number;
  colliderHeight?: number;
  materialColor?: string;
  emissiveColor?: string;
  emissiveIntensity?: number;
}

interface UnitDraft {
  name: string;
  kind: string;
  prompt: string;
  role: string;
  height: number;
  scale: number;
  yaw: number;
  positionY: number;
  colliderRadius: number;
  colliderHeight: number;
  materialEnabled: boolean;
  materialColor: string;
  emissiveEnabled: boolean;
  emissiveColor: string;
  emissiveIntensity: number;
  previewState: UnitPreviewState;
  showCollider: boolean;
  uploadAsRigged: boolean;
}

interface SceneSettings {
  id: 'spaceship' | 'lobby';
  name: string;
  modelUrl: string;
  modelSize?: number;
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

const LIVE_FALLBACK_UNIT_IDS = new Set(UNIT_SEED.map((unit) => unit.id));

const MODEL_ADMIN_TABS: Array<{ id: ModelAdminTab; label: string; copy: string }> = [
  { id: 'views', label: 'Views', copy: 'Playable routes and model viewers' },
  { id: 'units', label: 'Units', copy: 'Characters, enemies, and props' },
  { id: 'spaceship', label: 'Ship', copy: 'Exterior model and lighting' },
  { id: 'lobby', label: 'Lobby', copy: 'Room model and lighting' },
];

const SCENE_DEFAULTS: Record<SceneSettings['id'], SceneSettings> = {
  spaceship: {
    id: 'spaceship',
    name: 'Space Ship',
    modelUrl: '',
    modelSize: undefined,
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
    modelSize: undefined,
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

function optionalNumberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function colorValue(value: unknown, fallback = '#ffffff'): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
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

function formatOptionalBytes(size: number | undefined): string {
  return typeof size === 'number' && Number.isFinite(size) ? formatBytes(size) : 'no file';
}

function formatDate(value: string | undefined): string {
  if (!value) return 'not saved';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
    glbSize: optionalNumberValue(item.glbSize),
    riggedSize: optionalNumberValue(item.riggedSize),
    glbUpdatedAt: stringValue(item.glbUpdatedAt),
    riggedUpdatedAt: stringValue(item.riggedUpdatedAt),
    model_status: stringValue(item.model_status),
    rig_status: stringValue(item.rig_status),
    adminUpdatedAt: stringValue(item.adminUpdatedAt),
    height: numberValue(item.height, 1.8),
    scale: numberValue(item.scale, 1),
    yaw: numberValue(item.yaw, 0),
    positionY: numberValue(item.positionY, 0),
    colliderRadius: numberValue(item.colliderRadius, 0.35),
    colliderHeight: numberValue(item.colliderHeight, numberValue(item.height, 1.8)),
    materialColor: stringValue(item.materialColor),
    emissiveColor: stringValue(item.emissiveColor),
    emissiveIntensity: numberValue(item.emissiveIntensity, 0),
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
    positionY: unit?.positionY ?? 0,
    colliderRadius: unit?.colliderRadius ?? 0.35,
    colliderHeight: unit?.colliderHeight ?? unit?.height ?? 1.8,
    materialEnabled: Boolean(unit?.materialColor),
    materialColor: colorValue(unit?.materialColor, '#d9d3c3'),
    emissiveEnabled: Boolean(unit?.emissiveColor),
    emissiveColor: colorValue(unit?.emissiveColor, '#36e0d0'),
    emissiveIntensity: unit?.emissiveIntensity ?? 0,
    previewState: 'bench',
    showCollider: true,
    uploadAsRigged: false,
  };
}

function savedUnitDraft(unit: UnitItem | undefined): Omit<UnitDraft, 'previewState' | 'showCollider' | 'uploadAsRigged'> {
  const draft = unitDraft(unit);
  return {
    name: draft.name,
    kind: draft.kind,
    prompt: draft.prompt,
    role: draft.role,
    height: draft.height,
    scale: draft.scale,
    yaw: draft.yaw,
    positionY: draft.positionY,
    colliderRadius: draft.colliderRadius,
    colliderHeight: draft.colliderHeight,
    materialEnabled: draft.materialEnabled,
    materialColor: draft.materialColor,
    emissiveEnabled: draft.emissiveEnabled,
    emissiveColor: draft.emissiveColor,
    emissiveIntensity: draft.emissiveIntensity,
  };
}

function comparableUnitDraft(draft: UnitDraft): Omit<UnitDraft, 'previewState' | 'showCollider' | 'uploadAsRigged'> {
  return {
    name: draft.name,
    kind: draft.kind,
    prompt: draft.prompt,
    role: draft.role,
    height: draft.height,
    scale: draft.scale,
    yaw: draft.yaw,
    positionY: draft.positionY,
    colliderRadius: draft.colliderRadius,
    colliderHeight: draft.colliderHeight,
    materialEnabled: draft.materialEnabled,
    materialColor: draft.materialColor,
    emissiveEnabled: draft.emissiveEnabled,
    emissiveColor: draft.emissiveColor,
    emissiveIntensity: draft.emissiveIntensity,
  };
}

function unitIsDirty(unit: UnitItem | undefined, draft: UnitDraft): boolean {
  if (!unit) return false;
  return JSON.stringify(savedUnitDraft(unit)) !== JSON.stringify(comparableUnitDraft(draft));
}

function sceneIsDirty(settings: SceneSettings, saved: SceneSettings): boolean {
  const strip = (scene: SceneSettings) => ({
    modelUrl: scene.modelUrl,
    baseColor: scene.baseColor,
    emissiveColor: scene.emissiveColor,
    emissiveIntensity: scene.emissiveIntensity,
    scale: scene.scale,
    positionY: scene.positionY,
    rotationY: scene.rotationY,
    ambientIntensity: scene.ambientIntensity,
    keyIntensity: scene.keyIntensity,
    fogDensity: scene.fogDensity,
  });
  return JSON.stringify(strip(settings)) !== JSON.stringify(strip(saved));
}

function normalizeScene(id: SceneSettings['id'], item: unknown): SceneSettings {
  const base = SCENE_DEFAULTS[id];
  if (!isRecord(item)) return base;
  return {
    ...base,
    modelUrl: assetUrl(stringValue(item.modelUrl, base.modelUrl)),
    modelSize: optionalNumberValue(item.modelSize),
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

function unitModelSize(unit: UnitItem): number | undefined {
  return unit.riggedSize ?? unit.glbSize;
}

function unitModelUpdatedAt(unit: UnitItem): string | undefined {
  return unit.riggedUpdatedAt || unit.glbUpdatedAt || unit.adminUpdatedAt;
}

function unitSceneLabel(unit: UnitItem): string {
  const kind = unit.kind.toLowerCase();
  if (unit.riggedUrl || unit.glbUrl) return '/model';
  if (unit.id === 'unit-chorus' || unit.id === 'unit-swarmer' || kind === 'monster' || kind === 'enemy') return '/game monster showcase';
  if (unit.id === 'unit-crate' || kind === 'prop') return '/lobby props';
  return '/units crew bench';
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

function appendPreviewNonce(src: string, nonce: number): string {
  const hashIndex = src.indexOf('#');
  const base = hashIndex >= 0 ? src.slice(0, hashIndex) : src;
  const hash = hashIndex >= 0 ? src.slice(hashIndex) : '';
  return `${base}${base.includes('?') ? '&' : '?'}adminPreview=${nonce}${hash}`;
}

function unitPreviewUrl(unit: UnitItem | undefined): string {
  if (!unit) return '/units';
  const modelUrl = unit.riggedUrl || unit.glbUrl;
  if (modelUrl) return `/model?id=${encodeURIComponent(unit.id)}${unit.riggedUrl ? '&rig=1' : ''}`;
  const adminUnit = encodeURIComponent(unit.id);
  const kind = unit.kind.toLowerCase();
  if (unit.id === 'unit-chorus' || unit.id === 'unit-swarmer' || kind === 'monster' || kind === 'enemy') {
    return `/game?showcase=monster&adminUnit=${adminUnit}`;
  }
  if (unit.id === 'unit-crate' || kind === 'prop') return `/lobby?adminUnit=${adminUnit}`;
  return `/units?adminUnit=${adminUnit}`;
}

interface PlayableScene {
  id: string;
  name: string;
  group: string;
  path: string;
  description: string;
}

const PLAYABLE_SCENES: PlayableScene[] = [
  { id: 'lobby', name: 'Lobby', group: 'Run', path: '/lobby', description: 'Departure room, crew lineup, props, and mission start.' },
  { id: 'full-loop', name: 'Full loop', group: 'Run', path: '/lobby?flow=1&auto=1', description: 'Lobby into launch, docking, and ship entry.' },
  { id: 'launch', name: 'Capsule', group: 'Run', path: '/launch', description: 'Capsule launch and transit sequence.' },
  { id: 'pad', name: 'Launch pad', group: 'Run', path: '/pad', description: 'Exterior rocket, pad lighting, storm, and liftoff framing.' },
  { id: 'dock', name: 'Docking', group: 'Run', path: '/dock', description: 'Manual docking approach and collar feedback.' },
  { id: 'ship', name: 'Space ship', group: 'Scenes', path: '/exterior', description: 'Derelict exterior read, silhouette, and lighting.' },
  { id: 'crew', name: 'Crew', group: 'Views', path: '/units', description: 'Crew bench and readable player silhouettes.' },
  { id: 'props', name: 'Props', group: 'Views', path: '/lobby?adminUnit=unit-crate', description: 'Prop pass inside the lobby context.' },
  { id: 'monsters', name: 'Monsters', group: 'Views', path: '/game?showcase=monster&adminUnit=unit-chorus', description: 'THE CHORUS and enemy showcase in playable context.' },
  { id: 'astronaut-model', name: 'Astronaut GLB', group: 'Models', path: '/model?src=/models/player-astronaut.glb&id=unit-crew', description: 'Bundled rescue astronaut in the 3D unit viewer.' },
  { id: 'alien-model', name: 'Alien GLB', group: 'Models', path: '/model?src=/models/alien2.glb&id=unit-chorus', description: 'Bundled creature model in the 3D unit viewer.' },
];

function playableSceneUrl(path: string): string {
  const override = import.meta.env.VITE_LOOKDEV_DEMO_URL;
  if (override) {
    try {
      return new URL(path, override).toString();
    } catch {
      // Fall back to the standard local/prod route below.
    }
  }
  if (typeof window === 'undefined') return path;
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const port = window.location.port;
  if ((host === 'localhost' || host === '127.0.0.1') && port === '5180') return `http://127.0.0.1:8173${path}`;
  return new URL(path, window.location.origin).toString();
}

function LivePreviewFrame(props: {
  src: string;
  title: string;
  nonce: number;
  sceneId?: SceneSettings['id'];
  settings?: SceneSettings;
  unitId?: string;
  unitSettings?: UnitDraft;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const postSettings = useCallback((): void => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    if (props.sceneId && props.settings) {
      target.postMessage(
        { type: 'sl-admin-scene-preview', sceneId: props.sceneId, settings: props.settings },
        window.location.origin,
      );
    }
    if (props.unitId && props.unitSettings) {
      target.postMessage(
        { type: 'sl-admin-unit-preview', unitId: props.unitId, settings: props.unitSettings },
        window.location.origin,
      );
    }
  }, [props.sceneId, props.settings, props.unitId, props.unitSettings]);

  useEffect(() => {
    postSettings();
  }, [postSettings]);

  return (
    <iframe
      ref={iframeRef}
      className="model-preview-frame"
      title={props.title}
      src={appendPreviewNonce(props.src, props.nonce)}
      allow="autoplay; fullscreen"
      onLoad={postSettings}
    />
  );
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

function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="model-field">
      <span>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value as T)}>
        {props.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
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

function UnitThumbnail({ unit }: { unit: UnitItem }) {
  const image = unit.frontUrl || unit.sideUrl || unit.backUrl;
  return (
    <span className="model-thumb" aria-hidden="true">
      {image ? <img src={image} alt="" /> : <span>{unit.name.slice(0, 2).toUpperCase()}</span>}
    </span>
  );
}

function ModelStatusPill(props: { unit: UnitItem }) {
  if (props.unit.riggedUrl) return <span className="model-pill model-pill--ready">rigged model</span>;
  if (props.unit.glbUrl) return <span className="model-pill model-pill--ready">model ready</span>;
  if (props.unit.model_status === 'running' || props.unit.rig_status === 'running') return <span className="model-pill model-pill--work">building</span>;
  if (LIVE_FALLBACK_UNIT_IDS.has(props.unit.id)) return <span className="model-pill">live fallback</span>;
  return <span className="model-pill">missing model</span>;
}

function SceneOverviewCard(props: {
  scene: SceneSettings;
  liveUrl: string;
  usedIn: string;
  onOpen?: (tab: ModelAdminTab) => void;
}) {
  return (
    <article className="model-overview-card">
      <div className="model-overview-card__preview">
        <iframe title={`${props.scene.name} overview`} src={props.liveUrl} />
      </div>
      <div className="model-overview-card__body">
        <div>
          <p className="eyebrow">Scene</p>
          <h2>{props.scene.name}</h2>
        </div>
        <div className="model-overview-card__meta">
          <span>Used in {props.usedIn}</span>
          <span>{props.scene.modelUrl ? 'Replacement GLB' : 'Procedural scene'}</span>
          <span>{formatOptionalBytes(props.scene.modelSize)}</span>
          <span>{formatDate(props.scene.updatedAt)}</span>
        </div>
        <button onClick={() => props.onOpen?.(props.scene.id)}>Open editor</button>
      </div>
    </article>
  );
}

function UnitOverviewCard({ unit, onOpen }: { unit: UnitItem; onOpen?: (tab: ModelAdminTab) => void }) {
  return (
    <article className="model-overview-card">
      <div className="model-overview-card__preview model-overview-card__preview--unit">
        <UnitThumbnail unit={unit} />
      </div>
      <div className="model-overview-card__body">
        <div>
          <p className="eyebrow">{unit.kind}</p>
          <h2>{unit.name}</h2>
        </div>
        <div className="model-overview-card__meta">
          <span>{unit.id}</span>
          <span>{unitSceneLabel(unit)}</span>
          <span>{readyUnit(unit) ? 'GLB ready' : 'Missing GLB'}</span>
          <span>{formatOptionalBytes(unitModelSize(unit))}</span>
          <span>{formatDate(unitModelUpdatedAt(unit))}</span>
        </div>
        <button onClick={() => onOpen?.('units')}>Open units</button>
      </div>
    </article>
  );
}

export function Admin3DOverviewPanel(props: Admin3DProps) {
  const { onStats, onToast, onDirtyChange } = props;
  const [activeTab, setActiveTab] = useState<ModelAdminTab>('views');
  const [dirty, setDirty] = useState(false);
  const [overviewUnits, setOverviewUnits] = useState<UnitItem[]>(() => mergeUnits([]));
  const [overviewScenes, setOverviewScenes] = useState<Record<SceneSettings['id'], SceneSettings>>(() => ({
    spaceship: SCENE_DEFAULTS.spaceship,
    lobby: SCENE_DEFAULTS.lobby,
  }));
  const [selectedSceneId, setSelectedSceneId] = useState('lobby');
  const [previewNonce, setPreviewNonce] = useState(0);
  const sceneGroups = useMemo(() => {
    const map = new Map<string, PlayableScene[]>();
    for (const scene of PLAYABLE_SCENES) map.set(scene.group, [...(map.get(scene.group) ?? []), scene]);
    return [...map.entries()];
  }, []);
  const selectedScene = PLAYABLE_SCENES.find((scene) => scene.id === selectedSceneId) ?? PLAYABLE_SCENES[0];
  const selectedUrl = selectedScene ? playableSceneUrl(selectedScene.path) : '/';
  const viewStats = useMemo<PanelStats>(() => {
    const scenes = Object.values(overviewScenes);
    const readyUnits = overviewUnits.filter((unit) => readyUnit(unit) || LIVE_FALLBACK_UNIT_IDS.has(unit.id)).length;
    const running = overviewUnits.filter((unit) => unit.model_status === 'running' || unit.rig_status === 'running').length;
    return {
      total: PLAYABLE_SCENES.length + overviewUnits.length + scenes.length,
      approved: PLAYABLE_SCENES.length + readyUnits + scenes.length,
      generated: overviewUnits.filter(readyUnit).length + scenes.filter((scene) => scene.modelUrl).length,
      missing: overviewUnits.length - readyUnits,
      stale: running,
    };
  }, [overviewScenes, overviewUnits]);

  const handleDirtyChange = useCallback((nextDirty: boolean): void => {
    setDirty(nextDirty);
    onDirtyChange?.(nextDirty);
  }, [onDirtyChange]);

  const requestWorkspaceTab = useCallback((nextTab: ModelAdminTab): void => {
    if (nextTab === activeTab) return;
    if (dirty && !window.confirm('Discard unsaved 3D changes?')) return;
    setActiveTab(nextTab);
  }, [activeTab, dirty]);

  useEffect(() => {
    let cancelled = false;
    const refreshOverview = async (): Promise<void> => {
      try {
        const [unitsResponse, spaceshipResponse, lobbyResponse] = await Promise.all([
          fetch('/api/units', { cache: 'no-store' }),
          fetch('/api/admin/scene/spaceship', { cache: 'no-store' }),
          fetch('/api/admin/scene/lobby', { cache: 'no-store' }),
        ]);
        const [unitsPayload, spaceshipPayload, lobbyPayload]: unknown[] = await Promise.all([
          unitsResponse.json(),
          spaceshipResponse.json(),
          lobbyResponse.json(),
        ]);
        if (cancelled) return;
        const unitItems = isRecord(unitsPayload) && Array.isArray(unitsPayload.items) ? unitsPayload.items : [];
        setOverviewUnits(mergeUnits(unitItems));
        setOverviewScenes({
          spaceship: normalizeScene('spaceship', isRecord(spaceshipPayload) ? spaceshipPayload.scene : undefined),
          lobby: normalizeScene('lobby', isRecord(lobbyPayload) ? lobbyPayload.scene : undefined),
        });
      } catch (error) {
        if (!cancelled) onToast(`3D manifest unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    };
    void refreshOverview();
    return () => {
      cancelled = true;
    };
  }, [onToast]);

  useEffect(() => {
    if (activeTab === 'views') onStats(viewStats);
  }, [activeTab, onStats, viewStats]);

  useEffect(() => {
    handleDirtyChange(false);
  }, [handleDirtyChange]);

  const readyUnitCount = overviewUnits.filter(readyUnit).length;

  return (
    <section className="model-admin model-admin--console">
      <div className="model-admin-toolbar" aria-label="3D workspace">
        <div>
          <p className="eyebrow">3D workspace</p>
          <h2>{MODEL_ADMIN_TABS.find((item) => item.id === activeTab)?.label ?? 'Views'}</h2>
          <p>{MODEL_ADMIN_TABS.find((item) => item.id === activeTab)?.copy}</p>
        </div>
        <div className="model-admin-tabs" role="tablist" aria-label="3D admin sections">
          {MODEL_ADMIN_TABS.map((item) => (
            <button
              aria-selected={activeTab === item.id}
              className={activeTab === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => requestWorkspaceTab(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'views' ? (
        <section className="model-scene-browser">
          <aside className="model-scene-menu" aria-label="Playable scenes">
            <div className="model-scene-menu__head">
              <p className="eyebrow">Live preview</p>
              <h2>Views</h2>
              <p>Open the same routes, fallbacks, and model viewers that the playable build uses.</p>
            </div>

            <div className="model-scene-menu__stats">
              <span><strong>{PLAYABLE_SCENES.length}</strong> routes</span>
              <span><strong>{overviewUnits.length}</strong> units</span>
              <span><strong>{readyUnitCount}</strong> GLBs</span>
            </div>

            <div className="model-scene-nav">
              {sceneGroups.map(([group, scenes]) => (
                <div className="model-scene-nav__group" key={group}>
                  <span>{group}</span>
                  {scenes.map((scene) => (
                    <button
                      className={scene.id === selectedScene?.id ? 'active' : ''}
                      key={scene.id}
                      onClick={() => {
                        setSelectedSceneId(scene.id);
                        setPreviewNonce((current) => current + 1);
                      }}
                      type="button"
                    >
                      <strong>{scene.name}</strong>
                      <small>{scene.description}</small>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="model-scene-menu__quick">
              <button type="button" onClick={() => requestWorkspaceTab('units')}>Unit editor</button>
              <button type="button" onClick={() => requestWorkspaceTab('spaceship')}>Ship editor</button>
              <button type="button" onClick={() => requestWorkspaceTab('lobby')}>Lobby editor</button>
            </div>
          </aside>

          {selectedScene ? (
            <section className="model-scene-player">
              <div className="model-scene-player__head">
                <div>
                  <p className="eyebrow">{selectedScene.group}</p>
                  <h2>{selectedScene.name}</h2>
                  <p>{selectedScene.description}</p>
                </div>
                <div className="model-editor__actions">
                  <button onClick={() => setPreviewNonce((current) => current + 1)}>Reload</button>
                  <a href={selectedUrl} target="_blank" rel="noreferrer">Open full</a>
                </div>
              </div>

              <div className="model-scene-player__meta">
                <span>{selectedScene.group}</span>
                <span>{selectedScene.path}</span>
                <span>{selectedUrl.replace(window.location.origin, '')}</span>
              </div>

              <div className="model-scene-frame">
                <iframe
                  key={`${selectedScene.id}-${previewNonce}`}
                  title={`${selectedScene.name} playable preview`}
                  src={selectedUrl}
                  allow="autoplay; fullscreen"
                />
              </div>
            </section>
          ) : (
            <section className="admin-empty">No 3D scenes are configured.</section>
          )}
        </section>
      ) : activeTab === 'units' ? (
        <UnitsAdminPanel onStats={onStats} onToast={onToast} onDirtyChange={handleDirtyChange} />
      ) : activeTab === 'spaceship' ? (
        <SceneAdminPanel
          onStats={onStats}
          onToast={onToast}
          onDirtyChange={handleDirtyChange}
          sceneId="spaceship"
          title={overviewScenes.spaceship.name}
          copy="Tune the derelict exterior replacement GLB, material tint, fog, and lighting while previewing the live exterior scene."
          liveUrl={playableSceneUrl('/exterior')}
        />
      ) : (
        <SceneAdminPanel
          onStats={onStats}
          onToast={onToast}
          onDirtyChange={handleDirtyChange}
          sceneId="lobby"
          title={overviewScenes.lobby.name}
          copy="Tune the lobby replacement GLB, material tint, fog, and lighting while previewing the live lobby scene."
          liveUrl={playableSceneUrl('/lobby')}
        />
      )}
    </section>
  );
}

export function UnitsAdminPanel({ onStats, onToast, onDirtyChange }: Admin3DProps) {
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<UnitDraft>(() => unitDraft(undefined));
  const [busy, setBusy] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => units.find((unit) => unit.id === selectedId) ?? units[0], [selectedId, units]);
  const selectedModelUrl = selected?.riggedUrl || selected?.glbUrl || '';
  const dirty = useMemo(() => unitIsDirty(selected, draft), [draft, selected]);
  const reloadPreview = useCallback(() => setPreviewNonce((current) => current + 1), []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/units', { cache: 'no-store' });
      const payload: unknown = await response.json();
      const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
      const merged = mergeUnits(items);
      setUnits(merged);
      onStats(previewStats(merged));
      if (!selectedId && merged[0]) setSelectedId(merged[0].id);
      reloadPreview();
    } catch (error) {
      const fallback = mergeUnits([]);
      setUnits(fallback);
      onStats(previewStats(fallback));
      onToast(`Units endpoint unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }, [onStats, onToast, reloadPreview, selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setDraft(unitDraft(selected));
  }, [selected]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const selectUnit = (unitId: string): void => {
    if (unitId === selected?.id) return;
    if (dirty && !window.confirm('Discard unsaved unit changes?')) return;
    setSelectedId(unitId);
  };

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
      reloadPreview();
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
      reloadPreview();
    } catch (error) {
      onToast(`GLB upload failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

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
              onClick={() => selectUnit(unit.id)}
            >
              <UnitThumbnail unit={unit} />
              <span className="model-list__copy">
                <strong>{unit.name}</strong>
                <span>{unit.id}</span>
                <ModelStatusPill unit={unit} />
              </span>
            </button>
          ))}
        </aside>

        <div className="model-workspace">
          <div className="model-workspace__preview">
            <LivePreviewFrame
              src={unitPreviewUrl(selected)}
              title={selected ? `${selected.name} live preview` : 'Units live preview'}
              nonce={previewNonce}
              unitId={selected?.id}
              unitSettings={draft}
            />
          </div>
          {selected ? (
            <div className="model-editor">
              <div className="model-editor__head">
                <div>
                  <p className="eyebrow">Unit editor</p>
                  <h2>{selected.name}{dirty ? <span className="model-dirty">Unsaved</span> : null}</h2>
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
                <NumberField label="Model scale" value={draft.scale} step={0.05} min={0.05} onChange={(scale) => setDraft((current) => ({ ...current, scale }))} />
                <NumberField label="Yaw" value={draft.yaw} step={0.05} onChange={(yaw) => setDraft((current) => ({ ...current, yaw }))} />
                <NumberField label="Position Y" value={draft.positionY} step={0.05} onChange={(positionY) => setDraft((current) => ({ ...current, positionY }))} />
                <NumberField label="Collider radius" value={draft.colliderRadius} step={0.05} min={0.01} onChange={(colliderRadius) => setDraft((current) => ({ ...current, colliderRadius }))} />
                <NumberField label="Collider height" value={draft.colliderHeight} step={0.05} min={0.01} onChange={(colliderHeight) => setDraft((current) => ({ ...current, colliderHeight }))} />
                <SelectField<UnitPreviewState>
                  label="Animation preview"
                  value={draft.previewState}
                  options={[
                    { value: 'bench', label: 'Bench mix' },
                    { value: 'idle', label: 'Idle' },
                    { value: 'walk', label: 'Walk' },
                    { value: 'run', label: 'Run' },
                    { value: 'attack', label: 'Attack' },
                    { value: 'death', label: 'Death' },
                  ]}
                  onChange={(previewState) => setDraft((current) => ({ ...current, previewState }))}
                />
                <label className="model-field model-field--check">
                  <input type="checkbox" checked={draft.showCollider} onChange={(event) => setDraft((current) => ({ ...current, showCollider: event.target.checked }))} />
                  <span>Show collider overlay</span>
                </label>
                <label className="model-field model-field--check">
                  <input type="checkbox" checked={draft.materialEnabled} onChange={(event) => setDraft((current) => ({ ...current, materialEnabled: event.target.checked }))} />
                  <span>Apply material tint</span>
                </label>
                <ColorField label="Material tint" value={draft.materialColor} onChange={(materialColor) => setDraft((current) => ({ ...current, materialColor, materialEnabled: true }))} />
                <label className="model-field model-field--check">
                  <input type="checkbox" checked={draft.emissiveEnabled} onChange={(event) => setDraft((current) => ({ ...current, emissiveEnabled: event.target.checked }))} />
                  <span>Apply emissive tint</span>
                </label>
                <ColorField label="Emissive tint" value={draft.emissiveColor} onChange={(emissiveColor) => setDraft((current) => ({ ...current, emissiveColor, emissiveEnabled: true }))} />
                <NumberField label="Emissive power" value={draft.emissiveIntensity} step={0.1} min={0} max={8} onChange={(emissiveIntensity) => setDraft((current) => ({ ...current, emissiveIntensity, emissiveEnabled: true }))} />
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
                <span>{formatOptionalBytes(unitModelSize(selected))}</span>
                <span>{formatDate(unitModelUpdatedAt(selected))}</span>
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
  const { onStats, onToast, onDirtyChange, sceneId, title } = props;
  const [settings, setSettings] = useState<SceneSettings>(() => SCENE_DEFAULTS[props.sceneId]);
  const [savedSettings, setSavedSettings] = useState<SceneSettings>(() => SCENE_DEFAULTS[props.sceneId]);
  const [busy, setBusy] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = useMemo(() => sceneIsDirty(settings, savedSettings), [settings, savedSettings]);
  const reloadPreview = useCallback(() => setPreviewNonce((current) => current + 1), []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/admin/scene/${props.sceneId}`, { cache: 'no-store' });
      const payload: unknown = await response.json();
      const scene = normalizeScene(props.sceneId, isRecord(payload) ? payload.scene : undefined);
      setSettings(scene);
      setSavedSettings(scene);
      reloadPreview();
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
  }, [onStats, onToast, props.sceneId, reloadPreview, title]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

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
      setSavedSettings(scene);
      reloadPreview();
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

  return (
    <section className="model-admin">
      <div className="model-scene">
        <div className="model-workspace__preview">
          <LivePreviewFrame
            src={props.liveUrl}
            title={`${props.title} live preview`}
            nonce={previewNonce}
            sceneId={sceneId}
            settings={settings}
          />
        </div>
        <div className="model-editor">
          <div className="model-editor__head">
            <div>
              <p className="eyebrow">Scene editor</p>
              <h2>{props.title}{dirty ? <span className="model-dirty">Unsaved</span> : null}</h2>
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
