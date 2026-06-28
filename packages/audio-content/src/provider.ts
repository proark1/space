import type { SfxSource, VoiceSource, ZoneMusicSource } from './schema';
import type { RateLimiter } from './rateLimiter';

/**
 * Typed ElevenLabs provider (spec 04). The request builders are PURE — they map a validated
 * source to the exact endpoint URL + body, so they unit-test without any network. The provider
 * wraps them with auth + the rate limiter.
 */

export const ELEVEN_BASE_URL = 'https://api.elevenlabs.io/v1';

export interface ElevenRequest {
  url: string;
  method: 'POST';
  body: Record<string, unknown> | null;
}

export function sfxRequest(s: SfxSource): ElevenRequest {
  return {
    url: `${ELEVEN_BASE_URL}/sound-generation`,
    method: 'POST',
    body: {
      text: s.prompt,
      model_id: 'eleven_text_to_sound_v2',
      duration_seconds: s.durationSeconds,
      prompt_influence: s.promptInfluence,
      loop: s.loop,
      output_format: 'pcm_44100',
    },
  };
}

export function musicPlanRequest(s: ZoneMusicSource): ElevenRequest {
  return {
    url: `${ELEVEN_BASE_URL}/music/plan`,
    method: 'POST',
    body: {
      music_length_ms: s.plan.musicLengthMs,
      seed: s.plan.seed,
      model_id: 'music_v2',
    },
  };
}

export function musicRequest(s: ZoneMusicSource): ElevenRequest {
  return {
    url: `${ELEVEN_BASE_URL}/music`,
    method: 'POST',
    body: {
      composition_plan: {
        chunks: s.plan.chunks.map((c) => ({
          text: c.text,
          duration_ms: c.durationMs,
          positive_styles: c.positiveStyles,
          negative_styles: c.negativeStyles,
          context_adherence: c.contextAdherence,
        })),
      },
      music_length_ms: s.plan.musicLengthMs,
      model_id: 'music_v2',
      seed: s.plan.seed,
      force_instrumental: true,
      output_format: 'pcm_44100',
    },
  };
}

export function ttsRequest(s: VoiceSource, seed: number): ElevenRequest {
  return {
    url: `${ELEVEN_BASE_URL}/text-to-speech/${s.voiceId}`,
    method: 'POST',
    body: {
      text: s.text,
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability: s.voiceSettings.stability,
        similarity_boost: s.voiceSettings.similarityBoost,
        style: s.voiceSettings.style,
        use_speaker_boost: s.voiceSettings.useSpeakerBoost,
        speed: s.voiceSettings.speed,
      },
      seed,
      output_format: 'pcm_44100',
    },
  };
}

/** Raw-WAV-body stem separation (returns {drums,bass,vocals,other}). */
export function stemSeparationRequest(): ElevenRequest {
  return { url: `${ELEVEN_BASE_URL}/music/stem-separation`, method: 'POST', body: null };
}

export interface FetchResponse {
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  readonly headers: { get(name: string): string | null };
}
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<FetchResponse>;

export class ElevenLabsProvider {
  constructor(
    private readonly opts: { apiKey: string; fetchImpl: FetchLike; limiter?: RateLimiter },
  ) {}

  send(req: ElevenRequest): Promise<ArrayBuffer> {
    const run = (): Promise<ArrayBuffer> =>
      this.opts
        .fetchImpl(req.url, {
          method: req.method,
          headers: { 'xi-api-key': this.opts.apiKey, 'content-type': 'application/json' },
          body: req.body ? JSON.stringify(req.body) : undefined,
        })
        .then((r) => r.arrayBuffer());
    return this.opts.limiter ? this.opts.limiter.run(run) : run();
  }
}
