/**
 * Detects host loss on the client (backlog T16). After 8s without hearing from the host, fire
 * once so the client can show "host lost" and return to menu. A single non-host peer dropping is
 * handled separately (the host removes it; the session stays alive). True host MIGRATION is
 * deferred to M6 — MsgType.Migrate + warm-standby are reserved but unimplemented here.
 */

export const HOST_TIMEOUT_MS = 8000;

export class HostLossWatcher {
  private lastHeard = 0;
  private armed = false;
  private fired = false;

  constructor(
    private readonly onHostLost: () => void,
    private readonly timeoutMs = HOST_TIMEOUT_MS,
  ) {}

  /** Call whenever any packet arrives from the host. */
  heard(now: number): void {
    this.lastHeard = now;
    this.armed = true;
    this.fired = false;
  }

  /** Drive periodically; fires onHostLost once when the host has been silent past the timeout. */
  tick(now: number): void {
    if (this.armed && !this.fired && now - this.lastHeard > this.timeoutMs) {
      this.fired = true;
      this.onHostLost();
    }
  }

  reset(): void {
    this.armed = false;
    this.fired = false;
  }
}
