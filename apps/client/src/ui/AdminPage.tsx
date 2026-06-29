import { useMemo, useState } from 'react';
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
      const queryMatch = !needle || [item.id, item.name, item.group, item.prompt, item.use].some((value) => value.toLowerCase().includes(needle));
      return statusMatch && queryMatch;
    });
  }, [items, query, status]);
}

export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('audio');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AssetStatus | 'all'>('all');
  const [toast, setToast] = useState('Asset backend is not connected yet. Catalog, routing, and approvals surface are ready.');
  const assets: BaseAsset[] = tab === 'audio' ? AUDIO_ASSETS : IMAGE_ASSETS;
  const filteredAudio = useFilteredAssets(AUDIO_ASSETS, query, status);
  const filteredImages = useFilteredAssets(IMAGE_ASSETS, query, status);
  const filtered = tab === 'audio' ? filteredAudio : filteredImages;

  const action = (asset: BaseAsset, verb: string): void => {
    setToast(`${verb} queued for ${asset.id}. Server-side generation will attach here next.`);
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
        <button className="admin-export" onClick={() => setToast(`Export prepared for ${filtered.length} ${tab} assets.`)}>Export JSON</button>
      </section>

      <section className="admin-note" aria-live="polite">{toast}</section>

      {tab === 'audio' ? (
        <AssetGroups groups={grouped(filteredAudio)} render={(asset) => (
          <AudioRow asset={asset} onAction={action} />
        )} />
      ) : (
        <AssetGroups groups={grouped(filteredImages)} render={(asset) => (
          <ImageRow asset={asset} onAction={action} />
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

function AudioRow(props: { asset: AudioAsset; onAction: (asset: BaseAsset, verb: string) => void }) {
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
        </div>
      </div>
      <div className="asset-preview asset-preview--audio">
        {asset.file ? <audio controls src={asset.file} /> : <span>No clip</span>}
      </div>
      <div className="asset-actions">
        <button onClick={() => props.onAction(asset, 'Generate')}>Generate</button>
        <button onClick={() => props.onAction(asset, 'Approve')}>Approve</button>
      </div>
    </article>
  );
}

function ImageRow(props: { asset: ImageAsset; onAction: (asset: BaseAsset, verb: string) => void }) {
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
        </div>
      </div>
      <div className="asset-actions">
        <button onClick={() => props.onAction(asset, asset.preview ? 'Regenerate' : 'Generate')}>{asset.preview ? 'Regenerate' : 'Generate'}</button>
        <button onClick={() => props.onAction(asset, 'Upload')}>Upload</button>
        <button onClick={() => props.onAction(asset, 'Approve')}>Approve</button>
      </div>
    </article>
  );
}
