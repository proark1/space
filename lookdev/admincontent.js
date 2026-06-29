// SIGNAL LOST — runtime bridge for React admin scene settings.
// The admin stores small JSON docs under /api/admin/scene/:id. Lookdev scenes
// read them on load so saved color/light/fog/model choices become game-visible.

export async function loadAdminScene(id) {
  try {
    const response = await fetch('/api/admin/scene/' + encodeURIComponent(id), { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload && payload.ok === true && payload.scene ? payload.scene : null;
  } catch {
    return null;
  }
}

export function hexColor(value, fallback) {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return Number.parseInt(value.slice(1), 16);
  return fallback;
}

export function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function applyMaterialTuning(materials, settings, fallbackBase, fallbackEmissive) {
  if (!settings) return;
  const base = hexColor(settings.baseColor, fallbackBase);
  const emissive = hexColor(settings.emissiveColor, fallbackEmissive);
  for (const material of materials.base || []) {
    if (material && material.color) material.color.setHex(base);
  }
  for (const material of materials.emissive || []) {
    if (!material) continue;
    if (material.emissive) material.emissive.setHex(emissive);
    if ('emissiveIntensity' in material) material.emissiveIntensity = finiteNumber(settings.emissiveIntensity, material.emissiveIntensity || 1);
  }
}

export async function attachAdminModel(THREE, GLTFLoader, parent, settings, options = {}) {
  const url = settings && typeof settings.modelUrl === 'string' ? settings.modelUrl.trim() : '';
  if (!url || !parent) return null;
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    const targetSize = finiteNumber(options.targetSize, 6);
    const maxAxis = Math.max(size.x, size.y, size.z, 1);
    model.scale.setScalar(targetSize / maxAxis);
    model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    parent.add(model);
    return model;
  } catch (error) {
    console.warn('[sl/admincontent] Could not load admin model', url, error);
    return null;
  }
}
