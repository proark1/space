import { PROTOCOL_VERSION, MsgType } from '@sl/shared-types';
import { ByteWriter } from '@sl/netcode';
import { replicatedComponentNames } from '@sl/ecs';

/**
 * Placeholder entry point. The real Vite client (T03) and render bootstrap (T24) land
 * later; this proves the app can import every workspace package and that the whole
 * project-reference graph resolves end to end.
 */
export function boot(): string {
  const hello = new ByteWriter(8);
  hello.u8(MsgType.Hello).u32(PROTOCOL_VERSION);
  return `signal-lost client · proto v${PROTOCOL_VERSION} · components [${replicatedComponentNames.join(', ')}] · ${hello.length}B hello`;
}
