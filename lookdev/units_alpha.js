// SIGNAL LOST — TEST UNIT "ALPHA" (AU-01 style study).
// A faithful low-poly / hand-painted recreation of the reference astronaut:
// faceted flat-shaded geometry, matte hand-painted maps, chunky LEGO-ish
// proportions, a clean bubble helmet with a scared bearded face inside, a
// life-support backpack, big mitt gloves + boots, and a red chest badge.
//
// This is a SEPARATE style experiment — it does NOT touch the shipped
// makeAstronaut() in units.js. makeTransportCase() builds the rolling case prop.
import * as THREE from 'three';

// ---- hand-painted texture helpers (flat base + soft grime + painted seams) ----
function paintMap({ base, dirt = '#9a9384', crevice = '#6f6a5d', blots = 7, speck = 260, seams = 0, repeat = 1 } = {}) {
  if (typeof document === 'undefined') return null;
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  // big soft grime blotches — low frequency so it reads hand-painted, not noise
  for (let i = 0; i < blots; i++) {
    const px = (Math.sin(i * 91.7) * 0.5 + 0.5) * S;
    const py = (Math.cos(i * 53.3) * 0.5 + 0.5) * S;
    const r = 26 + ((Math.sin(i * 12.9) * 0.5 + 0.5) * 60);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, dirt + '44'); g.addColorStop(1, dirt + '00');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  // edge ambient-occlusion: darken the canvas border so panel edges read recessed
  const vg = x.createLinearGradient(0, 0, 0, S);
  vg.addColorStop(0, crevice + '30'); vg.addColorStop(0.32, '#00000000'); vg.addColorStop(1, crevice + '40');
  x.fillStyle = vg; x.fillRect(0, 0, S, S);
  // fine speckle / wear
  for (let i = 0; i < speck; i++) {
    const v = 120 + ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 90;
    x.fillStyle = `rgba(${v | 0},${(v - 8) | 0},${(v - 20) | 0},${0.05 + (i % 5) * 0.02})`;
    x.fillRect((Math.sin(i * 4.1) * 0.5 + 0.5) * S, (Math.cos(i * 7.7) * 0.5 + 0.5) * S, 1 + (i % 3), 1 + (i % 2));
  }
  // painted panel scratches / seams
  for (let i = 0; i < seams; i++) {
    x.strokeStyle = `rgba(40,38,32,${0.1 + (i % 4) * 0.04})`;
    x.lineWidth = 1 + (i % 2);
    x.beginPath();
    x.moveTo((i * 47) % S, (i * 71) % S);
    x.lineTo(((i * 47) % S) + 30 + (i % 5) * 14, ((i * 71) % S) + (i % 3) * 9);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

// crew face tones (skin / cheek hi-lo / hair / beard rgb / brow) — varies crew so they aren't clones
const FACE_TONES = [
  { skin: '#e6b487', hi: '#eec199', lo: '#c9966c', hair: '#43301f', beard: '58,40,26', brow: '#3a2716' },
  { skin: '#cf9a6c', hi: '#dcab7e', lo: '#a87a50', hair: '#2c2018', beard: '40,30,20', brow: '#241a12' },
  { skin: '#f0c89a', hi: '#f7d6ab', lo: '#d2a877', hair: '#5a3b22', beard: '74,50,30', brow: '#4a3018' },
  { skin: '#a9714a', hi: '#bd855c', lo: '#8a5736', hair: '#241a12', beard: '34,24,16', brow: '#1a120c' },
];
const hex2int = (h) => parseInt(h.slice(1), 16);

// painted scared bearded face — drawn straight onto the visor-facing panel
function faceMap(tone = FACE_TONES[0]) {
  if (typeof document === 'undefined') return null;
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  // skin base with soft cheek shading
  x.fillStyle = tone.skin; x.fillRect(0, 0, S, S);
  const cheek = x.createRadialGradient(128, 150, 20, 128, 150, 150);
  cheek.addColorStop(0, tone.hi); cheek.addColorStop(1, tone.lo);
  x.fillStyle = cheek; x.fillRect(0, 0, S, S);
  // hair — cap across the top
  x.fillStyle = tone.hair;
  x.beginPath();
  x.moveTo(36, 96); x.quadraticCurveTo(128, 8, 220, 96);
  x.quadraticCurveTo(208, 60, 128, 52); x.quadraticCurveTo(48, 60, 36, 96); x.fill();
  x.fillRect(28, 78, 18, 70); x.fillRect(210, 78, 18, 70);            // sideburns down
  // beard / stubble — darker around jaw + upper lip
  x.fillStyle = `rgba(${tone.beard},0.92)`;
  x.beginPath();
  x.moveTo(40, 150); x.quadraticCurveTo(40, 250, 128, 252);
  x.quadraticCurveTo(216, 250, 216, 150);
  x.quadraticCurveTo(196, 196, 128, 196); x.quadraticCurveTo(60, 196, 40, 150); x.fill();
  // stubble speckle on cheeks
  x.fillStyle = `rgba(${tone.beard},0.5)`;
  for (let i = 0; i < 320; i++) {
    const a = i * 2.39996, r = 58 + (i % 30);
    const px = 128 + Math.cos(a) * r, py = 168 + Math.sin(a) * r * 0.8;
    if (py > 120) x.fillRect(px, py, 1.4, 1.4);
  }
  // brows — raised + angled inward (worried)
  x.strokeStyle = tone.brow; x.lineWidth = 9; x.lineCap = 'round';
  x.beginPath(); x.moveTo(74, 116); x.lineTo(106, 104); x.stroke();
  x.beginPath(); x.moveTo(182, 116); x.lineTo(150, 104); x.stroke();
  // eyes — wide, whites showing (scared)
  for (const ex of [92, 164]) {
    x.fillStyle = '#f4efe6';
    x.beginPath(); x.ellipse(ex, 134, 21, 17, 0, 0, 7); x.fill();
    x.fillStyle = '#5b4a3a';
    x.beginPath(); x.arc(ex, 136, 8.5, 0, 7); x.fill();
    x.fillStyle = '#15110d';
    x.beginPath(); x.arc(ex, 136, 4.2, 0, 7); x.fill();
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(ex - 3, 132, 2.2, 0, 7); x.fill();
  }
  // nose
  x.strokeStyle = tone.lo; x.lineWidth = 6;
  x.beginPath(); x.moveTo(128, 138); x.lineTo(122, 168); x.lineTo(134, 170); x.stroke();
  // mouth — open gasp
  x.fillStyle = '#3a1612';
  x.beginPath(); x.ellipse(128, 196, 16, 13, 0, 0, 7); x.fill();
  x.fillStyle = '#d9b9a0'; x.beginPath(); x.ellipse(128, 190, 11, 4, 0, 0, 7); x.fill(); // top teeth hint
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeUnitAlpha(opts = {}) {
  const accent = opts.accent ?? 0xc0392b;     // red chest badge / shoulder flash
  const seated = !!opts.seated;               // capsule-crew sitting pose
  const tone = FACE_TONES[(opts.tone ?? 0) % FACE_TONES.length];
  const root = new THREE.Group();
  const rig = { body: null, head: null, arms: [], forearms: [], legs: [], shins: [] };

  const M = {
    suit:   new THREE.MeshStandardMaterial({ color: 0xd9d3c3, map: paintMap({ base: '#d9d3c3', blots: 8, speck: 300, seams: 10, repeat: 1.4 }), roughness: 0.92, metalness: 0.0, flatShading: true }),
    suit2:  new THREE.MeshStandardMaterial({ color: 0xe7e1d2, map: paintMap({ base: '#e7e1d2', blots: 6, speck: 220, seams: 6 }), roughness: 0.9, metalness: 0.0, flatShading: true }),
    joint:  new THREE.MeshStandardMaterial({ color: 0xb6ad98, roughness: 0.95, metalness: 0.0, flatShading: true }),
    panel:  new THREE.MeshStandardMaterial({ color: 0x8c877b, map: paintMap({ base: '#8c877b', dirt: '#6c675c', blots: 5, speck: 160, seams: 8 }), roughness: 0.78, metalness: 0.18, flatShading: true }),
    dark:   new THREE.MeshStandardMaterial({ color: 0x4a4843, roughness: 0.82, metalness: 0.2, flatShading: true }),
    glove:  new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.7, metalness: 0.16, flatShading: true }),
    bootSole: new THREE.MeshStandardMaterial({ color: 0x33312a, roughness: 0.9, metalness: 0.06, flatShading: true }),
    metal:  new THREE.MeshStandardMaterial({ color: 0xb7bab7, roughness: 0.4, metalness: 0.65, flatShading: true }),
    brass:  new THREE.MeshStandardMaterial({ color: 0xbf9a4a, roughness: 0.42, metalness: 0.7, flatShading: true }),
    hose:   new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.85, metalness: 0.1, flatShading: true }),
    accent: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.55, metalness: 0.05, flatShading: true }),
    amber:  new THREE.MeshStandardMaterial({ color: 0xffcf7a, emissive: 0xffab43, emissiveIntensity: 0.9, roughness: 0.4, flatShading: true }),
    cyan:   new THREE.MeshStandardMaterial({ color: 0x9eefff, emissive: 0x22d4ff, emissiveIntensity: 0.9, roughness: 0.3, flatShading: true }),
    skin:   new THREE.MeshStandardMaterial({ color: hex2int(tone.skin), roughness: 0.7, metalness: 0.0, flatShading: true }),
    hair:   new THREE.MeshStandardMaterial({ color: hex2int(tone.hair), roughness: 0.95, metalness: 0.0, flatShading: true }),
    face:   new THREE.MeshStandardMaterial({ map: faceMap(tone), roughness: 0.72, metalness: 0.0 }),
    visor:  new THREE.MeshPhysicalMaterial({ color: 0x0b1c24, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1.0, clearcoatRoughness: 0.06, emissive: 0x0c3a48, emissiveIntensity: 0.22 }),
    shell:  new THREE.MeshStandardMaterial({ color: 0xe7e1d2, roughness: 0.9, metalness: 0.0, flatShading: true, side: THREE.DoubleSide }),
    strap:  new THREE.MeshStandardMaterial({ color: 0x34322d, roughness: 0.82, metalness: 0.1, flatShading: true }),
    pouch:  new THREE.MeshStandardMaterial({ color: 0x8f8975, map: paintMap({ base: '#8f8975', dirt: '#6a6453', blots: 4, speck: 120, seams: 5 }), roughness: 0.92, metalness: 0.04, flatShading: true }),
    rib:    new THREE.MeshStandardMaterial({ color: 0xb0a892, roughness: 0.95, metalness: 0.0, flatShading: true }),
    olive:  new THREE.MeshStandardMaterial({ color: 0x5e6240, map: paintMap({ base: '#5e6240', dirt: '#43472b', blots: 4, speck: 120, seams: 5 }), roughness: 0.85, metalness: 0.1, flatShading: true }),
  };

  const mesh = (geo, m, par, x, y, z, rx, ry, rz, sx, sy, sz) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0);
    if (sx !== undefined) o.scale.set(sx, sy, sz);
    o.castShadow = o.receiveShadow = true; (par || root).add(o); return o;
  };
  // low-poly geometry helpers (intentionally few segments -> visible facets)
  const cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s);
  const cap = (r, l, s = 7) => new THREE.CapsuleGeometry(r, l, 2, s);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
  const sph = (r, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);
  const tor = (r, t, rs = 8, ts = 16) => new THREE.TorusGeometry(r, t, rs, ts);
  // horizontal rib ring around a vertical limb (pressure-suit accordion look)
  const ring = (par, mat, x, y, z, r, tube = 0.011, seg = 16) => mesh(tor(r, tube, 6, seg), mat, par, x, y, z, Math.PI / 2, 0, 0);
  // strapped equipment pouch (body + flap + strap + buckle)
  const pouch = (par, x, y, z, w = 0.1, h = 0.13, d = 0.07) => {
    mesh(box(w, h, d), M.pouch, par, x, y, z);
    mesh(box(w * 1.02, h * 0.4, d * 1.04), M.strap, par, x, y + h * 0.34, z + 0.003);  // flap
    mesh(box(w * 1.06, 0.016, d * 1.06), M.strap, par, x, y - h * 0.12, z);            // cinch strap
    mesh(box(0.016, 0.022, 0.012), M.metal, par, x, y + h * 0.32, z + d * 0.55);       // buckle
  };

  // ===== TORSO (slimmer barrel, panelled) =====
  const body = new THREE.Group(); body.position.set(0, 1.18, 0); root.add(body); rig.body = body;
  mesh(cyl(0.225, 0.255, 0.52, 9), M.suit, body, 0, 0.05, 0);             // chest barrel
  mesh(box(0.026, 0.46, 0.025), M.strap, body, 0, 0.05, 0.235);          // center chest seam
  mesh(cyl(0.255, 0.21, 0.16, 9), M.joint, body, 0, -0.26, 0);           // soft waist
  ring(body, M.strap, 0, -0.26, 0, 0.252, 0.022, 11);                    // utility belt
  mesh(box(0.07, 0.05, 0.03), M.metal, body, 0, -0.26, 0.245);           // belt buckle
  pouch(body, -0.18, -0.27, 0.14, 0.09, 0.12, 0.06);                     // belt pouch L
  pouch(body, 0.18, -0.27, 0.14, 0.09, 0.12, 0.06);                      // belt pouch R
  mesh(cyl(0.215, 0.235, 0.16, 9), M.suit, body, 0, -0.39, 0);           // hips
  // chest control box + red ID patch + lights
  mesh(box(0.21, 0.15, 0.07), M.panel, body, 0.025, 0.09, 0.215);        // control box
  mesh(box(0.012, 0.15, 0.072), M.strap, body, -0.085, 0.09, 0.216);     // box edge seam
  mesh(box(0.115, 0.08, 0.03), M.accent, body, -0.105, 0.18, 0.222);     // red ID patch (upper-left)
  mesh(box(0.092, 0.02, 0.012), M.suit2, body, -0.105, 0.165, 0.238);    // name strip
  mesh(box(0.072, 0.05, 0.02), M.dark, body, 0.075, 0.11, 0.262);        // screen bezel
  mesh(box(0.056, 0.036, 0.012), M.cyan, body, 0.075, 0.11, 0.273);
  mesh(box(0.022, 0.022, 0.02), M.amber, body, -0.02, 0.055, 0.268);     // status lights
  mesh(box(0.022, 0.022, 0.02), M.amber, body, 0.012, 0.055, 0.268);
  mesh(cyl(0.015, 0.015, 0.05, 8), M.metal, body, 0.06, 0.055, 0.268, Math.PI / 2, 0, 0); // dial
  // harness webbing: shoulders -> chest buckle
  mesh(box(0.045, 0.38, 0.028), M.strap, body, -0.1, 0.12, 0.2, 0.34, 0, 0.05);
  mesh(box(0.045, 0.38, 0.028), M.strap, body, 0.1, 0.12, 0.2, 0.34, 0, -0.05);
  mesh(box(0.085, 0.06, 0.03), M.metal, body, 0, -0.02, 0.235);          // chest buckle
  // shoulders (white pads + thin team flash + rib + clip)
  [-1, 1].forEach(s => {
    ring(body, M.rib, 0.255 * s, 0.21, 0, 0.084, 0.013, 12);            // shoulder accordion rib
    mesh(ico(0.115, 1), M.suit2, body, 0.265 * s, 0.28, 0);
    mesh(box(0.17, 0.11, 0.24), M.suit2, body, 0.275 * s, 0.31, 0, 0, 0, -0.2 * s);
    mesh(box(0.13, 0.026, 0.18), M.accent, body, 0.285 * s, 0.37, 0.01, 0, 0, -0.2 * s);
    mesh(box(0.05, 0.04, 0.06), M.strap, body, 0.33 * s, 0.27, 0.0);    // shoulder strap clip
  });

  // ===== LIFE-SUPPORT BACKPACK (panelled + side equipment box) =====
  const pack = new THREE.Group(); pack.position.set(0, 0.09, -0.26); body.add(pack);
  mesh(box(0.36, 0.5, 0.17), M.panel, pack, 0, 0, 0);                    // main body
  mesh(box(0.3, 0.42, 0.02), M.dark, pack, 0, 0, -0.085);                // recessed back panel
  mesh(box(0.022, 0.42, 0.05), M.strap, pack, -0.1, 0, -0.088);         // vertical seams
  mesh(box(0.022, 0.42, 0.05), M.strap, pack, 0.1, 0, -0.088);
  mesh(box(0.38, 0.14, 0.19), M.dark, pack, 0, 0.16, 0);                 // top block
  mesh(box(0.1, 0.05, 0.04), M.cyan, pack, -0.1, 0.16, -0.095);         // top status light
  mesh(box(0.26, 0.06, 0.04), M.accent, pack, 0, -0.18, -0.095);        // bottom accent
  [-1, 1].forEach(s => {
    mesh(cyl(0.06, 0.06, 0.44, 10), M.metal, pack, 0.105 * s, -0.02, -0.115);  // O2 tanks
    ring(pack, M.dark, 0.105 * s, 0.09, -0.115, 0.064, 0.012, 12);             // tank bands
    ring(pack, M.dark, 0.105 * s, -0.11, -0.115, 0.064, 0.012, 12);
    mesh(cyl(0.065, 0.065, 0.03, 10), M.brass, pack, 0.105 * s, 0.21, -0.115); // valves
    mesh(cyl(0.016, 0.016, 0.06, 8), M.hose, pack, 0.105 * s, 0.26, -0.115);
  });
  mesh(box(0.12, 0.22, 0.12), M.olive, pack, 0.235, -0.1, 0.0);          // side equipment box
  mesh(box(0.125, 0.03, 0.125), M.amber, pack, 0.235, 0.0, 0.0);         // its light strip
  mesh(box(0.122, 0.05, 0.122), M.strap, pack, 0.235, -0.2, 0.0);        // its base clamp
  mesh(cyl(0.007, 0.007, 0.32, 6), M.metal, pack, 0.14, 0.39, 0);        // antenna
  mesh(sph(0.016, 8, 6), M.accent, pack, 0.14, 0.56, 0);

  // ===== HEAD / HELMET =====
  const head = new THREE.Group(); head.position.set(0, 0.47, 0.02); body.add(head); rig.head = head;
  // segmented accordion neck collar
  mesh(cyl(0.115, 0.125, 0.1, 12), M.joint, head, 0, -0.12, 0);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; mesh(box(0.02, 0.092, 0.022), M.rib, head, Math.cos(a) * 0.124, -0.12, Math.sin(a) * 0.124, 0, -a, 0); }
  mesh(cyl(0.15, 0.15, 0.035, 16), M.metal, head, 0, -0.05, 0);                  // seal ring
  // face inside the bubble
  const face = new THREE.Group(); face.position.set(0, 0.05, 0.05); head.add(face);
  mesh(sph(0.135, 12, 10), M.skin, face, 0, 0, 0, 0, 0, 0, 1, 1.06, 0.9);        // head mass
  mesh(box(0.185, 0.17, 0.02), M.face, face, 0, 0.0, 0.118);                     // painted face panel
  mesh(sph(0.135, 12, 10), M.hair, face, 0, 0.03, -0.01, 0, 0, 0, 1.02, 1.0, 0.92);
  mesh(box(0.18, 0.08, 0.18), M.hair, face, 0, 0.1, -0.02);
  // helmet: faceted glass dome + open-face WHITE SHELL (closed back/top, framed front window)
  const shell = mesh(sph(0.238, 20, 16), M.shell, head, 0, 0.04, 0);
  shell.geometry = new THREE.SphereGeometry(0.238, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.72);
  shell.rotation.x = -Math.PI * 0.5;                                             // open window faces forward
  mesh(ico(0.235, 2), M.visor, head, 0, 0.04, 0);                               // faceted glass dome
  mesh(tor(0.166, 0.012, 8, 24), M.brass, head, 0, -0.075, 0.06, Math.PI / 2 - 0.18, 0, 0); // brass visor trim
  mesh(box(0.24, 0.06, 0.05), M.suit2, head, 0, -0.11, 0.17);                   // chin guard
  // helmet hardware
  mesh(box(0.06, 0.05, 0.06), M.shell, head, -0.185, 0.09, 0.0);                // side comm box L
  mesh(box(0.028, 0.02, 0.02), M.amber, head, -0.215, 0.09, 0.03);
  mesh(box(0.055, 0.035, 0.05), M.dark, head, 0.185, 0.13, 0.06);               // helmet lamp housing R
  mesh(box(0.038, 0.022, 0.02), M.amber, head, 0.205, 0.13, 0.085);            // lamp lens
  mesh(cyl(0.006, 0.006, 0.14, 6), M.metal, head, 0.12, 0.28, -0.06, 0.22, 0, 0.12); // antenna
  mesh(sph(0.013, 6, 5), M.accent, head, 0.148, 0.35, -0.075);
  mesh(box(0.14, 0.03, 0.13), M.suit2, head, 0, 0.205, -0.05);                  // top crest seam

  // hoses helmet -> pack
  [-1, 1].forEach(s => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.11 * s, 1.52, 0.04),
      new THREE.Vector3(0.17 * s, 1.38, -0.16),
      new THREE.Vector3(0.11 * s, 1.22, -0.3),
    ]);
    const h = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.017, 6, false), M.hose);
    h.castShadow = h.receiveShadow = true; root.add(h);
  });

  // ===== ARMS (ribbed pressure-suit joints) =====
  function arm(side) {
    const g = new THREE.Group(); g.position.set(0.275 * side, 0.29, 0); body.add(g);  // body-local shoulder
    g.rotation.z = side * 0.2; g.rotation.x = seated ? -0.5 : 0.1;
    mesh(cap(0.076, 0.22), M.suit, g, 0, -0.2, 0);                              // upper arm
    ring(g, M.rib, 0, -0.12, 0, 0.082, 0.012, 14);                             // bicep ribs
    ring(g, M.rib, 0, -0.2, 0, 0.082, 0.012, 14);
    mesh(cyl(0.08, 0.08, 0.03, 12), M.joint, g, 0, -0.31, 0);                  // elbow accordion
    mesh(cyl(0.083, 0.083, 0.03, 12), M.rib, g, 0, -0.345, 0);
    const fore = new THREE.Group(); fore.position.set(0, -0.38, 0.0); g.add(fore);
    fore.rotation.x = seated ? -0.95 : -0.3;
    mesh(cap(0.07, 0.18), M.suit, fore, 0, -0.16, 0);                          // forearm
    ring(fore, M.rib, 0, -0.1, 0, 0.075, 0.011, 14);                          // forearm rib
    mesh(cyl(0.075, 0.075, 0.04, 10), M.dark, fore, 0, -0.28, 0);              // glove cuff
    mesh(box(0.13, 0.14, 0.115), M.glove, fore, 0, -0.37, 0.02);              // mitt glove
    mesh(box(0.048, 0.085, 0.095), M.glove, fore, 0.075 * side, -0.35, 0.04); // thumb mass
    mesh(box(0.11, 0.018, 0.1), M.strap, fore, 0, -0.34, 0.04);               // knuckle seam
    mesh(box(0.11, 0.05, 0.02), M.dark, fore, 0, -0.38, 0.082);               // finger split
    rig.arms.push({ side, group: g }); rig.forearms.push({ side, group: fore });
  }
  arm(-1); arm(1);

  // ===== LEGS (ribbed joints + thigh cargo pouch + detailed boot) =====
  function leg(side) {
    const g = new THREE.Group(); g.position.set(0.125 * side, 0.8, 0); root.add(g);
    g.rotation.x = seated ? -1.5 : 0;                                          // sit: thighs forward
    mesh(cap(0.096, 0.28), M.suit, g, 0, -0.22, 0);                            // thigh
    ring(g, M.rib, 0, -0.12, 0, 0.102, 0.013, 14);                           // thigh ribs
    ring(g, M.rib, 0, -0.22, 0, 0.1, 0.013, 14);
    pouch(g, 0.105 * side, -0.2, 0.04, 0.1, 0.14, 0.06);                       // thigh cargo pouch
    mesh(box(0.15, 0.12, 0.07), M.panel, g, 0.005 * side, -0.32, 0.075);       // knee pad
    mesh(cyl(0.097, 0.097, 0.03, 12), M.joint, g, 0, -0.4, 0);                 // knee accordion
    mesh(cyl(0.1, 0.1, 0.03, 12), M.rib, g, 0, -0.435, 0);
    const shin = new THREE.Group(); shin.position.set(0, -0.47, 0); g.add(shin);
    shin.rotation.x = seated ? 1.55 : 0;                                       // sit: shins down
    mesh(cap(0.083, 0.2), M.suit, shin, 0, -0.15, 0);                          // shin
    ring(shin, M.rib, 0, -0.08, 0, 0.088, 0.012, 14);                        // shin rib
    mesh(cyl(0.092, 0.105, 0.06, 10), M.dark, shin, 0, -0.29, 0);             // boot ankle cuff
    mesh(box(0.15, 0.13, 0.21), M.suit2, shin, 0, -0.37, 0.02);               // boot upper
    mesh(box(0.155, 0.05, 0.16), M.accent, shin, 0, -0.31, 0.06);             // boot strap accent
    mesh(box(0.175, 0.07, 0.3), M.bootSole, shin, 0, -0.44, 0.05);           // boot sole
    mesh(box(0.18, 0.035, 0.31), M.dark, shin, 0, -0.475, 0.05);             // tread base
    mesh(box(0.165, 0.05, 0.12), M.bootSole, shin, 0, -0.4, 0.17);           // toe box
    mesh(box(0.16, 0.06, 0.06), M.bootSole, shin, 0, -0.42, -0.085);         // heel
    rig.legs.push({ side, group: g }); rig.shins.push({ side, group: shin });
  }
  leg(-1); leg(1);

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // drop feet to y=0
  const bb = new THREE.Box3().setFromObject(root); const dy = -bb.min.y;
  if (isFinite(dy)) root.children.forEach(c => c.position.y += dy);

  root.userData.accent = accent;
  root.userData.seated = seated;
  root.userData.rig = rig;
  root.userData.animBase = captureBase(rig);
  return root;
}

// ===== rolling transport case (the AU-01 hero prop) =====
export function makeTransportCase() {
  const root = new THREE.Group();
  const M = {
    body:  new THREE.MeshStandardMaterial({ color: 0x76794a, map: paintMap({ base: '#76794a', dirt: '#565937', crevice: '#42452a', blots: 6, speck: 200, seams: 6 }), roughness: 0.84, metalness: 0.1, flatShading: true }),
    panel: new THREE.MeshStandardMaterial({ color: 0x53562f, roughness: 0.8, metalness: 0.14, flatShading: true }),
    bumper:new THREE.MeshStandardMaterial({ color: 0x2f2f2b, roughness: 0.78, metalness: 0.2, flatShading: true }),
    yellow:new THREE.MeshStandardMaterial({ color: 0xd9b53a, roughness: 0.6, metalness: 0.1, flatShading: true }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.4, metalness: 0.7, flatShading: true }),
    rubber:new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.9, metalness: 0.05, flatShading: true }),
  };
  const mesh = (geo, m, x, y, z, rx, ry, rz) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0);
    o.castShadow = o.receiveShadow = true; root.add(o); return o;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (a, b, h, s = 12) => new THREE.CylinderGeometry(a, b, h, s);

  const W = 0.34, H = 0.6, D = 0.26;
  // body as base + lid with a metal seam lip
  mesh(box(W, H * 0.58, D), M.body, 0, H * 0.29, 0);                     // base
  mesh(box(W, H * 0.42, D), M.body, 0, H * 0.79, 0);                     // lid
  mesh(box(W * 1.03, 0.028, D * 1.03), M.metal, 0, H * 0.58, 0);         // seam lip
  // dark recessed front + back panels with metal ribs
  for (const sz of [1, -1]) {
    mesh(box(W * 0.78, H * 0.84, 0.014), M.bumper, 0, H * 0.5, sz * (D / 2 + 0.006));
    for (const sx of [-1, 1]) mesh(box(0.018, H * 0.8, 0.02), M.metal, sx * W * 0.3, H * 0.5, sz * (D / 2 + 0.013));
  }
  // hazard stripes near the top + bottom edges
  mesh(box(W * 1.05, 0.034, D * 1.05), M.yellow, 0, H * 0.13, 0);
  mesh(box(W * 1.05, 0.034, D * 1.05), M.yellow, 0, H * 0.9, 0);
  // corner bumpers + bolt heads
  for (const sx of [-1, 1]) for (const sy of [0.035, 0.965]) for (const sz of [-1, 1]) {
    mesh(box(0.055, 0.07, 0.055), M.bumper, sx * W / 2, H * sy, sz * D / 2);
    mesh(cyl(0.008, 0.008, 0.02, 6), M.metal, sx * W / 2, H * sy, sz * (D / 2) + sz * 0.01, Math.PI / 2, 0, 0);
  }
  // front latches
  for (const sx of [-1, 1]) {
    mesh(box(0.06, 0.055, 0.028), M.metal, sx * 0.09, H * 0.58, D / 2 + 0.018);
    mesh(box(0.05, 0.022, 0.02), M.bumper, sx * 0.09, H * 0.55, D / 2 + 0.024);
  }
  // front label plate
  mesh(box(0.16, 0.085, 0.012), M.panel, 0, H * 0.68, D / 2 + 0.012);
  mesh(box(0.13, 0.045, 0.006), M.amber, 0, H * 0.68, D / 2 + 0.02);
  // side carry handle
  mesh(box(0.022, 0.022, 0.14), M.metal, W / 2 + 0.018, H * 0.62, 0);
  for (const sz of [-1, 1]) mesh(box(0.022, 0.06, 0.022), M.metal, W / 2 + 0.018, H * 0.65, sz * 0.06);
  // top grab handle
  mesh(box(0.14, 0.03, 0.05), M.bumper, 0, H + 0.02, 0);
  // telescoping pull handle
  const hY = H + 0.34;
  for (const sx of [-1, 1]) mesh(cyl(0.012, 0.012, 0.4, 8), M.metal, sx * 0.12, H + 0.18, -D / 2 + 0.03);
  mesh(box(0.3, 0.032, 0.032), M.metal, 0, hY, -D / 2 + 0.03);
  mesh(box(0.32, 0.022, 0.022), M.bumper, 0, hY + 0.01, -D / 2 + 0.03);    // grip
  // wheels with hubcaps
  for (const sx of [-1, 1]) {
    mesh(cyl(0.05, 0.05, 0.04, 14), M.rubber, sx * (W / 2 - 0.03), 0.05, -D / 2 + 0.04, 0, 0, Math.PI / 2);
    mesh(cyl(0.024, 0.024, 0.045, 10), M.metal, sx * (W / 2 - 0.03), 0.05, -D / 2 + 0.04, 0, 0, Math.PI / 2);
  }
  root.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  return root;
}

// ---- lightweight idle/walk animation (so the test unit breathes) ----
function captureNode(entry) {
  const group = entry.group ?? entry;
  return { side: entry.side ?? 0, group, position: group.position.clone(), rotation: group.rotation.clone() };
}
function captureBase(rig) {
  return {
    body: captureNode(rig.body), head: captureNode(rig.head),
    arms: rig.arms.map(captureNode), forearms: rig.forearms.map(captureNode),
    legs: rig.legs.map(captureNode), shins: rig.shins.map(captureNode),
  };
}
function restoreNode(s) { s.group.position.copy(s.position); s.group.rotation.copy(s.rotation); }
function restoreBase(b) {
  restoreNode(b.body); restoreNode(b.head);
  b.arms.forEach(restoreNode); b.forearms.forEach(restoreNode);
  b.legs.forEach(restoreNode); b.shins.forEach(restoreNode);
}

export function animateUnitAlpha(root, mode = 'idle', t = 0, amount = 1) {
  const rig = root?.userData?.rig, base = root?.userData?.animBase;
  if (!rig || !base || root.userData.seated) return;   // seated crew hold their pose
  const k = THREE.MathUtils.clamp(amount, 0, 1);
  restoreBase(base);
  rig.body.position.y += Math.sin(t * 2.0) * 0.01 * k;
  rig.body.rotation.z += Math.sin(t * 1.3) * 0.01 * k;
  rig.head.rotation.y += Math.sin(t * 1.6) * 0.04 * k;
  rig.head.rotation.x += Math.sin(t * 0.9) * 0.02 * k;
  if (mode === 'walk' || mode === 'run') {
    const speed = mode === 'run' ? 8.5 : 5.0, stride = mode === 'run' ? 0.7 : 0.42, swing = mode === 'run' ? 0.8 : 0.46;
    const cyc = t * speed;
    rig.body.position.y += (0.5 + 0.5 * Math.sin(cyc * 2)) * (mode === 'run' ? 0.05 : 0.03) * k;
    rig.body.rotation.x += (mode === 'run' ? -0.14 : -0.05) * k;
    rig.legs.forEach(({ side, group }) => { group.rotation.x += Math.sin(cyc + (side > 0 ? Math.PI : 0)) * stride * k; });
    rig.shins.forEach(({ side, group }) => { group.rotation.x += Math.max(0, -Math.sin(cyc + (side > 0 ? Math.PI : 0))) * (mode === 'run' ? 0.85 : 0.5) * k; });
    rig.arms.forEach(({ side, group }) => { group.rotation.x += -Math.sin(cyc + (side > 0 ? Math.PI : 0)) * swing * k; });
    rig.forearms.forEach(({ group }) => { group.rotation.x += -0.2 * k; });
  } else if (mode === 'attack') {
    const phase = (t * 1.25) % 1;
    const wind = THREE.MathUtils.clamp(phase / 0.34, 0, 1);
    const strike = Math.max(0, 1 - Math.abs(phase - 0.52) / 0.3);
    rig.body.rotation.y += (-0.22 * wind + 0.34 * strike) * k;
    rig.body.rotation.x += (-0.06 - 0.1 * strike) * k;
    rig.head.rotation.x += -0.12 * strike * k;
    rig.arms.forEach(({ side, group }) => {
      if (side > 0) { group.rotation.x += (-0.7 - 1.35 * strike - 0.4 * wind) * k; group.rotation.z += side * -0.22 * k; }
      else { group.rotation.x += (-0.2 + 0.34 * wind) * k; group.rotation.z += side * 0.18 * k; }
    });
    rig.forearms.forEach(({ side, group }) => { group.rotation.x += (side > 0 ? -0.5 - 0.85 * strike : -0.34) * k; });
    rig.legs.forEach(({ side, group }) => { group.rotation.x += (side > 0 ? -0.2 : 0.16) * (wind + strike) * k; });
  }
}

// API-compatible aliases so units_alpha.js is a drop-in replacement for units.js
export { makeUnitAlpha as makeAstronaut, animateUnitAlpha as animateAstronaut };
