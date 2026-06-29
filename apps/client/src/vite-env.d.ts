/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional URL for the playable lookdev cold-open demo. */
  readonly VITE_LOOKDEV_DEMO_URL?: string;
  /** Comma-separated full TURN URLs (preferred — e.g. metered.ca on ports 80/443). */
  readonly VITE_TURN_URLS?: string;
  /** Or just a host → standard ports 3478/5349. Unset (with no URLs) → STUN-only. */
  readonly VITE_TURN_HOST?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
