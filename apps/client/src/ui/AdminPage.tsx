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

const EXTRA_AUDIO_ASSETS: AudioAsset[] = [
  { id: 'pad-ambience', name: 'Pad Night Ambience', kind: 'sound', group: 'Launch SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Overcast night launch complex with gusting wind, distant industrial machinery, low generator hum, and a far-off warning klaxon.' },
  { id: 'pad-klaxon', name: 'Launch Klaxon', kind: 'sound', group: 'Launch SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Slow repeating launch-warning klaxon echoing across a vast metallic launch pad.' },
  { id: 'pad-steam', name: 'Umbilical Steam Vent', kind: 'sound', group: 'Launch SFX', status: 'missing', use: 'game', duration: '0:02', prompt: 'High-pressure steam and cryogenic vapor venting sharply from rocket umbilical lines.' },
  { id: 'pad-rumble', name: 'Engine Roar Bed', kind: 'sound', group: 'Launch SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Sustained heavy rocket engine roar at full thrust, thunderous low-end rumble with crackling overtones.' },
  { id: 'pad-liftoff', name: 'Liftoff', kind: 'sound', group: 'Launch SFX', status: 'missing', use: 'game', duration: '0:08', prompt: 'Massive rocket lifting off the pad with overwhelming roar, deep ground rumble, and slow Doppler shift.' },
  { id: 'pad-separation', name: 'Stage Separation', kind: 'sound', group: 'Launch SFX', status: 'missing', use: 'game', duration: '0:03', prompt: 'Booster stage separation high in flight: sharp metallic bang, pyrotechnic crack, then thin rushing wind.' },
  { id: 'pad-thunder', name: 'Distant Thunder', kind: 'sound', group: 'Launch SFX', status: 'missing', use: 'game', duration: '0:04', prompt: 'Distant rolling thunder over a storm-lit launch site, low and grim.' },
  { id: 'cabin-air', name: 'Cabin Air Handling', kind: 'sound', group: 'Capsule SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Capsule air handling: soft circulated-air hiss and steady regulator tick, loopable.' },
  { id: 'cabin-comms', name: 'Comms Static Bed', kind: 'sound', group: 'Capsule SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Radio comms bed with faint static, intermittent squelch, and far-off garbled transmissions.' },
  { id: 'cabin-creak', name: 'Hull Creak', kind: 'sound', group: 'Capsule SFX', status: 'missing', use: 'game', duration: '0:03', prompt: 'Spacecraft hull creaking and groaning under stress, deep metallic flex.' },
  { id: 'cabin-breath', name: 'Suit Breathing Bed', kind: 'sound', group: 'Capsule SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Tense slow astronaut breathing inside a sealed helmet, controlled but afraid.' },
  { id: 'cabin-heartbeat', name: 'Heartbeat', kind: 'sound', group: 'Capsule SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Slow heavy human heartbeat under rising tension, intimate and loopable.' },
  { id: 'capsule-thruster', name: 'RCS Thruster Puff', kind: 'sound', group: 'Capsule SFX', status: 'missing', use: 'game', duration: '0:01', prompt: 'Short reaction-control thruster puff in vacuum, sharp burst of gas.' },
  { id: 'space-drone', name: 'Deep Space Void Bed', kind: 'sound', group: 'Docking SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Cold emptiness beside a derelict ship: sub-bass void drone with distant hull resonances.' },
  { id: 'space-hull-groan', name: 'Derelict Hull Groan', kind: 'sound', group: 'Docking SFX', status: 'missing', use: 'game', duration: '0:06', prompt: 'Enormous dead spaceship hull groaning and flexing in the cold, deep metal stress and pops.' },
  { id: 'dock-airlock', name: 'Airlock Cycle', kind: 'sound', group: 'Docking SFX', status: 'missing', use: 'game', duration: '0:04', prompt: 'Airlock cycling with pressurization hiss, pumps spinning up, and a heavy seal thunk.' },
  { id: 'dock-thruster', name: 'Docking Thrusters', kind: 'sound', group: 'Docking SFX', status: 'missing', use: 'game', duration: '0:02', prompt: 'Capsule firing final maneuvering thrusters to align with a docking port, short controlled bursts.' },
  { id: 'beacon-blip', name: 'Distress Beacon Bed', kind: 'sound', group: 'Docking SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Slow lonely automated distress-beacon blip repeating in the dark, cold and patient.' },
  { id: 'amb-engine', name: 'Engine Room Drone', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Engine room ambience: throbbing dying reactor, low sub-bass drone, intermittent mechanical clanks.' },
  { id: 'amb-vacuum', name: 'Vacuum Near-Silence', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Eerie near-silence of vacuum with faint suit breathing and a high lonely ringing tone.' },
  { id: 'amb-medbay', name: 'Medbay Ambience', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Derelict medbay ambience: slow dripping fluid, stuttering flatline monitor tone, flickering electrical buzz.' },
  { id: 'amb-bridge', name: 'Command Bridge Ambience', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Dead command bridge with hull-breach wind, sparking consoles, and distant automated voice.' },
  { id: 'amb-saferoom', name: 'Safe Room Ambience', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Barricaded safe room with warmer electrical hum, calmer steady tone, distant threats muffled by steel.' },
  { id: 'sfx-step', name: 'Footstep On Grating', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: '0:01', prompt: 'Single heavy footstep on a metal grating floor, hollow and close.' },
  { id: 'sfx-step-run', name: 'Running Footstep', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: '0:01', prompt: 'Fast heavy running footstep on metal grating, urgent and hollow.' },
  { id: 'sfx-vent', name: 'Vent Fan Whir', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Worn ceiling ventilation fan whirring and slightly rattling, loopable.' },
  { id: 'sfx-klaxon', name: 'Alarm Klaxon', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: '0:04', prompt: 'Distant emergency alarm klaxon echoing through metal corridors, ominous and repeating.' },
  { id: 'sfx-steam', name: 'Steam Burst', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: '0:02', prompt: 'Sudden burst of pressurized steam hissing from a broken pipe.' },
  { id: 'sfx-pickup', name: 'Item Pickup', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: '0:01', prompt: 'Picking up a sci-fi item: soft electronic chime and a small mechanical latch.' },
  { id: 'sfx-powerdown', name: 'Power Cut', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: '0:03', prompt: 'Ship power dying: descending electrical whine and heavy clunk as the lights cut out.' },
  { id: 'sfx-whisper', name: 'Vent Whispers', kind: 'sound', group: 'Interior SFX', status: 'missing', use: 'game', duration: '0:04', prompt: 'Faint disembodied whispers drifting through a ventilation duct, words just out of reach.' },
  { id: 'sfx-rifle', name: 'Pulse Rifle Shot', kind: 'sound', group: 'Combat SFX', status: 'missing', use: 'game', duration: '0:01', prompt: 'Sci-fi pulse rifle shot, punchy energy weapon discharge with a short tail.' },
  { id: 'sfx-reload', name: 'Weapon Reload', kind: 'sound', group: 'Combat SFX', status: 'missing', use: 'game', duration: '0:02', prompt: 'Mechanical sci-fi weapon reload: magazine click and rising charge whine.' },
  { id: 'sfx-gore', name: 'Dismemberment', kind: 'sound', group: 'Combat SFX', status: 'missing', use: 'game', duration: '0:02', prompt: 'Wet visceral flesh tearing and bone snapping, gory dismemberment squelch.' },
  { id: 'sfx-melee', name: 'Melee Impact', kind: 'sound', group: 'Combat SFX', status: 'missing', use: 'game', duration: '0:01', prompt: 'Heavy melee impact with wet thud and metal clang.' },
  { id: 'sfx-hit', name: 'Player Hurt', kind: 'sound', group: 'Combat SFX', status: 'missing', use: 'game', duration: '0:01', prompt: 'Player taking damage: sharp pained human grunt and low impact thud.' },
  { id: 'sfx-shield', name: 'Shield Absorb', kind: 'sound', group: 'Combat SFX', status: 'missing', use: 'game', duration: '0:01', prompt: 'Energy shield absorbing a hit, electric crackle and fading shimmer.' },
  { id: 'crt-stalk', name: 'CHORUS Stalking Breath', kind: 'sound', group: 'Creature SFX', status: 'missing', use: 'game', duration: 'loop', prompt: 'Creature stalking nearby: wet rattling breathing and low clicks, intimate and threatening.' },
  { id: 'crt-lunge', name: 'CHORUS Lunge', kind: 'sound', group: 'Creature SFX', status: 'missing', use: 'game', duration: '0:02', prompt: 'Creature lunging with violent wet surge of motion and layered inhuman scream.' },
  { id: 'crt-mimic', name: 'CHORUS Mimic Help Call', kind: 'sound', group: 'Creature SFX', status: 'missing', use: 'game', duration: '0:04', prompt: 'Creature mimicking a human voice calling for help, almost convincing but hollow and subtly wrong.' },
  { id: 'crt-skitter', name: 'CHORUS Duct Skitter', kind: 'sound', group: 'Creature SFX', status: 'missing', use: 'game', duration: '0:03', prompt: 'Many-limbed creature skittering fast through metal ducts and across panels, wet and frantic.' },
  { id: 'mus-credits', name: 'End Credits', kind: 'music', group: 'Music', status: 'missing', use: 'game', duration: '0:40', prompt: 'Haunting bittersweet ambient end-credits piece that reframes the mission as a tragedy, unresolved and grieving.' },
  { id: 'sfx-ui', name: 'UI Confirm Beep', kind: 'sound', group: 'Interface SFX', status: 'missing', use: 'shared', duration: '0:01', prompt: 'Soft retro sci-fi interface confirmation beep, single.' },
  { id: 'sfx-ui-hover', name: 'UI Hover Tick', kind: 'sound', group: 'Interface SFX', status: 'missing', use: 'shared', duration: '0:01', prompt: 'Very short soft retro sci-fi UI hover tick.' },
  { id: 'sfx-ui-back', name: 'UI Back Blip', kind: 'sound', group: 'Interface SFX', status: 'missing', use: 'shared', duration: '0:01', prompt: 'Low retro sci-fi UI back or cancel blip.' },
  { id: 'sfx-ui-error', name: 'UI Error Buzzer', kind: 'sound', group: 'Interface SFX', status: 'missing', use: 'shared', duration: '0:01', prompt: 'Harsh denied error buzzer, short sci-fi interface failure.' },
  { id: 'voice-captain', name: 'Captain Voice Design', kind: 'voice', group: 'Voices', status: 'missing', use: 'game', duration: 'voice', voice: 'Captain', prompt: 'Weary middle-aged spaceship captain, hoarse and exhausted, gravelly and low, trembling with controlled fear.' },
  { id: 'voice-crew', name: 'Crew Panic Voice Design', kind: 'voice', group: 'Voices', status: 'missing', use: 'game', duration: 'voice', voice: 'Crew', prompt: 'Young terrified crew member, breathless and shaking, whispering urgently with a cracking voice.' },
  { id: 'vox-control-count', name: 'Earth Control Countdown', kind: 'voice', group: 'Spoken Text', status: 'missing', use: 'game', duration: 'line', voice: 'Earth Control', prompt: '[tense] Ignition sequence start. Five. Four. [static] Three. Two. [grim] Godspeed. One.' },
  { id: 'vox-control-wrong', name: 'Earth Control Wrong Note', kind: 'voice', group: 'Spoken Text', status: 'missing', use: 'game', duration: 'line', voice: 'Earth Control', prompt: '[steady] Telemetry is nominal, you are looking good, looking good, looking... [a fainter second voice underneath, a half beat late] looking good. [static] Control out.' },
  { id: 'vox-crew-banter', name: 'Crew Capsule Banter', kind: 'voice', group: 'Spoken Text', status: 'missing', use: 'game', duration: 'line', voice: 'Crew', prompt: '[tired chuckle] So. Did anybody actually read the brief? [beat] No? [dry] Cool. Cool cool cool. [exhales] We are going to be fine.' },
  { id: 'vox-vesta-1', name: 'VESTA The Signal', kind: 'voice', group: 'Spoken Text', status: 'missing', use: 'game', duration: 'line', voice: 'VESTA', prompt: '[calm] Correction. One signal active. [pause] It is not on our manifest.' },
  { id: 'vox-vesta-2', name: 'VESTA Hull Breach', kind: 'voice', group: 'Spoken Text', status: 'missing', use: 'game', duration: 'line', voice: 'VESTA', prompt: '[urgent] Warning. Hull breach detected. [pause] Decompression imminent. [firmly] Brace.' },
  { id: 'vox-vesta-3', name: 'VESTA Do Not Answer', kind: 'voice', group: 'Spoken Text', status: 'missing', use: 'game', duration: 'line', voice: 'VESTA', prompt: '[whispering] Do not restore communications. [pause] Whatever asks you to... [slowly] do not answer it.' },
  { id: 'vox-captain-log', name: 'Captain Final Log', kind: 'voice', group: 'Spoken Text', status: 'missing', use: 'game', duration: 'line', voice: 'Captain', prompt: '[weary] Captain log, final entry. [shaky breath] We restored the comms array like they asked. [whisper] God help me, we answered it. [trembling] It has our voices now. All of them.' },
  { id: 'vox-chorus-1', name: 'CHORUS The Lure', kind: 'voice', group: 'Spoken Text', status: 'missing', use: 'game', duration: 'line', voice: 'The Chorus', prompt: '[hollow] I am the rescue you called for. [whisper] Restore the signal. Open the channel. [mimicking] I sound like your friend because I am your friend now.' },
  { id: 'vox-chorus-2', name: 'CHORUS Come Closer', kind: 'voice', group: 'Spoken Text', status: 'missing', use: 'game', duration: 'line', voice: 'The Chorus', prompt: '[wet, distorted] Come closer. [echoing] Let me speak to the others. [softly] Do not be afraid of me.' },
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

const BASE_AUDIO_IDS = new Set(AUDIO_ASSETS.map((asset) => asset.id));
const ALL_AUDIO_ASSETS = [...AUDIO_ASSETS, ...EXTRA_AUDIO_ASSETS.filter((asset) => !BASE_AUDIO_IDS.has(asset.id))];
const IMAGE_SIZE_OPTIONS = [256, 512, 768, 1024, 1600, 2048];

const STATUS_LABEL: Record<AssetStatus, string> = {
  approved: 'approved',
  generated: 'generated',
  missing: 'missing',
  stale: 'stale',
};

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'webm']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif']);
const SIGNAL_LOST_VOICE_PREFIX = 'SL ·';
const SIGNAL_LOST_VOICE_TARGETS: Record<string, string[]> = {
  'earth-control': ['SL · Earth — mission control'],
  captain: ['SL · Captain — distress log'],
  chorus: ['SL · THE CHORUS — the mimic'],
  crew: ['SL · Crew — panic'],
  vesta: ['SL · VESTA — ship AI'],
};

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

function normalizedVoiceName(value: string): string {
  return value.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

function isSignalLostVoice(voice: VoiceOption): boolean {
  return voice.name.trim().startsWith(SIGNAL_LOST_VOICE_PREFIX);
}

function voiceRoleKey(role?: string): string | undefined {
  const normalized = normalizedVoiceName(role ?? '');
  if (!normalized) return undefined;
  if (normalized.includes('vesta')) return 'vesta';
  if (normalized.includes('chorus')) return 'chorus';
  if (normalized.includes('captain')) return 'captain';
  if (normalized.includes('crew')) return 'crew';
  if (normalized.includes('earth') || normalized.includes('control')) return 'earth-control';
  return undefined;
}

function expectedSignalLostVoiceName(role?: string): string {
  const key = voiceRoleKey(role);
  return key ? SIGNAL_LOST_VOICE_TARGETS[key]?.[0] ?? `${SIGNAL_LOST_VOICE_PREFIX} voice` : `${SIGNAL_LOST_VOICE_PREFIX} voice`;
}

function findSignalLostVoice(voices: VoiceOption[], role?: string): VoiceOption | undefined {
  const key = voiceRoleKey(role);
  if (!key) return undefined;

  const targets = new Set((SIGNAL_LOST_VOICE_TARGETS[key] ?? []).map(normalizedVoiceName));
  const exact = voices.find((voice) => targets.has(normalizedVoiceName(voice.name)));
  if (exact) return exact;

  return voices.find((voice) => {
    const name = normalizedVoiceName(voice.name);
    if (!name.startsWith(normalizedVoiceName(SIGNAL_LOST_VOICE_PREFIX))) return false;
    if (key === 'earth-control') return name.includes('earth') && name.includes('mission control');
    return name.includes(key);
  });
}

function resolveSignalLostVoice(asset: AudioAsset, voices: VoiceOption[], selectedVoiceId: string): { voice?: VoiceOption; error?: string } {
  if (asset.kind !== 'voice') return {};

  const key = voiceRoleKey(asset.voice);
  const roleVoice = findSignalLostVoice(voices, asset.voice);
  if (key && !roleVoice) {
    return { error: `Connect voices first; missing ${expectedSignalLostVoiceName(asset.voice)}.` };
  }

  const selectedVoice = voices.find((voice) => voice.voice_id === selectedVoiceId);
  const voice = roleVoice ?? selectedVoice;
  if (!voice) return { error: `Connect voices first; choose one of the ${SIGNAL_LOST_VOICE_PREFIX} voices.` };
  return { voice };
}

function isVoiceDesignAsset(asset: AudioAsset): boolean {
  return asset.kind === 'voice' && asset.duration === 'voice';
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

function imageSource(asset: ImageAsset): string | undefined {
  return asset.preview ?? asset.file;
}

function isIconAsset(asset: ImageAsset): boolean {
  const text = `${asset.kind} ${asset.id} ${asset.name}`.toLowerCase();
  return asset.kind === 'item' || /(^|[-_\s])icon([-_\s]|$)/.test(text);
}

function imagePrompt(asset: ImageAsset): string {
  if (!isIconAsset(asset)) return asset.prompt;
  return `${asset.prompt} Isolated single game item icon centered on a pure white background. No text, no scene, no UI frame. Crisp cutout-ready edges with the whole object visible.`;
}

function defaultImageSize(asset: ImageAsset): number {
  if (isIconAsset(asset)) return 512;
  if (asset.kind === 'ui') return 1024;
  if (asset.ratio === '21:9') return 2048;
  return 1600;
}

function loadProcessImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the image for processing.'));
    image.src = src;
  });
}

function drawingContext(canvas: HTMLCanvasElement, willReadFrequently = false): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently });
  if (!context) throw new Error('This browser could not create an image canvas.');
  return context;
}

function isWhiteBackgroundPixel(data: Uint8ClampedArray, offset: number): boolean {
  const red = data[offset] ?? 0;
  const green = data[offset + 1] ?? 0;
  const blue = data[offset + 2] ?? 0;
  const alpha = data[offset + 3] ?? 0;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  return alpha < 8 || (min > 216 && max - min < 46) || (red > 238 && green > 238 && blue > 238);
}

function trimTransparentCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const context = drawingContext(canvas, true);
  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = imageData.data[(y * width + x) * 4 + 3] ?? 0;
      if (alpha <= 12) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return canvas;

  const padding = Math.min(24, Math.max(8, Math.round(Math.max(width, height) * 0.025)));
  const sx = Math.max(0, minX - padding);
  const sy = Math.max(0, minY - padding);
  const sw = Math.min(width - sx, maxX - minX + 1 + padding * 2);
  const sh = Math.min(height - sy, maxY - minY + 1 + padding * 2);
  const output = document.createElement('canvas');
  output.width = sw;
  output.height = sh;
  drawingContext(output).drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return output;
}

function cutOutWhiteBackground(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const context = drawingContext(canvas, true);
  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  const queue = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel]) return;
    const offset = pixel * 4;
    if (!isWhiteBackgroundPixel(imageData.data, offset)) return;
    visited[pixel] = 1;
    stack.push(pixel);
  };

  for (let x = 0; x < width; x += 1) {
    queue(x, 0);
    queue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    queue(0, y);
    queue(width - 1, y);
  }

  while (stack.length) {
    const pixel = stack.pop();
    if (typeof pixel !== 'number') continue;
    const offset = pixel * 4;
    imageData.data[offset + 3] = 0;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    queue(x + 1, y);
    queue(x - 1, y);
    queue(x, y + 1);
    queue(x, y - 1);
  }

  context.putImageData(imageData, 0, 0);
  return trimTransparentCanvas(canvas);
}

async function processImageAsset(asset: ImageAsset, maxEdge: number, cutout: boolean): Promise<string> {
  const src = imageSource(asset);
  if (!src) throw new Error('Generate or upload this image before saving it.');
  const image = await loadProcessImage(src);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('The image has no readable dimensions.');
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = drawingContext(canvas, cutout);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  if (!cutout && !isIconAsset(asset)) {
    context.fillStyle = '#050607';
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);
  const output = cutout ? cutOutWhiteBackground(canvas) : canvas;
  return output.toDataURL(cutout || isIconAsset(asset) ? 'image/png' : 'image/jpeg', 0.86);
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
  const [imageSizeById, setImageSizeById] = useState<Record<string, number>>({});
  const [audioMessages, setAudioMessages] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('Checking for existing asset files...');

  const setAudioMessage = useCallback((assetId: string, message: string): void => {
    setAudioMessages((messages) => {
      const next = { ...messages };
      if (message) next[assetId] = message;
      else delete next[assetId];
      return next;
    });
  }, []);

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

  const audioAssets = useMemo(() => mergeAudioAssets(ALL_AUDIO_ASSETS, manifest), [manifest]);
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
      const nextVoices = normalizeVoiceOptions(payload).filter(isSignalLostVoice);
      setVoices(nextVoices);
      if (voiceId && !nextVoices.some((voice) => voice.voice_id === voiceId)) {
        setVoiceId('');
        writeStorage('sl-eleven-voice', '');
      }
      setToast(`Connected to ElevenLabs. Loaded ${nextVoices.length} Signal Lost voice${nextVoices.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setToast(`ElevenLabs connection failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }, [apiKey, voiceId]);

  const generateAudio = async (asset: AudioAsset): Promise<void> => {
    setBusyId(asset.id);
    setAudioMessage(asset.id, '');
    setToast(`${asset.file ? 'Regenerating' : 'Generating'} ${asset.id}...`);
    try {
      if (isVoiceDesignAsset(asset)) {
        const resolvedVoice = resolveSignalLostVoice(asset, voices, voiceId);
        const message = resolvedVoice.error
          ? `${resolvedVoice.error} This row checks the saved SL voice only; generate clips from the Spoken Text rows below.`
          : `${resolvedVoice.voice?.name ?? expectedSignalLostVoiceName(asset.voice)} is connected. Generate clips from the Spoken Text rows that use ${asset.voice ?? 'this role'}.`;
        setAudioMessage(asset.id, message);
        setToast(message);
        return;
      }

      const resolvedVoice = resolveSignalLostVoice(asset, voices, voiceId);
      if (resolvedVoice.error) {
        const message = `Generation failed: ${resolvedVoice.error}`;
        setAudioMessage(asset.id, message);
        setToast(`Generation failed for ${asset.id}: ${resolvedVoice.error}`);
        return;
      }

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: generationHeaders(apiKey),
        body: JSON.stringify({
          id: asset.id,
          kind: asset.kind,
          prompt: asset.prompt,
          durationSeconds: parseDurationSeconds(asset),
          loop: asset.duration === 'loop',
          voiceId: resolvedVoice.voice?.voice_id ?? '',
          modelId,
        }),
      });
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.ok !== true) {
        const message = `Generation failed: ${stringValue(isRecord(payload) ? payload.error : undefined) ?? 'unknown error'}`;
        setAudioMessage(asset.id, message);
        setToast(`Generation failed for ${asset.id}: ${message.replace(/^Generation failed: /, '')}`);
        return;
      }
      const generated = normalizeManifestItems({ items: [payload] });
      setManifest((items) => [...items.filter((item) => item.id !== asset.id), ...generated]);
      const message = `Generated ${asset.id}. File saved to ${stringValue(payload.file) ?? 'the asset directory'}.`;
      setAudioMessage(asset.id, message);
      setToast(message);
      void refreshManifest();
    } catch (error) {
      const message = `Generation failed: ${error instanceof Error ? error.message : 'unknown error'}`;
      setAudioMessage(asset.id, message);
      setToast(`Generation failed for ${asset.id}: ${message.replace(/^Generation failed: /, '')}`);
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
          prompt: imagePrompt(asset),
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

  const saveImage = async (asset: ImageAsset, cutout: boolean): Promise<void> => {
    const maxEdge = imageSizeById[asset.id] ?? defaultImageSize(asset);
    setBusyId(asset.id);
    setToast(`${cutout ? 'Cutting out and saving' : 'Resizing and saving'} ${asset.id} at ${maxEdge}px max edge...`);
    try {
      const dataUrl = await processImageAsset(asset, maxEdge, cutout);
      const response = await fetch('/api/save-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: asset.id, dataUrl }),
      });
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.ok !== true) {
        setToast(`Image save failed for ${asset.id}: ${stringValue(isRecord(payload) ? payload.error : undefined) ?? 'unknown error'}`);
        return;
      }
      const saved = normalizeManifestItems({ items: [payload] });
      setManifest((items) => [...items.filter((item) => item.id !== asset.id), ...saved]);
      setToast(`Saved ${asset.id}. File saved to ${stringValue(payload.file) ?? 'the asset directory'}.`);
      void refreshManifest();
    } catch (error) {
      setToast(`Image save failed for ${asset.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
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
        <select value={voiceId} onChange={(event) => setStoredVoice(event.target.value)} aria-label="Fallback Signal Lost voice">
          <option value="">Auto SL voice by row</option>
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
          <AudioRow asset={asset} busy={busyId === asset.id} message={audioMessages[asset.id]} onGenerate={generateAudio} onAction={action} />
        )} />
      ) : (
        <AssetGroups groups={grouped(filteredImages)} render={(asset) => (
          <ImageRow
            asset={asset}
            busy={busyId === asset.id}
            imageSize={imageSizeById[asset.id] ?? defaultImageSize(asset)}
            onSizeChange={(value) => setImageSizeById((sizes) => ({ ...sizes, [asset.id]: value }))}
            onGenerate={generateImage}
            onSave={(item) => saveImage(item, false)}
            onCutout={(item) => saveImage(item, true)}
            onAction={action}
          />
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

function AudioRow(props: { asset: AudioAsset; busy: boolean; message?: string; onGenerate: (asset: AudioAsset) => Promise<void>; onAction: (asset: BaseAsset, verb: string) => void }) {
  const { asset } = props;
  const isVoiceDesign = isVoiceDesignAsset(asset);
  const generateLabel = props.busy ? (isVoiceDesign ? 'Checking...' : 'Generating...') : isVoiceDesign ? 'Check SL voice' : asset.file ? 'Regenerate' : 'Generate';
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
        {props.message ? <div className="asset-row__message" role="status">{props.message}</div> : null}
      </div>
      <div className="asset-preview asset-preview--audio">
        {asset.file ? <audio controls src={asset.file} /> : <span>{isVoiceDesign ? 'Saved SL voice' : 'No clip'}</span>}
      </div>
      <div className="asset-actions">
        <button disabled={props.busy} onClick={() => void props.onGenerate(asset)}>{generateLabel}</button>
        <button onClick={() => props.onAction(asset, 'Approve')}>Approve</button>
      </div>
    </article>
  );
}

function ImageRow(props: {
  asset: ImageAsset;
  busy: boolean;
  imageSize: number;
  onSizeChange: (value: number) => void;
  onGenerate: (asset: ImageAsset) => Promise<void>;
  onSave: (asset: ImageAsset) => Promise<void>;
  onCutout: (asset: ImageAsset) => Promise<void>;
  onAction: (asset: BaseAsset, verb: string) => void;
}) {
  const { asset } = props;
  const hasImage = Boolean(imageSource(asset));
  return (
    <article className="asset-row">
      <div className={`asset-thumb ${isIconAsset(asset) ? 'asset-thumb--icon' : ''}`} aria-label={`${asset.name} preview`}>
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
        <button disabled={props.busy} onClick={() => void props.onGenerate(asset)}>{props.busy ? 'Working...' : asset.preview ? 'Regenerate' : 'Generate'}</button>
        <label className="asset-size-control">
          <span>Max</span>
          <select value={props.imageSize} onChange={(event) => props.onSizeChange(Number(event.target.value))} aria-label={`Maximum saved size for ${asset.name}`}>
            {IMAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}px</option>)}
          </select>
        </label>
        <button disabled={props.busy || !hasImage} onClick={() => void props.onSave(asset)}>Save</button>
        <button disabled={props.busy || !hasImage} onClick={() => void props.onCutout(asset)}>Cut out</button>
        <button onClick={() => props.onAction(asset, 'Upload')}>Upload</button>
        <button onClick={() => props.onAction(asset, 'Approve')}>Approve</button>
      </div>
    </article>
  );
}
