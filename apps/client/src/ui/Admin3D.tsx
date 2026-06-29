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

const LIVE_FALLBACK_UNIT_IDS = new Set(UNIT_SEED.map((unit) => unit.id));

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
  const kind = unit.kind.toLowerCase();
  if (unit.id === 'unit-chorus' || unit.id === 'unit-swarmer' || kind === 'monster' || kind === 'enemy') {
    return '/game?showcase=monster';
  }
  if (unit.id === 'unit-crate' || kind === 'prop') return '/lobby';
  return '/units';
}

function LivePreviewFrame(props: {
  src: string;
  title: string;
  nonce: number;
  sceneId?: SceneSettings['id'];
  settings?: SceneSettings;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const postSettings = useCallback((): void => {
    if (!props.sceneId || !props.settings) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'sl-admin-scene-preview', sceneId: props.sceneId, settings: props.settings },
      window.location.origin,
    );
  }, [props.sceneId, props.settings]);

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
  if (LIVE_FALLBACK_UNIT_IDS.has(props.unit.id)) return <span className="model-pill">live fallback</span>;
  return <span className="model-pill">missing model</span>;
}

export function UnitsAdminPanel({ onStats, onToast }: Admin3DProps) {
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<UnitDraft>(() => unitDraft(undefined));
  const [busy, setBusy] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => units.find((unit) => unit.id === selectedId) ?? units[0], [selectedId, units]);
  const selectedModelUrl = selected?.riggedUrl || selected?.glbUrl || '';
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
            <LivePreviewFrame
              src={unitPreviewUrl(selected)}
              title={selected ? `${selected.name} live preview` : 'Units live preview'}
              nonce={previewNonce}
            />
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
  const [previewNonce, setPreviewNonce] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const reloadPreview = useCallback(() => setPreviewNonce((current) => current + 1), []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/admin/scene/${props.sceneId}`, { cache: 'no-store' });
      const payload: unknown = await response.json();
      const scene = normalizeScene(props.sceneId, isRecord(payload) ? payload.scene : undefined);
      setSettings(scene);
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
