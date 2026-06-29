import { useCallback, useEffect, useMemo, useState } from 'react';
import heroImage from '../assets/signal-lost-hero.png';

type AdminTab = 'audio' | 'image';
type AssetStatus = 'approved' | 'generated' | 'missing' | 'stale';
type AssetUse = 'landing' | 'game' | 'shared' | 'admin';

interface BaseAsset {
  id: string;
  name: string;
  group: string;
  status: AssetStatus;
  use: AssetUse;
  prompt: string;
  file?: string;
  size?: number;
  createdAt?: string;
}

interface AudioAsset extends BaseAsset {
  kind: 'music' | 'sound' | 'voice';
  duration: string;
  voice?: string;
}

interface ImageAsset extends BaseAsset {
  kind: 'landing' | 'scene' | 'character' | 'item' | 'ui';
  ratio: string;
  preview?: string;
}

interface ManifestItem {
  id: string;
  file: string;
  media: AdminTab;
  kind?: string;
  prompt?: string;
  size?: number;
  createdAt?: string;
}

interface VoiceOption {
  voice_id: string;
  name: string;
}

const AUDIO_ASSETS: AudioAsset[] = [
  { id: 'mus-menu', name: 'Title Theme', kind: 'music', group: 'Music', status: 'missing', use: 'landing', duration: '0:30', prompt: 'Slow cold ominous title drone with a distant mournful melody, dread and loneliness.' },
  { id: 'mus-launch', name: 'Launch Cinematic', kind: 'music', group: 'Music', status: 'missing', use: 'game', duration: '0:35', prompt: 'Grim militaristic build for the ground launch, low pulses and dark strings rising toward liftoff.' },
  { id: 'mus-transit', name: 'Transit To The Derelict', kind: 'music', group: 'Music', status: 'missing', use: 'game', duration: '0:40', prompt: 'Sparse cold weightless ambient with creeping unease and a faint wrong note.' },
  { id: 'mus-explore', name: 'Exploration Dread Bed', kind: 'music', group: 'Music', status: 'missing', use: 'game', duration: '0:40', prompt: 'Dark ambient horror underscore for derelict exploration: drones, metallic texture, no drums.' },
  { id: 'mus-combat', name: 'Combat Tension', kind: 'music', group: 'Music', status: 'missing', use: 'game', duration: '0:30', prompt: 'Rising horror combat music with low percussion, dissonant strings, panic and momentum.' },
  { id: 'mus-stinger', name: 'Jump Scare Stinger', kind: 'music', group: 'Music', status: 'missing', use: 'game', duration: '0:05', prompt: 'Sharp sudden dissonant horror hit, then silence.' },
  { id: 'mus-safe', name: 'Safe Room Respite', kind: 'music', group: 'Music', status: 'missing', use: 'game', duration: '0:25', prompt: 'Fragile warm melancholy ambient pad, exhausted relief that never fully relaxes.' },
  { id: 'mus-climax', name: 'COMMS Restore Climax', kind: 'music', group: 'Music', status: 'missing', use: 'game', duration: '0:35', prompt: 'Desperate bittersweet swell as the long-lost signal reaches home.' },
  { id: 'pad-rain', name: 'Pad Rain Bed', kind: 'sound', group: 'Launch SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Heavy cold rain drumming on a concrete launch pad and steel gantry, loopable.' },
  { id: 'pad-ignition', name: 'Rocket Ignition', kind: 'sound', group: 'Launch SFX', status: 'missing', use: 'game', duration: '0:04', prompt: 'Rocket main engines ignite: deep concussive whoomph into a crackling roar.' },
  { id: 'cabin-drone', name: 'Capsule Power Drone', kind: 'sound', group: 'Capsule SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Low life-support drone, ticking electronics, quietly claustrophobic.' },
  { id: 'transit-carrier', name: 'Wrong Carrier Signal', kind: 'sound', group: 'Capsule SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Alien carrier tone from deep space with a voice-like undertone hidden inside it.' },
  { id: 'dock-clamp', name: 'Docking Clamps', kind: 'sound', group: 'Docking SFX', status: 'missing', use: 'game', duration: '0:03', prompt: 'Heavy docking clamps locking onto a capsule: metallic clunks and servo whine.' },
  { id: 'amb-corridor', name: 'Corridor Ambience', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Derelict corridor ambience: hull groans, metal creaks, ventilation hiss.' },
  { id: 'sfx-flashlight', name: 'Flashlight Click', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: '0:01', prompt: 'Tactile flashlight switch click, dry and mechanical.' },
  { id: 'sfx-door', name: 'Bulkhead Slam', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: '0:02', prompt: 'Heavy metal bulkhead slamming shut and echoing in a steel corridor.' },
  { id: 'crt-call', name: 'CHORUS Throat Call', kind: 'sound', group: 'Creature SFX', status: 'missing', use: 'game', duration: '0:04', prompt: 'Wet guttural alien resonance mimicking a distorted human voice, not a roar.' },
  { id: 'crt-shriek', name: 'CHORUS Attack Shriek', kind: 'sound', group: 'Creature SFX', status: 'missing', use: 'game', duration: '0:03', prompt: 'Piercing creature shriek layered with broken fragments of human speech.' },
  { id: 'sfx-ui-confirm', name: 'UI Confirm', kind: 'sound', group: 'Interface SFX', status: 'missing', use: 'shared', duration: '0:01', prompt: 'Soft retro sci-fi interface confirmation beep.' },
  { id: 'voice-vesta', name: 'VESTA Voice Design', kind: 'voice', group: 'Voices', status: 'missing', use: 'game', duration: 'voice', voice: 'VESTA', prompt: 'Calm female spaceship AI, clinical and measured, faint synthetic artifact, never emotional.' },
  { id: 'voice-control', name: 'Earth Control Voice Design', kind: 'voice', group: 'Voices', status: 'missing', use: 'game', duration: 'voice', voice: 'Earth Control', prompt: 'Clipped tense military mission-control officer over crackling long-range radio.' },
  { id: 'voice-chorus', name: 'THE CHORUS Voice Design', kind: 'voice', group: 'Voices', status: 'missing', use: 'game', duration: 'voice', voice: 'The Chorus', prompt: 'Almost human but subtly wrong, hollow and cold, layered with a faint second voice.' },
  { id: 'vox-control-brief', name: 'Earth Control Briefing', kind: 'voice', group: 'Spoken Text', status: 'missing', use: 'game', duration: 'line', voice: 'Earth Control', prompt: '[clipped, radio static] Capsule, this is Control. Mission is contact and recovery. Bring her voice back.' },
  { id: 'vox-vesta-signal', name: 'VESTA Signal Correction', kind: 'voice', group: 'Spoken Text', status: 'missing', use: 'game', duration: 'line', voice: 'VESTA', prompt: '[calm] Correction. One signal active. [pause] It is not on our manifest.' },
  { id: 'vox-distress', name: 'Captain Distress Log', kind: 'voice', group: 'Spoken Text', status: 'missing', use: 'game', duration: 'line', voice: 'Captain', prompt: '[shaky breath] If anyone receives this... do not dock. It learns your voice.' },
  { id: 'vox-chorus-lure', name: 'CHORUS Lure', kind: 'voice', group: 'Spoken Text', status: 'missing', use: 'game', duration: 'line', voice: 'The Chorus', prompt: '[hollow] I am the rescue you called for. Restore the signal. Open the channel.' },
];

const IMAGE_ASSETS: ImageAsset[] = [
  { id: 'landing-hero', name: 'Landing Page Hero', kind: 'landing', group: 'Landing Page', status: 'approved', use: 'landing', ratio: '21:9', preview: heroImage, file: 'apps/client/src/assets/signal-lost-hero.png', prompt: 'Four salvage astronauts sprint through a derelict corridor while The Chorus emerges behind them.' },
  { id: 'landing-social-card', name: 'Social Share Card', kind: 'landing', group: 'Landing Page', status: 'missing', use: 'landing', ratio: '1.91:1', prompt: 'Readable SIGNAL LOST social card using the hero key art, no tiny text, strong monster silhouette.' },
  { id: 'landing-key-art-clean', name: 'Clean Key Art', kind: 'landing', group: 'Landing Page', status: 'missing', use: 'landing', ratio: '16:9', prompt: 'Key art without overlaid UI, suitable for store capsules and trailers.' },
  { id: 'capsule-cockpit', name: 'Capsule Cockpit Plate', kind: 'scene', group: 'Cold Open', status: 'missing', use: 'game', ratio: '16:9', prompt: 'Low-poly cramped capsule cockpit, four seats, rain-streaked launch pad through the window.' },
  { id: 'launch-pad', name: 'Launch Pad Concept', kind: 'scene', group: 'Cold Open', status: 'missing', use: 'game', ratio: '21:9', prompt: 'Overcast industrial night launch pad, patched rocket, floodlights, steam and rain.' },
  { id: 'docking-berth', name: 'Docking Berth Concept', kind: 'scene', group: 'Cold Open', status: 'stale', use: 'game', ratio: '16:9', prompt: 'Derelict docking collar with guidance funnel, hazard chevrons, orange approach ladder lights.' },
  { id: 'hauler-corridor', name: 'Hauler Corridor Target', kind: 'scene', group: 'Ship Interior', status: 'missing', use: 'game', ratio: '16:9', prompt: 'Near-black cargo-hauler corridor, flashlight cone, wet floor, story decal, low-poly PS1 register.' },
  { id: 'command-centre', name: 'Command Centre Target', kind: 'scene', group: 'Ship Interior', status: 'missing', use: 'game', ratio: '21:9', prompt: 'COMMS restore room, broken transmitter array, CRT glow, cables, escalating bioluminescent infection.' },
  { id: 'chorus-creature-ref', name: 'THE CHORUS Creature Sheet', kind: 'character', group: 'Characters', status: 'missing', use: 'game', ratio: '4:3', prompt: 'Mixed-hybrid creature sheet: wet chitin, eyeless head, bioluminescent throat, readable silhouette.' },
  { id: 'vesta-avatar', name: 'VESTA Admin Avatar', kind: 'ui', group: 'Interface', status: 'missing', use: 'admin', ratio: '1:1', prompt: 'Minimal abstract ship-AI avatar for VESTA, cyan signal glyph, no face, diegetic console style.' },
  { id: 'flashlight-icon', name: 'Flashlight Item Icon', kind: 'item', group: 'Items', status: 'missing', use: 'game', ratio: '1:1', prompt: 'Chunky low-poly flashlight item icon, transparent-ready silhouette, amber label strip.' },
  { id: 'battery-icon', name: 'Battery Pack Icon', kind: 'item', group: 'Items', status: 'missing', use: 'game', ratio: '1:1', prompt: 'Oversized salvage battery pack icon, comedic heavy shape, hazard stripes, readable at HUD size.' },
  { id: 'room-code-thumb', name: 'Room Code Panel Thumbnail', kind: 'ui', group: 'Interface', status: 'missing', use: 'shared', ratio: '16:9', prompt: 'Diegetic capsule lobby room-code display, green CRT numerals, dark metal frame.' },
  { id: 'crew-portrait-set', name: 'Crew Portrait Set', kind: 'character', group: 'Characters', status: 'missing', use: 'game', ratio: '1:1', prompt: 'Four underpaid salvage contractors in low-poly suits, readable helmet colors, funny-scary tone.' },
];

const STATUS_LABEL: Record<AssetStatus, string> = {
  approved: 'approved',
  generated: 'generated',
  missing: 'missing',
  stale: 'stale',
};

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'webm']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function extensionOf(file: string): string {
  return file.split('?')[0]?.split('.').pop()?.toLowerCase() ?? '';
}

function idFromFile(file: string): string {
  const name = file.split('?')[0]?.split('/').pop() ?? file;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function mediaFromManifest(file: string, kind?: string): AdminTab | undefined {
  const ext = extensionOf(file);
  const normalizedKind = kind?.toLowerCase() ?? '';
  if (AUDIO_EXTENSIONS.has(ext) || /audio|music|voice|sfx|sound/.test(normalizedKind)) return 'audio';
  if (IMAGE_EXTENSIONS.has(ext) || /image|scene|character|item|ui|landing/.test(normalizedKind)) return 'image';
  return undefined;
}

function assetUrl(file: string): string {
  if (/^(https?:|data:|blob:|\/)/.test(file)) return file;
  return `/${file}`;
}

function normalizeManifestItems(payload: unknown): ManifestItem[] {
  const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
  const normalized: ManifestItem[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const file = stringValue(item.file);
    if (!file) continue;
    const kind = stringValue(item.kind) ?? stringValue(item.category);
    const media = mediaFromManifest(file, kind);
    if (!media) continue;
    normalized.push({
      id: stringValue(item.id) ?? idFromFile(file),
      file: assetUrl(file),
      media,
      kind,
      prompt: stringValue(item.prompt),
      size: numberValue(item.size),
      createdAt: stringValue(item.createdAt) ?? stringValue(item.created_at) ?? stringValue(item.updatedAt),
    });
  }
  return normalized.sort((a, b) => a.id.localeCompare(b.id));
}

function titleFromId(id: string): string {
  return id
    .replace(/^voice:/, 'voice-')
    .split(/[-_:]+/)
    .filter(Boolean)
    .map((word) => word.length <= 3 ? word.toUpperCase() : word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

function audioKind(item: ManifestItem): AudioAsset['kind'] {
  const value = `${item.kind ?? ''} ${item.id}`.toLowerCase();
  if (value.includes('music') || value.startsWith('mus-')) return 'music';
  if (value.includes('voice') || value.includes('vox-')) return 'voice';
  return 'sound';
}

function imageKind(item: ManifestItem): ImageAsset['kind'] {
  const value = `${item.kind ?? ''} ${item.id}`.toLowerCase();
  if (value.includes('landing')) return 'landing';
  if (value.includes('character') || value.includes('crew') || value.includes('portrait')) return 'character';
  if (value.includes('item') || value.includes('icon')) return 'item';
  if (value.includes('ui') || value.includes('thumb')) return 'ui';
  return 'scene';
}

function mergeAudioAssets(catalog: AudioAsset[], manifest: ManifestItem[]): AudioAsset[] {
  const audioItems = manifest.filter((item) => item.media === 'audio');
  const byId = new Map(audioItems.map((item) => [item.id, item]));
  const used = new Set<string>();
  const merged = catalog.map<AudioAsset>((asset) => {
    const item = byId.get(asset.id);
    if (!item) return asset;
    used.add(item.id);
    return {
      ...asset,
      status: asset.status === 'approved' ? asset.status : 'generated',
      file: item.file,
      prompt: item.prompt ?? asset.prompt,
      size: item.size,
      createdAt: item.createdAt,
    };
  });
  const detected = audioItems
    .filter((item) => !used.has(item.id))
    .map<AudioAsset>((item) => ({
      id: item.id,
      name: titleFromId(item.id),
      kind: audioKind(item),
      group: 'Detected Files',
      status: 'generated',
      use: 'shared',
      duration: 'file',
      prompt: item.prompt ?? 'Existing audio file found on the asset server.',
      file: item.file,
      size: item.size,
      createdAt: item.createdAt,
    }));
  return [...merged, ...detected];
}

function mergeImageAssets(catalog: ImageAsset[], manifest: ManifestItem[]): ImageAsset[] {
  const imageItems = manifest.filter((item) => item.media === 'image');
  const byId = new Map(imageItems.map((item) => [item.id, item]));
  const used = new Set<string>();
  const merged = catalog.map<ImageAsset>((asset) => {
    const item = byId.get(asset.id);
    if (!item) return asset;
    used.add(item.id);
    return {
      ...asset,
      status: asset.status === 'approved' ? asset.status : 'generated',
      file: item.file,
      preview: item.file,
      prompt: item.prompt ?? asset.prompt,
      size: item.size,
      createdAt: item.createdAt,
    };
  });
  const detected = imageItems
    .filter((item) => !used.has(item.id))
    .map<ImageAsset>((item) => ({
      id: item.id,
      name: titleFromId(item.id),
      kind: imageKind(item),
      group: 'Detected Files',
      status: 'generated',
      use: 'shared',
      ratio: 'file',
      prompt: item.prompt ?? 'Existing image file found on the asset server.',
      file: item.file,
      preview: item.file,
      size: item.size,
      createdAt: item.createdAt,
    }));
  return [...merged, ...detected];
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function readStorage(key: string, fallback = ''): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Storage can be blocked in private contexts; generation still works for this session.
  }
}

function parseDurationSeconds(asset: AudioAsset): number {
  if (asset.duration === 'loop') return 12;
  if (asset.duration === 'line' || asset.duration === 'voice') return 5;
  const parts = asset.duration.split(':').map((part) => Number(part));
  const minutes = parts[0];
  const seconds = parts[1];
  if (typeof minutes === 'number' && typeof seconds === 'number' && Number.isFinite(minutes) && Number.isFinite(seconds)) return minutes * 60 + seconds;
  return 4;
}

function normalizeVoiceOptions(payload: unknown): VoiceOption[] {
  if (!isRecord(payload) || !Array.isArray(payload.voices)) return [];
  return payload.voices
    .filter(isRecord)
    .map((voice) => ({
      voice_id: stringValue(voice.voice_id) ?? '',
      name: stringValue(voice.name) ?? '',
    }))
    .filter((voice) => voice.voice_id && voice.name);
}

function generationHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey.trim()) headers['x-eleven-key'] = apiKey.trim();
  return headers;
}

function imageGenerationHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey.trim()) headers['x-gemini-key'] = apiKey.trim();
  return headers;
}

function statusCount<T extends BaseAsset>(items: T[], status: AssetStatus): number {
  return items.filter((item) => item.status === status).length;
}

function grouped<T extends BaseAsset>(items: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(item.group, [...(map.get(item.group) ?? []), item]);
  return [...map.entries()];
}

function useFilteredAssets<T extends BaseAsset>(items: T[], query: string, status: AssetStatus | 'all'): T[] {
  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const statusMatch = status === 'all' || item.status === status;
      const queryMatch = !needle || [item.id, item.name, item.group, item.prompt, item.use, item.file].some((value) => value?.toLowerCase().includes(needle));
      return statusMatch && queryMatch;
    });
  }, [items, query, status]);
}

export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('audio');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AssetStatus | 'all'>('all');
  const [apiKey, setApiKey] = useState(() => readStorage('sl-eleven-key'));
  const [geminiKey, setGeminiKey] = useState(() => readStorage('sl-gemini-key'));
  const [voiceId, setVoiceId] = useState(() => readStorage('sl-eleven-voice'));
  const [modelId, setModelId] = useState(() => readStorage('sl-eleven-model', 'eleven_v3'));
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ManifestItem[]>([]);
  const [toast, setToast] = useState('Checking for existing asset files...');

  const refreshManifest = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/manifest', { cache: 'no-store' });
      if (!response.ok) throw new Error(`manifest ${response.status}`);
      const items = normalizeManifestItems(await response.json());
      setManifest(items);
      setToast(items.length
        ? `Detected ${items.length} existing file${items.length === 1 ? '' : 's'} from the asset server.`
        : 'Asset manifest connected. No generated files found yet.');
    } catch {
      setManifest([]);
      setToast('No asset manifest endpoint responded. Showing the bundled catalog only.');
    }
  }, []);

  useEffect(() => {
    void refreshManifest();
  }, [refreshManifest]);

  const audioAssets = useMemo(() => mergeAudioAssets(AUDIO_ASSETS, manifest), [manifest]);
  const imageAssets = useMemo(() => mergeImageAssets(IMAGE_ASSETS, manifest), [manifest]);
  const assets: BaseAsset[] = tab === 'audio' ? audioAssets : imageAssets;
  const filteredAudio = useFilteredAssets(audioAssets, query, status);
  const filteredImages = useFilteredAssets(imageAssets, query, status);
  const filtered = tab === 'audio' ? filteredAudio : filteredImages;

  const connectVoices = useCallback(async (): Promise<void> => {
    setToast('Connecting to ElevenLabs...');
    try {
      const response = await fetch('/api/voices', {
        cache: 'no-store',
        headers: generationHeaders(apiKey),
      });
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.ok !== true) {
        setToast(`ElevenLabs connection failed: ${stringValue(isRecord(payload) ? payload.error : undefined) ?? 'unknown error'}`);
        return;
      }
      const nextVoices = normalizeVoiceOptions(payload);
      setVoices(nextVoices);
      if (!voiceId && nextVoices[0]) {
        setVoiceId(nextVoices[0].voice_id);
        writeStorage('sl-eleven-voice', nextVoices[0].voice_id);
      }
      setToast(`Connected to ElevenLabs. Loaded ${nextVoices.length} voice${nextVoices.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setToast(`ElevenLabs connection failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }, [apiKey, voiceId]);

  const generateAudio = async (asset: AudioAsset): Promise<void> => {
    setBusyId(asset.id);
    setToast(`${asset.file ? 'Regenerating' : 'Generating'} ${asset.id}...`);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: generationHeaders(apiKey),
        body: JSON.stringify({
          id: asset.id,
          kind: asset.kind,
          prompt: asset.prompt,
          durationSeconds: parseDurationSeconds(asset),
          loop: asset.duration === 'loop',
          voiceId,
          modelId,
        }),
      });
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.ok !== true) {
        setToast(`Generation failed for ${asset.id}: ${stringValue(isRecord(payload) ? payload.error : undefined) ?? 'unknown error'}`);
        return;
      }
      const generated = normalizeManifestItems({ items: [payload] });
      setManifest((items) => [...items.filter((item) => item.id !== asset.id), ...generated]);
      setToast(`Generated ${asset.id}. File saved to ${stringValue(payload.file) ?? 'the asset directory'}.`);
      void refreshManifest();
    } catch (error) {
      setToast(`Generation failed for ${asset.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusyId(null);
    }
  };

  const generateImage = async (asset: ImageAsset): Promise<void> => {
    setBusyId(asset.id);
    setToast(`${asset.preview ? 'Regenerating' : 'Generating'} ${asset.id}...`);
    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: imageGenerationHeaders(geminiKey),
        body: JSON.stringify({
          id: asset.id,
          prompt: asset.prompt,
          ratio: asset.ratio,
        }),
      });
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.ok !== true) {
        setToast(`Image generation failed for ${asset.id}: ${stringValue(isRecord(payload) ? payload.error : undefined) ?? 'unknown error'}`);
        return;
      }
      const generated = normalizeManifestItems({ items: [payload] });
      setManifest((items) => [...items.filter((item) => item.id !== asset.id), ...generated]);
      setToast(`Generated ${asset.id}. File saved to ${stringValue(payload.file) ?? 'the asset directory'}.`);
      void refreshManifest();
    } catch (error) {
      setToast(`Image generation failed for ${asset.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusyId(null);
    }
  };

  const setStoredApiKey = (value: string): void => {
    setApiKey(value);
    writeStorage('sl-eleven-key', value.trim());
  };

  const setStoredGeminiKey = (value: string): void => {
    setGeminiKey(value);
    writeStorage('sl-gemini-key', value.trim());
  };

  const setStoredVoice = (value: string): void => {
    setVoiceId(value);
    writeStorage('sl-eleven-voice', value);
  };

  const setStoredModel = (value: string): void => {
    setModelId(value);
    writeStorage('sl-eleven-model', value);
  };

  const action = (asset: BaseAsset, verb: string): void => {
    setToast(`${verb} queued for ${asset.id}. Server-side approvals will attach here next.`);
  };

  return (
    <main className="admin">
      <header className="admin-header">
        <div>
          <a className="admin-brand" href="/">
            <span className="nav__mark" aria-hidden="true" />
            SIGNAL LOST
          </a>
          <p className="eyebrow">Asset admin</p>
          <h1>Forge Control</h1>
        </div>
        <div className="admin-status" aria-label="Asset status counts">
          <span><strong>{assets.length}</strong> total</span>
          <span><strong>{statusCount(assets, 'approved')}</strong> approved</span>
          <span><strong>{statusCount(assets, 'generated')}</strong> generated</span>
          <span><strong>{statusCount(assets, 'missing')}</strong> missing</span>
          <span><strong>{statusCount(assets, 'stale')}</strong> stale</span>
        </div>
      </header>

      <section className="admin-toolbar" aria-label="Admin controls">
        <div className="admin-tabs" role="tablist" aria-label="Asset type">
          <button className={tab === 'audio' ? 'active' : ''} onClick={() => setTab('audio')} role="tab" aria-selected={tab === 'audio'}>Audio</button>
          <button className={tab === 'image' ? 'active' : ''} onClick={() => setTab('image')} role="tab" aria-selected={tab === 'image'}>Image</button>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search id, prompt, group, usage" aria-label="Search assets" />
        <select value={status} onChange={(event) => setStatus(event.target.value as AssetStatus | 'all')} aria-label="Filter by status">
          <option value="all">All status</option>
          <option value="approved">Approved</option>
          <option value="generated">Generated</option>
          <option value="missing">Missing</option>
          <option value="stale">Stale</option>
        </select>
        <button className="admin-export" onClick={() => void refreshManifest()}>Refresh files</button>
        <button className="admin-export" onClick={() => setToast(`Export prepared for ${filtered.length} ${tab} assets.`)}>Export JSON</button>
      </section>

      <section className="admin-keybar" aria-label="Generation keys">
        <input
          value={apiKey}
          onChange={(event) => setStoredApiKey(event.target.value)}
          type="password"
          placeholder="ElevenLabs API key, or leave blank for server key"
          aria-label="ElevenLabs API key"
        />
        <input
          value={geminiKey}
          onChange={(event) => setStoredGeminiKey(event.target.value)}
          type="password"
          placeholder="Gemini image API key, or leave blank for server key"
          aria-label="Gemini API key"
        />
        <button className="admin-export" onClick={() => void connectVoices()}>Connect voices</button>
        <select value={voiceId} onChange={(event) => setStoredVoice(event.target.value)} aria-label="Voice for voice assets">
          <option value="">Voice for spoken rows</option>
          {voices.map((voice) => <option key={voice.voice_id} value={voice.voice_id}>{voice.name}</option>)}
        </select>
        <select value={modelId} onChange={(event) => setStoredModel(event.target.value)} aria-label="Text to speech model">
          <option value="eleven_v3">TTS v3</option>
          <option value="eleven_multilingual_v2">Multilingual v2</option>
          <option value="eleven_turbo_v2_5">Turbo v2.5</option>
          <option value="eleven_flash_v2_5">Flash v2.5</option>
        </select>
        <span>Keys are sent only to this server and saved in this browser.</span>
      </section>

      <section className="admin-note" aria-live="polite">{toast}</section>

      {tab === 'audio' ? (
        <AssetGroups groups={grouped(filteredAudio)} render={(asset) => (
          <AudioRow asset={asset} busy={busyId === asset.id} onGenerate={generateAudio} onAction={action} />
        )} />
      ) : (
        <AssetGroups groups={grouped(filteredImages)} render={(asset) => (
          <ImageRow asset={asset} busy={busyId === asset.id} onGenerate={generateImage} onAction={action} />
        )} />
      )}
    </main>
  );
}

function AssetGroups<T extends BaseAsset>(props: { groups: Array<[string, T[]]>; render: (asset: T) => JSX.Element }) {
  if (props.groups.length === 0) return <section className="admin-empty">No assets match the current filter.</section>;
  return (
    <section className="admin-groups">
      {props.groups.map(([group, items]) => (
        <section className="asset-group" key={group}>
          <div className="asset-group__head">
            <h2>{group}</h2>
            <span>{items.length} assets</span>
          </div>
          <div className="asset-list">{items.map(props.render)}</div>
        </section>
      ))}
    </section>
  );
}

function AudioRow(props: { asset: AudioAsset; busy: boolean; onGenerate: (asset: AudioAsset) => Promise<void>; onAction: (asset: BaseAsset, verb: string) => void }) {
  const { asset } = props;
  return (
    <article className="asset-row">
      <div className="asset-row__main">
        <div className="asset-row__title">
          <span className={`asset-status asset-status--${asset.status}`}>{STATUS_LABEL[asset.status]}</span>
          <h3>{asset.name}</h3>
          <code>{asset.id}</code>
        </div>
        <p>{asset.prompt}</p>
        <div className="asset-meta">
          <span>{asset.kind}</span>
          <span>{asset.duration}</span>
          <span>{asset.use}</span>
          {asset.voice ? <span>{asset.voice}</span> : null}
          {asset.file ? <span>{asset.file}</span> : null}
          {asset.size ? <span>{formatBytes(asset.size)}</span> : null}
          {asset.createdAt ? <span>{formatDate(asset.createdAt)}</span> : null}
        </div>
      </div>
      <div className="asset-preview asset-preview--audio">
        {asset.file ? <audio controls src={asset.file} /> : <span>No clip</span>}
      </div>
      <div className="asset-actions">
        <button disabled={props.busy} onClick={() => void props.onGenerate(asset)}>{props.busy ? 'Generating...' : asset.file ? 'Regenerate' : 'Generate'}</button>
        <button onClick={() => props.onAction(asset, 'Approve')}>Approve</button>
      </div>
    </article>
  );
}

function ImageRow(props: { asset: ImageAsset; busy: boolean; onGenerate: (asset: ImageAsset) => Promise<void>; onAction: (asset: BaseAsset, verb: string) => void }) {
  const { asset } = props;
  return (
    <article className="asset-row">
      <div className="asset-thumb" aria-label={`${asset.name} preview`}>
        {asset.preview ? <img src={asset.preview} alt="" /> : <span>{asset.ratio}</span>}
      </div>
      <div className="asset-row__main">
        <div className="asset-row__title">
          <span className={`asset-status asset-status--${asset.status}`}>{STATUS_LABEL[asset.status]}</span>
          <h3>{asset.name}</h3>
          <code>{asset.id}</code>
        </div>
        <p>{asset.prompt}</p>
        <div className="asset-meta">
          <span>{asset.kind}</span>
          <span>{asset.ratio}</span>
          <span>{asset.use}</span>
          {asset.file ? <span>{asset.file}</span> : null}
          {asset.size ? <span>{formatBytes(asset.size)}</span> : null}
          {asset.createdAt ? <span>{formatDate(asset.createdAt)}</span> : null}
        </div>
      </div>
      <div className="asset-actions">
        <button disabled={props.busy} onClick={() => void props.onGenerate(asset)}>{props.busy ? 'Generating...' : asset.preview ? 'Regenerate' : 'Generate'}</button>
        <button onClick={() => props.onAction(asset, 'Upload')}>Upload</button>
        <button onClick={() => props.onAction(asset, 'Approve')}>Approve</button>
      </div>
    </article>
  );
}
