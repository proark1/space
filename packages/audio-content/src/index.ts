import type { AudioManifest, AudioManifestEntry } from '@sl/shared-types';

/**
 * Placeholder for the build-time ElevenLabs pipeline (Zod manifest + typed provider,
 * T19 / T43). For now it just proves the package wiring against the shared manifest type.
 */
export function totalManifestBytes(manifest: AudioManifest): number {
  return manifest.reduce((n: number, e: AudioManifestEntry) => n + e.bytes, 0);
}
