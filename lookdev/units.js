// SIGNAL LOST — shared player/unit models.
// makeAstronaut() returns a detailed low-poly (smooth-shaded) suited crew member,
// used for the capsule crew, in-game players, and the unit viewer (/units).
import * as THREE from 'three';

export function makeAstronaut(opts = {}) {
  const accent = opts.accent ?? 0xc8552f;   // team / player accent colour
  const seated = !!opts.seated;
  const M = {
    suit:  new THREE.MeshStandardMaterial({ color: 0xcdcabf, roughness: 0.72, metalness: 0.12 }),
    suit2: new THREE.MeshStandardMaterial({ color: 0x9a988f, roughness: 0.78, metalness: 0.12 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x33363c, roughness: 0.55, metalness: 0.45 }),
    accent:new THREE.MeshStandardMaterial({ color: accent,   roughness: 0.5,  metalness: 0.25 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa3b0, roughness: 0.32, metalness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a1622, roughness: 0.12, metalness: 0.6, emissive: 0x0b2233, emissiveIntensity: 0.45 }),
    hud:   new THREE.MeshStandardMaterial({ color: 0x05131a, emissive: 0x7fe0ff, emissiveIntensity: 1.5, roughness: 1 }),
    chest: new THREE.MeshStandardMaterial({ color: 0x10141a, emissive: 0xE8A33D, emissiveIntensity: 1.0, roughness: 1 }),
    boot:  new THREE.MeshStandardMaterial({ color: 0x26292f, roughness: 0.7, metalness: 0.28 }),
  };
  const root = new THREE.Group();
  const mesh = (geo, m, par, x, y, z, rx, ry, rz) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0);
    o.castShadow = o.receiveShadow = true; (par || root).add(o); return o;
  };
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);
  const cyl = (a, b, h, s) => new THREE.CylinderGeometry(a, b, h, s || 20);
  const sph = (r) => new THREE.SphereGeometry(r, 22, 18);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // ---- torso ----
  const body = new THREE.Group(); root.add(body);
  mesh(cyl(0.30, 0.345, 0.62, 24), M.suit, body, 0, 1.18, 0);          // chest
  mesh(cyl(0.345, 0.345, 0.07, 24), M.accent, body, 0, 1.46, 0);       // collar accent ring
  mesh(cyl(0.30, 0.26, 0.16, 24), M.joint, body, 0, 0.84, 0);          // waist ring
  mesh(box(0.46, 0.26, 0.12), M.joint, body, 0, 1.2, 0.28);            // chest control box
  mesh(box(0.17, 0.08, 0.03), M.chest, body, -0.11, 1.24, 0.35);       // amber readout
  mesh(box(0.15, 0.06, 0.03), M.hud, body, 0.13, 1.23, 0.35);          // cyan readout
  mesh(box(0.5, 0.12, 0.02), M.accent, body, 0, 1.05, 0.30);           // chest accent stripe
  // PLSS life-support backpack
  mesh(box(0.46, 0.62, 0.26), M.suit2, body, 0, 1.16, -0.31);
  mesh(cyl(0.07, 0.07, 0.52, 14), M.metal, body, -0.13, 1.16, -0.44);  // O2 tank
  mesh(cyl(0.07, 0.07, 0.52, 14), M.metal, body, 0.13, 1.16, -0.44);   // O2 tank
  mesh(box(0.22, 0.1, 0.06), M.joint, body, 0, 1.44, -0.18);           // hose mount
  mesh(cyl(0.026, 0.026, 0.34, 8), M.joint, body, 0.18, 1.28, -0.1, -0.5, 0, 0.3); // hose
  // shoulders
  mesh(sph(0.165), M.suit, body, -0.36, 1.42, 0);
  mesh(sph(0.165), M.suit, body, 0.36, 1.42, 0);

  // ---- helmet ----
  const head = new THREE.Group(); head.position.set(0, 1.62, 0); body.add(head);
  mesh(cyl(0.15, 0.17, 0.1, 20), M.metal, head, 0, -0.05, 0);          // neck ring
  mesh(sph(0.215), M.glass, head, 0, 0.09, 0);                          // fishbowl visor
  mesh(new THREE.TorusGeometry(0.215, 0.024, 12, 30), M.suit, head, 0, 0.09, 0, Math.PI / 2, 0, 0); // helmet rim
  mesh(box(0.13, 0.035, 0.02), M.hud, head, 0.0, 0.13, 0.205);         // HUD glint band on the visor
  mesh(cyl(0.05, 0.06, 0.07, 12), M.metal, head, 0, 0.27, 0.04, 0.45, 0, 0); // top lamp housing
  mesh(box(0.06, 0.025, 0.03), M.hud, head, 0, 0.29, 0.11);            // lamp glow
  mesh(cyl(0.01, 0.01, 0.18, 8), M.metal, head, -0.17, 0.2, -0.05, 0, 0, 0.35); // antenna
  mesh(sph(0.018), M.hud, head, -0.2, 0.31, -0.08);                    // antenna tip light

  // ---- arms ----
  function arm(side) { // -1 left, +1 right
    const g = new THREE.Group(); g.position.set(0.36 * side, 1.4, 0); body.add(g);
    g.rotation.z = side * 0.13; g.rotation.x = seated ? -0.55 : 0.06;
    mesh(cap(0.1, 0.34), M.suit, g, 0, -0.27, 0);                       // upper arm
    mesh(box(0.05, 0.16, 0.02), M.accent, g, 0.11 * side, -0.27, 0.04); // accent stripe
    const fore = new THREE.Group(); fore.position.set(0, -0.52, 0); g.add(fore);
    fore.rotation.x = seated ? -1.05 : -0.12;
    mesh(cyl(0.105, 0.105, 0.07, 16), M.joint, fore, 0, 0.0, 0);        // elbow ring
    mesh(cap(0.088, 0.3), M.suit2, fore, 0, -0.22, 0);                  // forearm
    mesh(cyl(0.1, 0.1, 0.05, 14), M.joint, fore, 0, -0.4, 0);           // wrist ring
    mesh(sph(0.1), M.joint, fore, 0, -0.46, 0.015);                     // glove
    return g;
  }
  arm(-1); arm(1);

  // ---- legs ----
  function leg(side) {
    const g = new THREE.Group(); g.position.set(0.16 * side, 0.82, 0); root.add(g);
    g.rotation.x = seated ? -1.5 : 0;                                   // hip
    mesh(cap(0.13, 0.4), M.suit, g, 0, -0.3, 0);                        // thigh
    const shin = new THREE.Group(); shin.position.set(0, -0.6, 0); g.add(shin);
    shin.rotation.x = seated ? 1.55 : 0;                               // knee
    mesh(cyl(0.13, 0.13, 0.07, 16), M.joint, shin, 0, 0.0, 0);          // knee ring
    mesh(cap(0.11, 0.38), M.suit2, shin, 0, -0.27, 0);                 // shin
    mesh(box(0.19, 0.13, 0.36), M.boot, shin, 0, -0.5, 0.07);          // boot
    mesh(box(0.19, 0.05, 0.1), M.joint, shin, 0, -0.56, 0.16);          // boot toe cap
    return g;
  }
  leg(-1); leg(1);

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // recenter so the lowest point (feet standing, or folded legs seated) sits at y = 0
  const bb = new THREE.Box3().setFromObject(root); const dy = -bb.min.y;
  if (isFinite(dy)) root.children.forEach(c => c.position.y += dy);
  root.userData.accent = accent;
  return root;
}
