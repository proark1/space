// SIGNAL LOST — shared player/unit models.
// makeAstronaut() returns a polished cinematic rescue-suit crew member:
// rounded helmet, readable visor face, reinforced plates, backpack tanks,
// heavy gloves/boots, team-color panels. Used for capsule crew, in-game players, and /units.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function makeAstronaut(opts = {}) {
  const accent = opts.accent ?? 0xc8552f;   // subtle team / player accent
  const seated = !!opts.seated;
  const expression = opts.expression ?? (seated ? 'worried' : 'focused');
  const makeScuffMap = (base, speck = 900) => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < speck; i++) {
      const v = 130 + ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 70;
      const a = 0.035 + Math.abs(Math.sin(i * 78.233)) * 0.08;
      x.fillStyle = `rgba(${v|0},${v|0},${v|0},${a})`;
      x.fillRect((Math.sin(i * 4.1) * 0.5 + 0.5) * 512, (Math.cos(i * 7.7) * 0.5 + 0.5) * 512, 1 + (i % 4), 1 + ((i * 3) % 3));
    }
    for (let i = 0; i < 34; i++) {
      x.strokeStyle = `rgba(20,22,24,${0.06 + (i % 5) * 0.018})`;
      x.lineWidth = 1 + (i % 3);
      x.beginPath();
      x.moveTo((i * 37) % 512, (i * 61) % 512);
      x.lineTo(((i * 37) % 512) + 34 + (i % 4) * 18, ((i * 61) % 512) + 2 + (i % 2) * 10);
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2.2, 2.2);
    return t;
  };
  const suitMap = makeScuffMap('#ded8c9', 1200);
  const whiteMap = makeScuffMap('#f4eee0', 850);
  const panelMap = makeScuffMap('#9b9a91', 700);
  const M = {
    suit:  new THREE.MeshPhysicalMaterial({ color: 0xded8c9, map: suitMap, roughness: 0.48, metalness: 0.04, clearcoat: 0.22, clearcoatRoughness: 0.5 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xf4eee0, map: whiteMap, roughness: 0.38, metalness: 0.04, clearcoat: 0.32, clearcoatRoughness: 0.34 }),
    panel: new THREE.MeshPhysicalMaterial({ color: 0x9b9a91, map: panelMap, roughness: 0.54, metalness: 0.26, clearcoat: 0.18, clearcoatRoughness: 0.44 }),
    seam:  new THREE.MeshStandardMaterial({ color: 0x171411, roughness: 0.74, metalness: 0.1 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x061018, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.54, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1.0, clearcoatRoughness: 0.025, emissive: 0x0e3f50, emissiveIntensity: 0.36 }),
    facePanel: new THREE.MeshStandardMaterial({ color: 0x20150f, roughness: 0.56, metalness: 0.04, emissive: 0x2e1a0d, emissiveIntensity: 0.8 }),
    skin:  new THREE.MeshStandardMaterial({ color: opts.faceTone ?? 0xffbd78, roughness: 0.42, metalness: 0.02, emissive: 0xff9c4a, emissiveIntensity: 0.18 }),
    eye:   new THREE.MeshStandardMaterial({ color: 0xfff3d6, roughness: 0.35, metalness: 0.02, emissive: 0xffdf9b, emissiveIntensity: 0.22 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x16110e, roughness: 0.5, metalness: 0.02 }),
    mouth: new THREE.MeshStandardMaterial({ color: 0x2a110d, roughness: 0.5, metalness: 0.02 }),
    brow:  new THREE.MeshStandardMaterial({ color: 0x4a2a16, roughness: 0.48, metalness: 0.02 }),
    lightAmber: new THREE.MeshStandardMaterial({ color: 0xffd891, roughness: 0.34, metalness: 0.02, emissive: 0xffb453, emissiveIntensity: 1.0 }),
    lightCyan:  new THREE.MeshStandardMaterial({ color: 0x9eefff, roughness: 0.24, metalness: 0.04, emissive: 0x28d7ff, emissiveIntensity: 1.1 }),
    boot:  new THREE.MeshPhysicalMaterial({ color: 0x73726c, roughness: 0.58, metalness: 0.22, clearcoat: 0.14, clearcoatRoughness: 0.5 }),
    glove: new THREE.MeshPhysicalMaterial({ color: 0x15161a, roughness: 0.5,  metalness: 0.2, clearcoat: 0.2, clearcoatRoughness: 0.35 }),
    metal: new THREE.MeshPhysicalMaterial({ color: 0xb7bab7, roughness: 0.28, metalness: 0.62, clearcoat: 0.28, clearcoatRoughness: 0.2 }),
    hose:  new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.82, metalness: 0.08 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9eefff, roughness: 0.035, metalness: 0.1, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1.0, clearcoatRoughness: 0.015, emissive: 0x1aa6c8, emissiveIntensity: 0.16 }),
    accent:new THREE.MeshPhysicalMaterial({ color: accent,   roughness: 0.42, metalness: 0.18, clearcoat: 0.35, clearcoatRoughness: 0.22, emissive: accent, emissiveIntensity: 0.08 }),
  };
  const root = new THREE.Group();
  const rig = { body: null, head: null, arms: [], forearms: [], legs: [], shins: [] };
  const mesh = (geo, m, par, x, y, z, rx, ry, rz, sx, sy, sz) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0);
    if (sx !== undefined) o.scale.set(sx, sy, sz);
    o.castShadow = o.receiveShadow = true; (par || root).add(o); return o;
  };
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 14, 36);
  const cyl = (a, b, h, s) => new THREE.CylinderGeometry(a, b, h, s || 48);
  const sph = (r) => new THREE.SphereGeometry(r, 48, 32);
  const box = (w, h, d, r = 0.02, s = 6) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w * 0.25, h * 0.25, d * 0.25));
  const torus = (r, tube, rs = 18, ts = 72) => new THREE.TorusGeometry(r, tube, rs, ts);
  const circle = (r, s = 32) => new THREE.CircleGeometry(r, s);

  // ---- torso (chunky rescue armour) ----
  const body = new THREE.Group(); root.add(body);
  rig.body = body;
  mesh(cyl(0.235, 0.28, 0.54), M.suit, body, 0, 1.17, 0);              // barrel chest
  mesh(box(0.42, 0.34, 0.12, 0.026, 5), M.panel, body, 0, 1.23, 0.22, -0.12, 0, 0);
  mesh(box(0.2, 0.1, 0.045, 0.014, 4), M.accent, body, 0, 1.33, 0.295, -0.12, 0, 0);
  mesh(box(0.085, 0.07, 0.022, 0.01, 3), M.glass, body, -0.12, 1.2, 0.292, -0.12, 0, 0);
  mesh(box(0.022, 0.022, 0.016, 0.006, 2), M.lightAmber, body, 0.08, 1.22, 0.3, -0.12, 0, 0);
  mesh(box(0.022, 0.022, 0.016, 0.006, 2), M.lightAmber, body, 0.125, 1.22, 0.3, -0.12, 0, 0);
  mesh(box(0.03, 0.44, 0.035, 0.01, 3), M.seam, body, 0, 1.14, 0.295);
  mesh(box(0.13, 0.055, 0.036, 0.012, 4), M.metal, body, -0.13, 1.07, 0.306, -0.12, 0, 0);
  mesh(box(0.09, 0.035, 0.038, 0.01, 3), M.lightCyan, body, -0.13, 1.075, 0.329, -0.12, 0, 0);
  mesh(box(0.12, 0.045, 0.036, 0.012, 4), M.seam, body, 0.13, 1.06, 0.306, -0.12, 0, 0);
  mesh(cyl(0.255, 0.23, 0.09), M.panel, body, 0, 0.85, 0);             // utility waist ring
  mesh(cyl(0.23, 0.2, 0.22), M.suit, body, 0, 0.72, 0);                // hips
  mesh(box(0.18, 0.1, 0.1), M.panel, body, -0.16, 0.82, 0.22);         // belt pouches
  mesh(box(0.18, 0.1, 0.1), M.panel, body,  0.16, 0.82, 0.22);
  mesh(box(0.32, 0.5, 0.15, 0.03, 5), M.panel, body, 0, 1.2, -0.25);   // life-support pack
  mesh(cyl(0.055, 0.055, 0.5, 24), M.metal, body, -0.18, 1.2, -0.33);
  mesh(cyl(0.055, 0.055, 0.5, 24), M.metal, body,  0.18, 1.2, -0.33);
  mesh(cyl(0.058, 0.058, 0.018, 24), M.accent, body, -0.18, 1.48, -0.33);
  mesh(cyl(0.058, 0.058, 0.018, 24), M.accent, body,  0.18, 1.48, -0.33);
  mesh(box(0.22, 0.08, 0.038, 0.012, 4), M.metal, body, 0, 1.44, -0.345);
  mesh(cyl(0.018, 0.018, 0.08, 18), M.hose, body, -0.07, 1.44, -0.39, Math.PI / 2, 0, 0);
  mesh(cyl(0.018, 0.018, 0.08, 18), M.hose, body,  0.07, 1.44, -0.39, Math.PI / 2, 0, 0);
  [-1, 1].forEach(s => {                                              // broad angular shoulders
    mesh(sph(0.112), M.suit, body, 0.285 * s, 1.43, 0);
    mesh(box(0.27, 0.13, 0.3, 0.03, 5), M.panel, body, 0.31 * s, 1.47, 0, 0, 0, -0.22 * s);
    mesh(box(0.15, 0.045, 0.23, 0.012, 4), M.accent, body, 0.32 * s, 1.5, 0.02, 0, 0, -0.22 * s);
  });
  mesh(box(0.035, 0.45, 0.04), M.seam, body, 0, 1.17, -0.34);          // back spine seam
  [-1, 1].forEach(s => {
    [0.98, 1.16, 1.34].forEach(y => mesh(cyl(0.012, 0.012, 0.011, 16), M.metal, body, 0.19 * s, y, 0.292, Math.PI / 2, 0, 0));
  });

  // ---- helmet (big faceted fishbowl with a tiny anxious face) ----
  const head = new THREE.Group(); head.position.set(0, 1.62, 0); body.add(head);
  rig.head = head;
  mesh(cyl(0.11, 0.125, 0.1), M.white, head, 0, -0.08, 0);              // neck collar
  mesh(cyl(0.155, 0.155, 0.04), M.metal, head, 0, -0.025, 0);           // neck ring trim
  mesh(sph(0.225), M.white, head, 0, 0.095, 0, 0, 0, 0, 1.12, 1.02, 1.05);
  mesh(box(0.13, 0.055, 0.06, 0.015, 4), M.panel, head, -0.11, 0.265, 0.025, 0.05, 0, 0.14);
  mesh(box(0.13, 0.055, 0.06, 0.015, 4), M.panel, head,  0.11, 0.265, 0.025, 0.05, 0, -0.14);
  mesh(box(0.19, 0.035, 0.06, 0.014, 4), M.accent, head, 0, 0.287, 0.025);
  mesh(sph(0.2), M.visor, head, 0, 0.085, 0.09, 0, 0, 0, 1.2, 0.88, 0.7);
  mesh(torus(0.17, 0.012), M.metal, head, 0, 0.088, 0.218, 0, 0, 0, 1.32, 0.78, 1);
  mesh(sph(0.185), M.glass, head, 0, 0.088, 0.126, 0, 0, 0, 1.22, 0.82, 0.56);
  mesh(torus(0.194, 0.008), M.white, head, 0, 0.09, 0.05, Math.PI / 2, 0, 0, 1.04, 1.0, 0.72);
  mesh(box(0.28, 0.055, 0.035, 0.016, 4), M.white, head, 0, -0.05, 0.225); // chin guard
  const face = new THREE.Group(); face.position.set(0, 0.095, 0.24); head.add(face);
  mesh(box(0.205, 0.145, 0.018, 0.022, 6), M.facePanel, face, 0, 0.01, -0.008);
  mesh(sph(0.087), M.skin, face, 0, 0.008, 0, 0, 0, 0, 1.14, 1.08, 0.18);
  [-1, 1].forEach(s => {
    mesh(circle(0.022, 28), M.eye, face, 0.045 * s, 0.03, 0.021, 0, 0, 0, 1.16, 0.82, 1);
    mesh(circle(0.009, 18), M.pupil, face, 0.049 * s, 0.027, 0.023);
    const browTilt = expression === 'worried' ? 0.2 * s : expression === 'attack' ? -0.24 * s : -0.12 * s;
    mesh(box(0.047, 0.008, 0.009, 0.003, 2), M.brow, face, 0.045 * s, 0.058, 0.024, 0, 0, browTilt);
    mesh(circle(0.01, 16), M.lightAmber, face, 0.083 * s, -0.018, 0.022, 0, 0, 0, 1.0, 0.55, 1);
  });
  mesh(box(0.016, 0.027, 0.009, 0.005, 3), M.brow, face, 0, -0.002, 0.022);
  if (expression === 'attack' || expression === 'focused') {
    mesh(box(0.072, 0.012, 0.011, 0.005, 3), M.mouth, face, 0, -0.045, 0.024, 0, 0, expression === 'attack' ? -0.08 : 0);
  } else {
    mesh(circle(0.018, 24), M.mouth, face, 0, -0.044, 0.024, 0, 0, 0, 1.25, 0.82, 1);
  }
  mesh(box(0.045, 0.025, 0.045, 0.008, 3), M.accent, head, 0.155, 0.16, 0.11); // helmet ID block
  mesh(circle(0.012, 18), M.lightCyan, head, -0.155, 0.16, 0.132, 0, 0, 0, 1, 1, 1);
  mesh(cyl(0.009, 0.009, 0.18, 12), M.metal, head, -0.17, 0.22, -0.06, 0, 0, 0.36);
  [-1, 1].forEach(s => {
    mesh(cyl(0.034, 0.034, 0.03, 24), M.metal, head, 0.205 * s, 0.085, 0.01, 0, 0, Math.PI / 2);
    mesh(cyl(0.022, 0.022, 0.036, 20), M.hose, head, 0.219 * s, 0.085, 0.01, 0, 0, Math.PI / 2);
  });

  // ---- arms (stubby, heavy gloves) ----
  function arm(side) {
    const g = new THREE.Group(); g.position.set(0.31 * side, 1.38, 0); body.add(g);
    g.rotation.z = side * 0.16; g.rotation.x = seated ? -0.6 : 0.08;
    mesh(cap(0.083, 0.28), M.suit, g, 0, -0.23, 0);
    mesh(box(0.065, 0.09, 0.024), M.accent, g, 0.07 * side, -0.18, 0.055);
    mesh(box(0.018, 0.26, 0.02), M.seam, g, 0.083 * side, -0.25, 0.03);
    const fore = new THREE.Group(); fore.position.set(0.02 * side, -0.45, 0.02); g.add(fore);
    fore.rotation.x = seated ? -1.04 : -0.12;
    mesh(cyl(0.082, 0.082, 0.055), M.panel, fore, 0, 0, 0);
    mesh(cap(0.073, 0.25), M.suit, fore, 0, -0.19, 0.02);
    mesh(cyl(0.079, 0.079, 0.048), M.panel, fore, 0, -0.34, 0.02);
    mesh(box(0.125, 0.14, 0.095, 0.024, 5), M.glove, fore, 0.01 * side, -0.45, 0.045);
    mesh(box(0.025, 0.06, 0.055, 0.006, 2), M.seam, fore, 0.075 * side, -0.42, 0.09);
    [-1.5, -0.5, 0.5, 1.5].forEach((f) => mesh(cyl(0.011, 0.01, 0.075, 14), M.glove, fore, (0.02 * f + 0.018 * side), -0.525, 0.11, Math.PI / 2, 0, 0));
    mesh(cyl(0.013, 0.012, 0.07, 14), M.glove, fore, -0.052 * side, -0.5, 0.08, 1.1, 0.32 * side, 0);
    rig.arms.push({ side, group: g });
    rig.forearms.push({ side, group: fore });
    return g;
  }
  arm(-1); arm(1);

  // ---- legs (wide stance) + oversized boots ----
  function leg(side) {
    const g = new THREE.Group(); g.position.set(0.135 * side, 0.78, 0); root.add(g);
    g.rotation.x = seated ? -1.5 : 0;
    mesh(cap(0.102, 0.36), M.suit, g, 0, -0.27, 0);
    mesh(box(0.13, 0.16, 0.06), M.panel, g, 0.02 * side, -0.3, 0.075);
    mesh(box(0.017, 0.34, 0.016), M.seam, g, 0.085 * side, -0.28, 0.035);
    const shin = new THREE.Group(); shin.position.set(0, -0.58, 0); g.add(shin);
    shin.rotation.x = seated ? 1.55 : 0;
    mesh(cyl(0.102, 0.102, 0.06), M.panel, shin, 0, 0, 0);
    mesh(cap(0.083, 0.31), M.suit, shin, 0, -0.22, 0);
    mesh(cyl(0.1, 0.115, 0.25), M.boot, shin, 0, -0.38, 0);
    mesh(box(0.19, 0.12, 0.34, 0.025, 5), M.boot, shin, 0, -0.53, 0.1);
    mesh(box(0.19, 0.045, 0.13, 0.012, 3), M.seam, shin, 0, -0.595, 0.22);
    mesh(box(0.13, 0.035, 0.08, 0.01, 3), M.accent, shin, 0, -0.42, 0.115);
    mesh(box(0.205, 0.035, 0.38, 0.012, 3), M.seam, shin, 0, -0.61, 0.1);
    mesh(box(0.075, 0.028, 0.03, 0.006, 2), M.metal, shin, 0.055 * side, -0.46, 0.18);
    rig.legs.push({ side, group: g });
    rig.shins.push({ side, group: shin });
    return g;
  }
  leg(-1); leg(1);

  // Low-pressure hoses from helmet to backpack: cheap silhouette detail that reads in dark shots.
  [-1, 1].forEach(s => {
    const hose = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.09 * s, 1.52, -0.02),
        new THREE.Vector3(0.22 * s, 1.42, -0.16),
        new THREE.Vector3(0.19 * s, 1.26, -0.32),
      ]), 18, 0.018, 10, false),
      M.hose
    );
    hose.castShadow = hose.receiveShadow = true;
    root.add(hose);
  });

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // recenter so the lowest point (feet standing / folded legs seated) sits at y = 0
  const bb = new THREE.Box3().setFromObject(root); const dy = -bb.min.y;
  if (isFinite(dy)) root.children.forEach(c => c.position.y += dy);
  root.userData.accent = accent;
  root.userData.seated = seated;
  root.userData.rig = rig;
  root.userData.animBase = captureAstronautBase(rig);
  return root;
}

function captureNodeBase(entry) {
  const group = entry.group ?? entry;
  return {
    side: entry.side ?? 0,
    group,
    position: group.position.clone(),
    rotation: group.rotation.clone(),
  };
}

function captureAstronautBase(rig) {
  return {
    body: captureNodeBase(rig.body),
    head: captureNodeBase(rig.head),
    arms: rig.arms.map(captureNodeBase),
    forearms: rig.forearms.map(captureNodeBase),
    legs: rig.legs.map(captureNodeBase),
    shins: rig.shins.map(captureNodeBase),
  };
}

function restoreNodeBase(state) {
  state.group.position.copy(state.position);
  state.group.rotation.copy(state.rotation);
}

function restoreAstronautBase(base) {
  restoreNodeBase(base.body);
  restoreNodeBase(base.head);
  base.arms.forEach(restoreNodeBase);
  base.forearms.forEach(restoreNodeBase);
  base.legs.forEach(restoreNodeBase);
  base.shins.forEach(restoreNodeBase);
}

function smooth01(v) {
  const x = THREE.MathUtils.clamp(v, 0, 1);
  return x * x * (3 - 2 * x);
}

function segment(start, end, phase) {
  return smooth01((phase - start) / (end - start));
}

function pulse(start, peak, end, phase) {
  return segment(start, peak, phase) * (1 - segment(peak, end, phase));
}

function writeAnimState(root, mode) {
  const rig = root.userData.rig;
  root.userData.animState = {
    mode,
    bodyY: rig.body.position.y,
    armX: rig.arms[0]?.group.rotation.x ?? 0,
    forearmX: rig.forearms[0]?.group.rotation.x ?? 0,
    legX: rig.legs[0]?.group.rotation.x ?? 0,
    shinX: rig.shins[0]?.group.rotation.x ?? 0,
  };
}

export function animateAstronaut(root, mode = 'idle', t = 0, amount = 1) {
  const rig = root?.userData?.rig;
  const base = root?.userData?.animBase;
  if (!rig || !base || root.userData.seated) return;

  const strength = THREE.MathUtils.clamp(amount, 0, 1);
  const activeMode = mode === 'walk' || mode === 'run' || mode === 'attack' ? mode : 'idle';
  restoreAstronautBase(base);

  const breath = Math.sin(t * 2.2) * 0.012 * strength;
  rig.body.position.y += breath;
  rig.body.rotation.z += Math.sin(t * 1.4) * 0.012 * strength;
  rig.head.rotation.y += Math.sin(t * 1.7) * 0.025 * strength;

  if (activeMode === 'walk' || activeMode === 'run') {
    const running = activeMode === 'run';
    const speed = running ? 8.7 : 5.25;
    const cycle = t * speed;
    const stride = running ? 0.74 : 0.46;
    const armSwing = running ? 0.82 : 0.5;
    const kneeBend = running ? 0.86 : 0.48;
    const bob = running ? 0.052 : 0.03;
    const lean = running ? -0.16 : -0.055;

    rig.body.rotation.x += lean * strength;
    rig.body.rotation.z += Math.sin(cycle * 2) * (running ? 0.045 : 0.024) * strength;
    rig.body.position.y += (0.5 + 0.5 * Math.sin(cycle * 2 - Math.PI / 2)) * bob * strength;
    rig.head.rotation.x += -lean * 0.45 * strength;
    rig.head.rotation.z += Math.sin(cycle * 2 + 0.4) * (running ? 0.05 : 0.03) * strength;

    rig.legs.forEach(({ side, group }) => {
      const phase = Math.sin(cycle + (side > 0 ? Math.PI : 0));
      group.rotation.x += phase * stride * strength;
      group.rotation.z += side * Math.max(0, -phase) * (running ? 0.09 : 0.045) * strength;
    });
    rig.shins.forEach(({ side, group }) => {
      const phase = Math.sin(cycle + (side > 0 ? Math.PI : 0));
      const planted = Math.max(0, phase);
      const lifting = Math.max(0, -phase);
      group.rotation.x += (lifting * kneeBend + planted * kneeBend * 0.18) * strength;
    });
    rig.arms.forEach(({ side, group }) => {
      const legPhase = Math.sin(cycle + (side > 0 ? Math.PI : 0));
      group.rotation.x += -legPhase * armSwing * strength;
      group.rotation.z += side * (0.04 + Math.abs(legPhase) * (running ? 0.1 : 0.05)) * strength;
    });
    rig.forearms.forEach(({ side, group }) => {
      const legPhase = Math.sin(cycle + (side > 0 ? Math.PI : 0));
      group.rotation.x += (-0.14 - Math.max(0, -legPhase) * (running ? 0.44 : 0.24)) * strength;
      group.rotation.y += side * Math.sin(cycle) * (running ? 0.08 : 0.04) * strength;
    });
  } else if (activeMode === 'attack') {
    const phase = (t * 1.15) % 1;
    const wind = pulse(0.02, 0.26, 0.48, phase);
    const strike = pulse(0.24, 0.42, 0.82, phase);
    const recoil = pulse(0.44, 0.6, 1.0, phase);
    const hitShake = Math.sin(t * 38) * strike * 0.025;

    rig.body.rotation.x += (-0.08 - strike * 0.12 + wind * 0.04) * strength;
    rig.body.rotation.y += (-wind * 0.32 + strike * 0.46 - recoil * 0.12) * strength;
    rig.body.rotation.z += (-wind * 0.08 + strike * 0.12 + hitShake) * strength;
    rig.body.position.y += (-strike * 0.028 + recoil * 0.018) * strength;
    rig.head.rotation.y += (-wind * 0.22 + strike * 0.34) * strength;
    rig.head.rotation.x += (-0.04 - strike * 0.08) * strength;

    rig.arms.forEach(({ side, group }) => {
      if (side > 0) {
        group.rotation.x += (-0.85 * wind - 1.18 * strike - 0.35 * recoil) * strength;
        group.rotation.y += (-0.45 * wind + 0.18 * strike) * strength;
        group.rotation.z += side * (-0.18 * wind - 0.2 * strike) * strength;
      } else {
        group.rotation.x += (-0.28 + 0.38 * wind - 0.18 * strike) * strength;
        group.rotation.y += (0.28 * wind - 0.22 * strike) * strength;
        group.rotation.z += side * (0.18 + 0.24 * strike) * strength;
      }
    });
    rig.forearms.forEach(({ side, group }) => {
      if (side > 0) {
        group.rotation.x += (-0.42 * wind - 1.0 * strike - 0.28 * recoil) * strength;
        group.position.z += strike * 0.16 * strength;
        group.position.y += strike * 0.06 * strength;
      } else {
        group.rotation.x += (-0.34 - 0.3 * wind + 0.16 * strike) * strength;
        group.rotation.y += side * (0.16 + 0.12 * strike) * strength;
      }
    });
    rig.legs.forEach(({ side, group }) => {
      group.rotation.x += (side > 0 ? -0.34 : 0.22) * (wind + strike * 0.85) * strength;
      group.rotation.z += side * 0.12 * (wind + strike) * strength;
    });
    rig.shins.forEach(({ side, group }) => {
      group.rotation.x += (side > 0 ? 0.52 : 0.26) * (wind + strike) * strength;
    });
  }

  writeAnimState(root, activeMode);
}
