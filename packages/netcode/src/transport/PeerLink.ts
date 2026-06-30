/**
 * One peer connection = two negotiated DataChannels with fixed SCTP ids:
 *   reliable   (id 0, ordered)            — HELLO, events, acks, audio-cue ids, chat
 *   unreliable (id 1, unordered, no rtx)  — snapshots (host→client), inputs (client→host)
 *
 * "Negotiated" means both sides create each channel independently with the same id, so no
 * in-band channel negotiation / renegotiation is needed. Signaling (SDP/ICE) is relayed by
 * the caller (TrysteroSignaler); the sim only ever talks to this interface, never WebRTC
 * directly — so the transport stays swappable (e.g. to simple-peer) behind PeerLink.
 */

export const CHANNELS = {
  reliable: { label: 'reliable', id: 0 },
  unreliable: { label: 'unreliable', id: 1 },
} as const;

export interface PeerLinkEvents {
  /** Fires once, when BOTH channels have reached readyState 'open'. */
  onOpen?: () => void;
  onReliable?: (data: ArrayBuffer) => void;
  onUnreliable?: (data: ArrayBuffer) => void;
  onState?: (state: RTCPeerConnectionState) => void;
  /** A local ICE candidate to relay to the remote peer via signaling. */
  onIce?: (candidate: RTCIceCandidateInit) => void;
}

export interface PeerLinkOptions {
  readonly iceTransportPolicy?: RTCIceTransportPolicy;
}

export function buildPeerConnectionConfig(
  iceServers: RTCIceServer[],
  opts: PeerLinkOptions = {},
): RTCConfiguration {
  const config: RTCConfiguration = { iceServers, bundlePolicy: 'max-bundle' };
  if (opts.iceTransportPolicy) config.iceTransportPolicy = opts.iceTransportPolicy;
  return config;
}

export class PeerLink {
  readonly pc: RTCPeerConnection;
  readonly reliable: RTCDataChannel;
  readonly unreliable: RTCDataChannel;

  private openCount = 0;
  private opened = false;
  private remoteSet = false;
  private pendingIce: RTCIceCandidateInit[] = [];

  constructor(
    iceServers: RTCIceServer[],
    private readonly ev: PeerLinkEvents,
    opts: PeerLinkOptions = {},
  ) {
    this.pc = new RTCPeerConnection(buildPeerConnectionConfig(iceServers, opts));
    this.reliable = this.pc.createDataChannel(CHANNELS.reliable.label, {
      negotiated: true,
      id: CHANNELS.reliable.id,
      ordered: true,
    });
    this.unreliable = this.pc.createDataChannel(CHANNELS.unreliable.label, {
      negotiated: true,
      id: CHANNELS.unreliable.id,
      ordered: false,
      maxRetransmits: 0,
    });
    this.reliable.binaryType = 'arraybuffer';
    this.unreliable.binaryType = 'arraybuffer';
    this.wire();
  }

  private wire(): void {
    const onChannelOpen = (): void => {
      if (++this.openCount === 2 && !this.opened) {
        this.opened = true;
        this.ev.onOpen?.();
      }
    };
    this.reliable.onopen = onChannelOpen;
    this.unreliable.onopen = onChannelOpen;
    this.reliable.onmessage = (e: MessageEvent) => this.ev.onReliable?.(e.data as ArrayBuffer);
    this.unreliable.onmessage = (e: MessageEvent) => this.ev.onUnreliable?.(e.data as ArrayBuffer);
    this.pc.onconnectionstatechange = () => this.ev.onState?.(this.pc.connectionState);
    this.pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate) this.ev.onIce?.(e.candidate.toJSON());
    };
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async acceptOfferCreateAnswer(
    offer: RTCSessionDescriptionInit,
  ): Promise<RTCSessionDescriptionInit> {
    await this.setRemote(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    return this.setRemote(answer);
  }

  /** Add a remote ICE candidate; buffers until the remote description is set. */
  addIce(candidate: RTCIceCandidateInit): void {
    if (this.remoteSet) void this.pc.addIceCandidate(candidate);
    else this.pendingIce.push(candidate);
  }

  sendReliable(data: ArrayBufferView<ArrayBuffer>): void {
    if (this.reliable.readyState === 'open') this.reliable.send(data);
  }

  sendUnreliable(data: ArrayBufferView<ArrayBuffer>): void {
    if (this.unreliable.readyState === 'open') this.unreliable.send(data);
  }

  close(): void {
    this.pc.close();
  }

  private async setRemote(desc: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(desc);
    this.remoteSet = true;
    for (const c of this.pendingIce) await this.pc.addIceCandidate(c);
    this.pendingIce = [];
  }
}
