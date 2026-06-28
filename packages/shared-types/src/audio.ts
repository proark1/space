/** One entry in the build-time, content-hashed audio manifest (real schema lands at T19/T43). */
export interface AudioManifestEntry {
  readonly id: string;
  readonly kind: 'ambience' | 'sfx' | 'music' | 'voice';
  /** Content hash of the source prompt + params — stable across rebuilds. */
  readonly hash: string;
  readonly bytes: number;
}

export type AudioManifest = readonly AudioManifestEntry[];
