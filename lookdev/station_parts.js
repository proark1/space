export function buildDockingBerthZ({ THREE, parent, part, BOX, CYL, M, ringLights = [], clampPivots = [], approachLad = [] }) {
  const cyan = M.cyan || new THREE.MeshStandardMaterial({ color: 0x04131a, emissive: 0x8fd6ff, emissiveIntensity: 1.4, roughness: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.72, metalness: 0.08 });
  const seal = new THREE.MeshStandardMaterial({ color: 0x0b0e12, roughness: 0.38, metalness: 0.2 });
  const innerGlow = new THREE.MeshStandardMaterial({ color: 0x001116, emissive: 0x56d6ff, emissiveIntensity: 1.6, roughness: 1 });
  const funnelMat = new THREE.MeshStandardMaterial({ color: 0x6a7686, roughness: 0.36, metalness: 0.75, side: THREE.DoubleSide });

  part(BOX(6.2, 6.2, 1.2), M.dark, parent, 0, 0, -4.1);
  part(BOX(5.1, 5.1, 1.0), M.metal, parent, 0, 0, -3.55);
  part(BOX(4.2, 4.2, 0.72), rubber, parent, 0, 0, -3.05);
  part(BOX(5.8, 0.42, 2.8), M.amber, parent, 0, 3.02, -2.7);
  part(BOX(5.8, 0.42, 2.8), M.amber, parent, 0, -3.02, -2.7);
  part(BOX(0.42, 5.8, 2.8), M.amber, parent, -3.02, 0, -2.7);
  part(BOX(0.42, 5.8, 2.8), M.amber, parent, 3.02, 0, -2.7);

  for (const x of [-2.65, 2.65]) {
    part(BOX(0.28, 5.6, 1.6), M.metal, parent, x, 0, -1.4);
    part(BOX(0.2, 0.36, 3.8), cyan, parent, x, -2.65, -0.5);
    part(BOX(0.2, 0.36, 3.8), cyan, parent, x, 2.65, -0.5);
  }
  for (const y of [-2.65, 2.65]) {
    part(BOX(5.6, 0.28, 1.6), M.metal, parent, 0, y, -1.4);
  }

  for (let i = 0; i < 4; i++) {
    part(CYL(2.05, 2.05, 0.44, 36), i & 1 ? rubber : M.metal, parent, 0, 0, -2.35 + i * 0.48, Math.PI / 2, 0, 0);
  }

  const targetRingMat = new THREE.MeshStandardMaterial({
    color: 0,
    emissive: 0x7dffb0,
    emissiveIntensity: 1.4,
    roughness: 1,
  });
  part(new THREE.TorusGeometry(0.74, 0.055, 8, 44), targetRingMat, parent, 0, 0, -0.38);
  part(new THREE.TorusGeometry(1.42, 0.06, 8, 48), targetRingMat, parent, 0, 0, -0.4);
  part(new THREE.TorusGeometry(2.05, 0.045, 8, 52), cyan, parent, 0, 0, -0.42);

  part(CYL(3.15, 3.65, 1.0, 36), M.metal, parent, 0, 0, -1.15, Math.PI / 2, 0, 0);
  part(CYL(2.72, 2.92, 0.72, 36), seal, parent, 0, 0, -0.45, Math.PI / 2, 0, 0);
  const collar = part(CYL(2.32, 2.32, 1.08, 40), M.metal, parent, 0, 0, -0.12, Math.PI / 2, 0, 0);
  part(new THREE.TorusGeometry(2.42, 0.22, 14, 48), M.amber, parent, 0, 0, 0.32);
  part(new THREE.TorusGeometry(2.07, 0.13, 12, 44), rubber, parent, 0, 0, 0.54);
  part(new THREE.TorusGeometry(1.76, 0.05, 8, 40), cyan, parent, 0, 0, 0.62);

  const target = part(
    new THREE.SphereGeometry(0.16, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0, emissive: 0x7dffb0, emissiveIntensity: 3, roughness: 1 }),
    parent,
    0,
    0,
    0.1,
  );
  part(CYL(0.6, 0.6, 0.18, 24), innerGlow, parent, 0, 0, -0.66, Math.PI / 2, 0, 0);

  part(
    new THREE.CylinderGeometry(3.35, 2.36, 2.0, 34, 1, true),
    funnelMat,
    parent,
    0,
    0,
    1.0,
    Math.PI / 2,
    0,
    0,
  );

  for (let a = 0; a < 12; a++) {
    const an = (a / 12) * Math.PI * 2;
    part(BOX(0.66, 0.5, 0.14), a & 1 ? M.amber : M.dark, parent, Math.cos(an) * 3.22, Math.sin(an) * 3.22, 2.02, 0, 0, an);
  }

  for (let a = 0; a < 8; a++) {
    const an = (a / 8) * Math.PI * 2 + 0.2;
    part(BOX(1.14, 0.14, 0.78), M.metal, parent, Math.cos(an) * 2.28, Math.sin(an) * 2.28, 0.06, 0, 0, an);
    part(BOX(0.72, 0.08, 0.36), rubber, parent, Math.cos(an) * 1.93, Math.sin(an) * 1.93, 0.5, 0, 0, an);
  }

  for (let a = 0; a < 16; a++) {
    const an = (a / 16) * Math.PI * 2;
    const light = part(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff5030, emissiveIntensity: 2.6, roughness: 1 }),
      parent,
      Math.cos(an) * 2.58,
      Math.sin(an) * 2.58,
      0.42,
    );
    ringLights.push(light.material);
  }

  for (let a = 0; a < 4; a++) {
    const an = (a / 4) * Math.PI * 2 + 0.4;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(an) * 2.86, Math.sin(an) * 2.86, 0.1);
    pivot.rotation.z = an;
    pivot.userData.baseZ = an;
    parent.add(pivot);
    part(BOX(1.62, 0.3, 0.54), M.metal, pivot, 0.78, 0, 0);
    part(BOX(0.32, 0.52, 0.6), rubber, pivot, 1.5, 0, 0);
    clampPivots.push(pivot);
  }

  for (let a = 0; a < 4; a++) {
    const an = (a / 4) * Math.PI * 2 + Math.PI / 4;
    const cable = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(an) * 2.9, Math.sin(an) * 2.9, -2.4),
      new THREE.Vector3(Math.cos(an) * 3.4, Math.sin(an) * 3.4, -1.0),
      new THREE.Vector3(Math.cos(an) * 3.0, Math.sin(an) * 3.0, 1.6),
    ]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(cable, 16, 0.035, 5, false), rubber);
    tube.castShadow = tube.receiveShadow = true;
    parent.add(tube);
  }

  const dockLight = new THREE.PointLight(0xff7050, 11, 34, 2);
  dockLight.position.set(0, 0, 2.8);
  parent.add(dockLight);

  for (let i = 1; i <= 8; i++) {
    for (const sgn of [1, -1]) {
      const light = part(
        new THREE.SphereGeometry(0.2, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff9040, emissiveIntensity: 2.6, roughness: 1 }),
        parent,
        sgn * 3.12,
        0,
        2.1 + i * 2.75,
      );
      approachLad.push({ m: light.material, i });
    }
  }

  return { collar, target, dockLight, ringLights, clampPivots, approachLad };
}

export function buildApproachDockFaceZ({ THREE, parent, part, BOX, CYL, SPH, M, baseZ = 24 }) {
  const cyan = M.cyan || M.amber;
  const rubber = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.72, metalness: 0.08 });
  const seal = new THREE.MeshStandardMaterial({ color: 0x0b0e12, roughness: 0.36, metalness: 0.18 });
  const funnel = new THREE.MeshStandardMaterial({ color: 0x667282, roughness: 0.36, metalness: 0.72, side: THREE.DoubleSide });
  const greenGuide = new THREE.MeshBasicMaterial({ color: 0x9ffcff, fog: false, depthWrite: false, toneMapped: false });
  const amberGuide = new THREE.MeshBasicMaterial({ color: 0xffc36a, fog: false, depthWrite: false, toneMapped: false });

  part(BOX(11.2, 10.8, 1.15), M.dark, parent, 0, 0, baseZ - 2.0);
  part(BOX(8.6, 8.6, 1.0), M.dark, parent, 0, 0, baseZ - 1.35);
  part(BOX(6.7, 6.7, 0.82), M.hull, parent, 0, 0, baseZ - 0.85);
  part(BOX(6.3, 0.5, 1.45), M.amber, parent, 0, 3.25, baseZ - 0.58);
  part(BOX(6.3, 0.5, 1.45), M.amber, parent, 0, -3.25, baseZ - 0.58);
  part(BOX(0.5, 6.3, 1.45), M.amber, parent, -3.25, 0, baseZ - 0.58);
  part(BOX(0.5, 6.3, 1.45), M.amber, parent, 3.25, 0, baseZ - 0.58);

  for (let i = 0; i < 4; i++) {
    part(CYL(2.28, 2.28, 0.34, 40), i & 1 ? rubber : M.metal, parent, 0, 0, baseZ - 0.32 + i * 0.34, Math.PI / 2, 0, 0);
  }
  part(CYL(3.5, 3.72, 0.68, 44), M.metal, parent, 0, 0, baseZ + 0.98, Math.PI / 2, 0, 0);
  part(CYL(2.9, 3.08, 0.5, 40), seal, parent, 0, 0, baseZ + 1.32, Math.PI / 2, 0, 0);
  part(new THREE.TorusGeometry(3.08, 0.24, 14, 60), M.amber, parent, 0, 0, baseZ + 1.66);
  part(new THREE.TorusGeometry(2.38, 0.1, 8, 52), greenGuide, parent, 0, 0, baseZ + 1.74);
  part(new THREE.TorusGeometry(1.32, 0.075, 8, 44), greenGuide, parent, 0, 0, baseZ + 1.82);
  part(CYL(0.58, 0.58, 0.22, 28), greenGuide, parent, 0, 0, baseZ + 1.94, Math.PI / 2, 0, 0);
  part(new THREE.CylinderGeometry(3.7, 2.48, 1.85, 40, 1, true), funnel, parent, 0, 0, baseZ + 2.18, Math.PI / 2, 0, 0);

  for (let a = 0; a < 12; a++) {
    const an = (a / 12) * Math.PI * 2;
    part(BOX(0.68, 0.46, 0.16), a & 1 ? M.amber : M.dark, parent, Math.cos(an) * 3.36, Math.sin(an) * 3.36, baseZ + 1.9, 0, 0, an);
  }

  for (let a = 0; a < 8; a++) {
    const an = (a / 8) * Math.PI * 2 + 0.2;
    part(BOX(1.2, 0.18, 0.58), M.metal, parent, Math.cos(an) * 2.74, Math.sin(an) * 2.74, baseZ + 1.38, 0, 0, an);
  }

  for (let i = 0; i < 9; i++) {
    const z = baseZ + 2.0 + i * 0.8;
    part(SPH(0.085, 8, 8), i > 5 ? greenGuide : amberGuide, parent, -3.34, 0, z);
    part(SPH(0.085, 8, 8), i > 5 ? greenGuide : amberGuide, parent, 3.34, 0, z);
  }
}
