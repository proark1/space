import { z } from 'zod';

/**
 * The three build-time audio source schemas (spec 04 §schema.ts). Every cue in the audio
 * catalog validates against one of these before the provider renders it. Defaults mirror the
 * spec so a terse catalog entry expands to a complete render job.
 */

const Base = z.object({
  /** Dot-namespaced id, e.g. "sfx.footstep.metal". */
  id: z.string().min(1),
  loop: z.boolean().default(false),
  gain: z.number().min(0).max(4).default(1),
  variants: z.number().int().min(1).max(8).default(1),
  loopWindowMs: z.tuple([z.number(), z.number()]).optional(),
});

export const SfxSource = Base.extend({
  category: z.enum(['sfx', 'ambient', 'creature']),
  provider: z.literal('sfx'),
  prompt: z.string().min(3),
  durationSeconds: z.number().min(0.5).max(30).nullable().default(null),
  promptInfluence: z.number().min(0).max(1).default(0.3),
});
export type SfxSource = z.infer<typeof SfxSource>;

export const VoiceSource = Base.extend({
  category: z.enum(['voice_ai', 'voice_log']),
  provider: z.literal('tts'),
  text: z.string().min(1),
  voiceId: z.string(),
  voiceSettings: z
    .object({
      stability: z.number().min(0).max(1).default(0.5),
      similarityBoost: z.number().min(0).max(1).default(0.75),
      style: z.number().min(0).default(0),
      useSpeakerBoost: z.boolean().default(true),
      speed: z.number().min(0.7).max(1.2).default(1),
    })
    .default({}),
  bake: z.enum(['clean', 'comms', 'distorted_log']).default('clean'),
});
export type VoiceSource = z.infer<typeof VoiceSource>;

export const ZoneMusicSource = z.object({
  id: z.string(),
  category: z.literal('music_stem'),
  zone: z.string(),
  bpm: z.number(),
  bars: z.number().int(),
  key: z.string(),
  plan: z.object({
    musicLengthMs: z.number().min(3000).max(600000),
    seed: z.number().int(),
    chunks: z.array(
      z.object({
        text: z.string(),
        durationMs: z.number().min(3000).max(120000),
        positiveStyles: z.array(z.string()),
        negativeStyles: z.array(z.string()).default([]),
        contextAdherence: z.enum(['low', 'medium', 'high']).default('high'),
      }),
    ),
  }),
  layers: z.array(
    z.object({
      layer: z.enum(['pad', 'pulse', 'perc', 'lead', 'dissonance']),
      stem: z.enum(['other', 'bass', 'drums', 'vocals']),
      tensionBand: z.tuple([z.number(), z.number()]),
    }),
  ),
  stingers: z
    .array(z.object({ id: z.string(), prompt: z.string(), durationMs: z.number() }))
    .default([]),
});
export type ZoneMusicSource = z.infer<typeof ZoneMusicSource>;

/** Any audio source. */
export type AudioSource = SfxSource | VoiceSource | ZoneMusicSource;
