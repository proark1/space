export type VoiceLevel = 'silent' | 'whisper' | 'talk' | 'shout' | 'scream';
export type ActiveVoiceLevel = Exclude<VoiceLevel, 'silent'>;
export type VoiceCommand = 'whisper' | 'talk' | 'scream';
export type VoiceSource = 'mic' | 'keyboard' | 'smoke';
export type MicVoiceStatus = 'unsupported' | 'idle' | 'requesting' | 'active' | 'denied' | 'error';

export interface VoiceSignal {
  readonly level: VoiceLevel;
  readonly pressure: number;
  readonly source: VoiceSource;
}

export interface MicVoiceInput {
  readonly status: MicVoiceStatus;
  readonly signal: VoiceSignal;
  request(): Promise<void>;
  update(): VoiceSignal;
  dispose(): void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function voiceLevelFromPressure(pressure: number): VoiceLevel {
  if (pressure >= 0.86) return 'scream';
  if (pressure >= 0.58) return 'shout';
  if (pressure >= 0.26) return 'talk';
  if (pressure >= 0.06) return 'whisper';
  return 'silent';
}

export function voiceSignalFromPressure(pressure: number, source: VoiceSource): VoiceSignal {
  const clamped = clamp(pressure, 0, 1);
  return { level: voiceLevelFromPressure(clamped), pressure: clamped, source };
}

export function voiceSignalFromCommand(command: VoiceCommand, source: VoiceSource): VoiceSignal {
  const pressure = command === 'scream' ? 1 : command === 'talk' ? 0.36 : 0.08;
  return { level: command, pressure, source };
}

function silentMicSignal(): VoiceSignal {
  return { level: 'silent', pressure: 0, source: 'mic' };
}

export function createMicVoiceInput(): MicVoiceInput {
  const mediaDevices = globalThis.navigator?.mediaDevices;
  const AudioCtor = globalThis.AudioContext
    ?? (globalThis as unknown as { readonly webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  let status: MicVoiceStatus = mediaDevices && AudioCtor ? 'idle' : 'unsupported';
  let context: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let samples: Uint8Array<ArrayBuffer> | null = null;
  let noiseFloor = 0.012;
  let smoothedPressure = 0;
  let latest = silentMicSignal();

  const stop = (): void => {
    source?.disconnect();
    analyser?.disconnect();
    for (const track of stream?.getTracks() ?? []) track.stop();
    void context?.close();
    context = null;
    stream = null;
    source = null;
    analyser = null;
    samples = null;
    smoothedPressure = 0;
    latest = silentMicSignal();
  };

  return {
    get status() {
      return status;
    },
    get signal() {
      return latest;
    },
    async request() {
      if (status === 'unsupported' || status === 'requesting' || status === 'active') return;
      if (!mediaDevices || !AudioCtor) {
        status = 'unsupported';
        return;
      }

      status = 'requesting';
      try {
        context = new AudioCtor();
        if (context.state === 'suspended') void context.resume();
        stream = await mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
          },
        });
        if (context.state === 'suspended') await context.resume();
        analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.2;
        samples = new Uint8Array(analyser.fftSize);
        source = context.createMediaStreamSource(stream);
        source.connect(analyser);
        status = 'active';
      } catch (err) {
        stop();
        const name = err instanceof DOMException ? err.name : '';
        status = name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'error';
      }
    },
    update() {
      if (status !== 'active' || !analyser || !samples) {
        latest = silentMicSignal();
        return latest;
      }

      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }

      const rms = Math.sqrt(sum / samples.length);
      const nearFloor = rms < noiseFloor * 1.65 || smoothedPressure < 0.04;
      if (nearFloor) noiseFloor += (rms - noiseFloor) * 0.025;

      const relative = Math.max(0, rms - noiseFloor * 1.18 - 0.004);
      const pressure = clamp(relative * 13.5, 0, 1);
      const smoothing = pressure > smoothedPressure ? 0.45 : 0.12;
      smoothedPressure += (pressure - smoothedPressure) * smoothing;
      latest = voiceSignalFromPressure(smoothedPressure, 'mic');
      return latest;
    },
    dispose() {
      stop();
      status = status === 'active' || status === 'requesting' ? 'idle' : status;
    },
  };
}
