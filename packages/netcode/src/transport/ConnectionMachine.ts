import type { ConnectionState } from '@sl/shared-types';

/**
 * The connection lifecycle surfaced to the HUD. Pure (no WebRTC imports) so it unit-tests
 * cleanly; the Session drives it from real ICE/channel events. Transitions only forward
 * through the happy path; a lost connection drops to 'reconnecting', a dead one to 'failed'.
 */
export class ConnectionMachine {
  private _state: ConnectionState = 'idle';

  constructor(private readonly onChange?: (s: ConnectionState) => void) {}

  get state(): ConnectionState {
    return this._state;
  }

  private set(s: ConnectionState): void {
    if (s === this._state) return;
    this._state = s;
    this.onChange?.(s);
  }

  startSignaling(): void {
    if (this._state === 'idle' || this._state === 'failed') this.set('signaling');
  }

  connecting(): void {
    if (this._state === 'signaling') this.set('connecting');
  }

  /** Both DataChannels are open and carrying data. */
  connected(): void {
    if (this._state !== 'failed') this.set('connected');
  }

  /** Map the raw RTCPeerConnection state into the lifecycle. */
  onPcState(s: RTCPeerConnectionState): void {
    switch (s) {
      case 'connecting':
        this.connecting();
        break;
      case 'disconnected':
        if (this._state === 'connected') this.set('reconnecting');
        break;
      case 'failed':
      case 'closed':
        this.set('failed');
        break;
      case 'new':
      case 'connected':
        break;
    }
  }

  reset(): void {
    this.set('idle');
  }
}
