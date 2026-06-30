export function buildDockingBerthZ({ THREE, parent, part, BOX, CYL, M, ringLights = [], clampPivots = [], approachLad = [] }) {
  part(BOX(4.4, 4.4, 3.5), M.metal, parent, 0, 0, -3.2);
  part(BOX(3.8, 0.5, 3.5), M.amber, parent, 0, 2.2, -3.2);
  part(BOX(3.8, 0.5, 3.5), M.amber, parent, 0, -2.2, -3.2);

  for (let i = 0; i < 4; i++) {
    part(CYL(2.0, 2.0, 0.6, 28), i & 1 ? M.dark : M.metal, parent, 0, 0, -2.4 + i * 0.6);
  }

  const targetRingMat = new THREE.MeshStandardMaterial({
    color: 0,
    emissive: 0x7dffb0,
    emissiveIntensity: 1.4,
    roughness: 1,
  });
  part(new THREE.TorusGeometry(0.8, 0.05, 8, 40), targetRingMat, parent, 0, 0, -0.25);
  part(new THREE.TorusGeometry(1.5, 0.05, 8, 40), targetRingMat, parent, 0, 0, -0.25);

  part(CYL(3.0, 3.4, 0.9, 32), M.metal, parent, 0, 0, -1.3, Math.PI / 2, 0, 0);
  const collar = part(CYL(2.4, 2.4, 1.0, 36), M.metal, parent, 0, 0, -0.6, Math.PI / 2, 0, 0);
  part(new THREE.TorusGeometry(2.4, 0.18, 12, 40), M.amber, parent, 0, 0, -0.1);

  const target = part(
    new THREE.SphereGeometry(0.16, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0, emissive: 0x7dffb0, emissiveIntensity: 3, roughness: 1 }),
    parent,
    0,
    0,
    0.1,
  );

  part(
    new THREE.CylinderGeometry(3.0, 2.4, 1.6, 30, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x6a7686, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }),
    parent,
    0,
    0,
    0.6,
    Math.PI / 2,
    0,
    0,
  );

  for (let a = 0; a < 12; a++) {
    const an = (a / 12) * Math.PI * 2;
    part(BOX(0.5, 0.45, 0.12), a & 1 ? M.amber : M.dark, parent, Math.cos(an) * 3.0, Math.sin(an) * 3.0, 1.3, 0, 0, an);
  }

  for (let a = 0; a < 6; a++) {
    const an = (a / 6) * Math.PI * 2 + 0.25;
    part(BOX(1.0, 0.12, 0.8), M.metal, parent, Math.cos(an) * 2.15, Math.sin(an) * 2.15, -0.35, 0, 0, an);
  }

  for (let a = 0; a < 16; a++) {
    const an = (a / 16) * Math.PI * 2;
    const light = part(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff5030, emissiveIntensity: 2.6, roughness: 1 }),
      parent,
      Math.cos(an) * 2.4,
      Math.sin(an) * 2.4,
      0.0,
    );
    ringLights.push(light.material);
  }

  for (let a = 0; a < 4; a++) {
    const an = (a / 4) * Math.PI * 2 + 0.4;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(an) * 2.7, Math.sin(an) * 2.7, -0.4);
    pivot.rotation.z = an;
    pivot.userData.baseZ = an;
    parent.add(pivot);
    part(BOX(1.4, 0.3, 0.5), M.metal, pivot, 0.7, 0, 0);
    clampPivots.push(pivot);
  }

  const dockLight = new THREE.PointLight(0xff7050, 9, 28, 2);
  dockLight.position.set(0, 0, 2.5);
  parent.add(dockLight);

  for (let i = 1; i <= 6; i++) {
    for (const sgn of [1, -1]) {
      const light = part(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff9040, emissiveIntensity: 2.6, roughness: 1 }),
        parent,
        sgn * 2.9,
        0,
        1.6 + i * 2.4,
      );
      approachLad.push({ m: light.material, i });
    }
  }

  return { collar, target, dockLight, ringLights, clampPivots, approachLad };
}

export function buildApproachDockFaceZ({ THREE, parent, part, BOX, CYL, SPH, M, baseZ = -30 }) {
  part(BOX(6.8, 6.8, 1.2), M.dark, parent, 0, 0, baseZ);
  part(BOX(5.2, 5.2, 0.7), M.hull, parent, 0, 0, baseZ - 0.8);
  part(CYL(2.5, 2.5, 1.0, 36), M.metal, parent, 0, 0, baseZ - 1.4, Math.PI / 2, 0, 0);
  part(new THREE.TorusGeometry(2.55, 0.2, 12, 44), M.amber, parent, 0, 0, baseZ - 2.0);
  part(new THREE.TorusGeometry(1.45, 0.06, 8, 32), M.cyan, parent, 0, 0, baseZ - 2.06);
  part(CYL(0.45, 0.45, 0.18, 20), M.cyan, parent, 0, 0, baseZ - 2.2, Math.PI / 2, 0, 0);

  for (let a = 0; a < 12; a++) {
    const an = (a / 12) * Math.PI * 2;
    part(BOX(0.5, 0.35, 0.14), a & 1 ? M.amber : M.dark, parent, Math.cos(an) * 2.95, Math.sin(an) * 2.95, baseZ - 1.9, 0, 0, an);
  }

  for (let i = 0; i < 6; i++) {
    const z = baseZ - 14 + i * 2.2;
    part(SPH(0.18, 8, 8), M.amber, parent, -2.9, 0, z);
    part(SPH(0.18, 8, 8), M.amber, parent, 2.9, 0, z);
  }
}
