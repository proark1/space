// SIGNAL LOST — mirror the already-generated audio (and image) assets from the deployed
// Railway volume down into the local lookdev/audio/ dir, so the local game/scenes use the
// real clips with zero regeneration / zero ElevenLabs credits.
//   node pull_prod_audio.mjs [prodBaseUrl]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROD = (process.argv[2] || 'https://signal-lost-production-a7a1.up.railway.app').replace(/\/$/, '');
const CONC = 8;

async function main() {
  const man = await (await fetch(`${PROD}/api/manifest`)).json();
  const items = (man.items || []).filter((i) => i.file);
  console.log(`▸ prod manifest: ${items.length} files → mirroring into ${path.join(HERE, 'audio')}`);
  let ok = 0, skip = 0, fail = 0, bytes = 0;

  async function pull(it) {
    const dest = path.join(HERE, it.file);              // it.file = "audio/xxx.mp3"
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest) && it.size && fs.statSync(dest).size === it.size) { skip++; return; }
    try {
      const r = await fetch(`${PROD}/${it.file}`);
      if (!r.ok) { fail++; console.log(`  ✗ ${it.file}: HTTP ${r.status}`); return; }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(dest, buf);
      ok++; bytes += buf.length;
      if (ok % 20 === 0) console.log(`  … ${ok} downloaded`);
    } catch (e) { fail++; console.log(`  ✗ ${it.file}: ${e.message}`); }
  }

  for (let i = 0; i < items.length; i += CONC) {
    await Promise.all(items.slice(i, i + CONC).map(pull));
  }
  console.log(`\n✓ done — downloaded ${ok} (${(bytes / 1048576).toFixed(1)} MB), skipped ${skip} (already local), failed ${fail}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
