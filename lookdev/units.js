// SIGNAL LOST — shared player/unit models.
// makeAstronaut() returns a sleek modern (SpaceX-style) suited crew member:
// smooth white helmet with a big black visor, slim form-fitting white suit, black gloves,
// tall grey boots, clean panel seams. Used for capsule crew, in-game players, and /units.
import * as THREE from 'three';

export function makeAstronaut(opts = {}) {
  const accent = opts.accent ?? 0xc8552f;   // subtle team / player accent
  const seated = !!opts.seated;
  const M = {
    suit:  new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.45, metalness: 0.08 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf6f8fa, roughness: 0.35, metalness: 0.06 }),
    panel: new THREE.MeshStandardMaterial({ color: 0xaeb4bd, roughness: 0.5,  metalness: 0.28 }),
    seam:  new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.6,  metalness: 0.2 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 0.1,  metalness: 0.78, emissive: 0x0a1622, emissiveIntensity: 0.28 }),
    boot:  new THREE.MeshStandardMaterial({ color: 0x8b9199, roughness: 0.55, metalness: 0.25 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.5,  metalness: 0.3 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb2b8c0, roughness: 0.3,  metalness: 0.82 }),
    accent:new THREE.MeshStandardMaterial({ color: accent,   roughness: 0.5,  metalness: 0.22 }),
  };
  const root = new THREE.Group();
  const mesh = (geo, m, par, x, y, z, rx, ry, rz, sx, sy, sz) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0);
    if (sx !== undefined) o.scale.set(sx, sy, sz);
    o.castShadow = o.receiveShadow = true; (par || root).add(o); return o;
  };
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 16);
  const cyl = (a, b, h, s) => new THREE.CylinderGeometry(a, b, h, s || 24);
  const sph = (r) => new THREE.SphereGeometry(r, 26, 20);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // ---- torso (slim, form-fitting) ----
  const body = new THREE.Group(); root.add(body);
  mesh(cyl(0.185, 0.23, 0.58, 28), M.suit, body, 0, 1.18, 0);           // chest, slight V-taper
  mesh(box(0.014, 0.52, 0.02), M.seam, body, 0, 1.18, 0.225);           // centre seam
  mesh(cyl(0.205, 0.2, 0.07, 28), M.panel, body, 0, 0.86, 0);           // waist ring
  mesh(cyl(0.2, 0.17, 0.2, 24), M.suit, body, 0, 0.74, 0);              // hips
  mesh(box(0.17, 0.13, 0.03), M.panel, body, 0, 1.36, 0.19, -0.25, 0, 0); // upper-chest grey plate
  mesh(box(0.12, 0.02, 0.02), M.accent, body, 0, 1.28, 0.225);         // thin accent line
  [-1, 1].forEach(s => {                                               // shoulders: white joint + grey angular cap
    mesh(sph(0.1), M.suit, body, 0.235 * s, 1.44, 0);
    mesh(box(0.2, 0.09, 0.24), M.panel, body, 0.235 * s, 1.5, 0, 0, 0, -0.25 * s);
  });
  mesh(box(0.02, 0.5, 0.04), M.seam, body, 0, 1.18, -0.2);             // flat back spine seam (no bulky pack)

  // ---- helmet (white shell, big black visor) ----
  const head = new THREE.Group(); head.position.set(0, 1.6, 0); body.add(head);
  mesh(cyl(0.085, 0.1, 0.08, 22), M.white, head, 0, -0.06, 0);          // neck collar
  mesh(cyl(0.115, 0.115, 0.03, 24), M.metal, head, 0, -0.02, 0);        // neck ring trim
  mesh(sph(0.172), M.white, head, 0, 0.09, 0, 0, 0, 0, 1.0, 1.06, 1.12);// helmet shell (egg)
  mesh(sph(0.17), M.visor, head, 0, 0.075, 0.078, 0, 0, 0, 1.0, 0.98, 0.82); // big black front visor
  mesh(sph(0.085), M.white, head, 0, -0.04, 0.12, 0, 0, 0, 1.35, 0.72, 0.85); // white chin guard
  mesh(sph(0.013), M.white, head, 0.0, 0.135, 0.21);                    // little visor sensor nub
  mesh(box(0.02, 0.012, 0.05), M.seam, head, 0, -0.075, 0.18);         // chin vent
  mesh(cyl(0.008, 0.008, 0.14, 8), M.metal, head, -0.13, 0.2, -0.05, 0, 0, 0.4); // antenna

  // ---- arms (slim) ----
  function arm(side) {
    const g = new THREE.Group(); g.position.set(0.235 * side, 1.42, 0); body.add(g);
    g.rotation.z = side * 0.1; g.rotation.x = seated ? -0.55 : 0.05;
    mesh(cap(0.062, 0.32), M.suit, g, 0, -0.26, 0);                     // upper arm
    mesh(box(0.05, 0.07, 0.012), M.accent, g, 0.06 * side, -0.2, 0.03); // shoulder accent patch
    mesh(box(0.012, 0.3, 0.014), M.seam, g, 0.06 * side, -0.26, 0.02);  // arm seam
    const fore = new THREE.Group(); fore.position.set(0, -0.5, 0); g.add(fore);
    fore.rotation.x = seated ? -1.05 : -0.1;
    mesh(cyl(0.066, 0.066, 0.045, 16), M.panel, fore, 0, 0, 0);         // elbow
    mesh(cap(0.055, 0.3), M.suit, fore, 0, -0.21, 0);                   // forearm
    mesh(cyl(0.062, 0.062, 0.04, 16), M.panel, fore, 0, -0.38, 0);      // wrist
    mesh(box(0.075, 0.12, 0.06), M.glove, fore, 0, -0.46, 0.01);        // black glove
    return g;
  }
  arm(-1); arm(1);

  // ---- legs (slim) + tall grey boots ----
  function leg(side) {
    const g = new THREE.Group(); g.position.set(0.11 * side, 0.78, 0); root.add(g);
    g.rotation.x = seated ? -1.5 : 0;
    mesh(cap(0.082, 0.42), M.suit, g, 0, -0.3, 0);                      // thigh
    mesh(box(0.012, 0.4, 0.014), M.seam, g, 0.07 * side, -0.3, 0.02);   // leg seam
    const shin = new THREE.Group(); shin.position.set(0, -0.62, 0); g.add(shin);
    shin.rotation.x = seated ? 1.55 : 0;
    mesh(cyl(0.086, 0.086, 0.05, 16), M.panel, shin, 0, 0, 0);          // knee
    mesh(cap(0.07, 0.36), M.suit, shin, 0, -0.24, 0);                   // shin
    mesh(cyl(0.084, 0.098, 0.26, 18), M.boot, shin, 0, -0.4, 0);        // tall boot shaft
    mesh(box(0.13, 0.1, 0.3), M.boot, shin, 0, -0.55, 0.08);            // boot foot
    mesh(box(0.13, 0.04, 0.1), M.seam, shin, 0, -0.6, 0.18);            // sole toe
    return g;
  }
  leg(-1); leg(1);

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // recenter so the lowest point (feet standing / folded legs seated) sits at y = 0
  const bb = new THREE.Box3().setFromObject(root); const dy = -bb.min.y;
  if (isFinite(dy)) root.children.forEach(c => c.position.y += dy);
  root.userData.accent = accent;
  return root;
}
