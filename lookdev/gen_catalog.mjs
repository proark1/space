// SIGNAL LOST — headless Audio Forge driver.
// Mirrors admin.html's gen()/design()/saveVoice() exactly, but runs from the CLI so the
// whole 74-clip catalog + 5 designed voices can be generated in one pass against the local
// server (serve.py), which supplies the ElevenLabs key from ELEVENLABS_API_KEY.
//
// Usage (server must be running on --base with the key in its env):
//   node gen_catalog.mjs --smoke        # design VESTA + 3 representative clips, for review
//   node gen_catalog.mjs --voices-only  # just design+save the 5 SL voices
//   node gen_catalog.mjs                # full catalog (skips anything already generated)
//   node gen_catalog.mjs --only amb-corridor,crt-shriek
//   flags: --force (regenerate existing) --base http://127.0.0.1:8173
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = val('--base', 'http://127.0.0.1:8173').replace(/\/$/, '');
const SMOKE = has('--smoke');
const VOICES_ONLY = has('--voices-only');
const FORCE = has('--force');
const ONLY = (val('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const SMOKE_IDS = ['amb-corridor', 'crt-shriek', 'vox-vesta-1'];

// ---- pull CATALOG + VOICE_DESIGN straight out of admin.html (they are pure data literals) ----
function extractArray(src, name) {
  const start = src.indexOf('[', src.indexOf('const ' + name));
  if (start < 0) throw new Error('could not find ' + name);
  let depth = 0, inStr = false, q = '', i = start;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === '\\') { i++; continue; } if (c === q) inStr = false; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = true; q = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { i++; break; } }
  }
  // eslint-disable-next-line no-eval
  return eval(src.slice(start, i)); // pure literal, no identifiers → safe
}
const adminSrc = fs.readFileSync(path.join(HERE, 'admin.html'), 'utf8');
const CATALOG = extractArray(adminSrc, 'CATALOG');
const VOICE_DESIGN = extractArray(adminSrc, 'VOICE_DESIGN');
const ITEMS = CATALOG.flatMap((g) => g.items);

// ---- voice role resolution (copied from admin.html) ----
const norm = (s) => (s || '').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
function roleKey(role) {
  const n = norm(role);
  if (!n) return '';
  if (n.includes('vesta')) return 'vesta';
  if (n.includes('chorus')) return 'chorus';
  if (n.includes('captain')) return 'captain';
  if (n.includes('crew')) return 'crew';
  if (n.includes('earth') || n.includes('control')) return 'earth-control';
  return '';
}
const VD_ROLE = { 'voice-vesta': 'vesta', 'voice-captain': 'captain', 'voice-crew': 'crew', 'voice-chorus': 'chorus', 'voice-control': 'earth-control' };

async function jfetch(url, opts) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { ok: false, error: t.slice(0, 300) }; }
  return j;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureVoices(neededRoles) {
  // GET existing SL voices → role→voice_id
  const vres = await jfetch(`${BASE}/api/voices`);
  const list = Array.isArray(vres) ? vres : (vres.voices || vres.items || []);
  const byRole = {};
  for (const v of list) { const k = roleKey(v.name); if (k && v.voice_id) byRole[k] = v.voice_id; }

  for (const vd of VOICE_DESIGN) {
    const role = VD_ROLE[vd.id];
    if (!neededRoles.has(role)) continue;
    if (byRole[role] && !FORCE) { console.log(`  voice ✓ ${vd.name} (exists)`); continue; }
    console.log(`  voice … designing ${vd.name}`);
    const d = await jfetch(`${BASE}/api/design`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: vd.id, payload: { voice_description: vd.desc, model_id: 'eleven_ttv_v3', text: vd.text, guidance_scale: 5 } }),
    });
    if (!d.ok || !d.previews?.length) { console.log(`  voice ✗ design failed: ${d.error || d.status}`); continue; }
    const gvid = d.previews[0].generated_voice_id;
    const s = await jfetch(`${BASE}/api/save-voice`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: { voice_name: 'SL · ' + vd.name, voice_description: vd.desc, generated_voice_id: gvid } }),
    });
    if (!s.ok || !s.voice_id) { console.log(`  voice ✗ save failed: ${s.error || s.status}`); continue; }
    byRole[role] = s.voice_id;
    console.log(`  voice ★ saved ${s.name} → ${s.voice_id}`);
    await sleep(400);
  }
  return byRole;
}

function buildReq(it, voiceIdByRole) {
  if (it.type === 'sfx') {
    const d = Math.min(30, Math.max(0.5, Number(it.dur) || 4));
    return { endpoint: '/v1/sound-generation', payload: { text: it.prompt, duration_seconds: d, prompt_influence: 0.5, loop: !!it.loop } };
  }
  if (it.type === 'music') {
    const ms = Math.min(600000, Math.max(3000, Number(it.len) || 30000));
    return { endpoint: '/v1/music', payload: { prompt: it.prompt, music_length_ms: Math.round(ms) } };
  }
  // voice
  const vid = voiceIdByRole[roleKey(it.voice)];
  if (!vid) return { error: `no voice for role ${roleKey(it.voice)} (${it.voice})` };
  return {
    endpoint: '/v1/text-to-speech/' + vid,
    payload: { text: it.prompt, model_id: 'eleven_v3', voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true } },
  };
}

async function main() {
  console.log(`▸ Audio Forge driver → ${BASE}  (catalog: ${ITEMS.length} clips, ${VOICE_DESIGN.length} voices)`);
  // server up?
  const ping = await jfetch(`${BASE}/api/manifest`).catch(() => null);
  if (!ping || (!Array.isArray(ping.items) && !Array.isArray(ping))) {
    console.error(`✗ server not reachable at ${BASE} (start serve.py with ELEVENLABS_API_KEY set)`); process.exit(1);
  }
  const have = new Set((ping.items || ping).map((m) => m.id));

  // choose work list
  let work = ITEMS;
  if (SMOKE) work = ITEMS.filter((it) => SMOKE_IDS.includes(it.id));
  else if (ONLY.length) work = ITEMS.filter((it) => ONLY.includes(it.id));
  if (VOICES_ONLY) work = [];

  // which voice roles do we need?
  const neededRoles = new Set((VOICES_ONLY ? ITEMS : work).filter((it) => it.type === 'voice').map((it) => roleKey(it.voice)));
  if (VOICES_ONLY) VOICE_DESIGN.forEach((vd) => neededRoles.add(VD_ROLE[vd.id]));
  console.log(`\n▸ Voices (${[...neededRoles].join(', ') || 'none'})`);
  const voiceIdByRole = await ensureVoices(neededRoles);

  if (VOICES_ONLY) { console.log('\n✓ voices done'); return; }

  console.log(`\n▸ Clips (${work.length} target${SMOKE ? ' · SMOKE' : ''})`);
  let ok = 0, skip = 0, fail = 0;
  for (const it of work) {
    if (have.has(it.id) && !FORCE) { skip++; continue; }
    const req = buildReq(it, voiceIdByRole);
    if (req.error) { console.log(`  ✗ ${it.id}: ${req.error}`); fail++; continue; }
    const j = await jfetch(`${BASE}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: it.id, endpoint: req.endpoint, payload: req.payload, category: it.type }),
    });
    if (j.ok) { ok++; console.log(`  ✓ ${it.id.padEnd(20)} ${it.type.padEnd(6)} ${(j.size ? (j.size / 1024).toFixed(0) + 'KB' : '')}`); }
    else { fail++; console.log(`  ✗ ${it.id}: ${j.error || j.status}`); }
    await sleep(300);
  }
  console.log(`\n✓ done — generated ${ok}, skipped ${skip} (already present), failed ${fail}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
