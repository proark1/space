import { describe, it, expect } from 'vitest';
import { SfxSource, VoiceSource, ZoneMusicSource } from './schema';

describe('audio source schemas', () => {
  it('SfxSource validates and fills defaults', () => {
    const s = SfxSource.parse({ id: 'sfx.footstep.metal', category: 'sfx', provider: 'sfx', prompt: 'metal footstep' });
    expect(s.promptInfluence).toBe(0.3);
    expect(s.durationSeconds).toBeNull();
    expect(s.gain).toBe(1);
    expect(s.variants).toBe(1);
    expect(() => SfxSource.parse({ id: 'x', category: 'sfx', provider: 'sfx', prompt: 'ab' })).toThrow();
  });

  it('VoiceSource validates and fills nested voiceSettings defaults', () => {
    const v = VoiceSource.parse({ id: 'voice.ai.dock', category: 'voice_ai', provider: 'tts', text: 'Docking complete.', voiceId: 'abc' });
    expect(v.voiceSettings.stability).toBe(0.5);
    expect(v.voiceSettings.similarityBoost).toBe(0.75);
    expect(v.bake).toBe('clean');
    expect(() => VoiceSource.parse({ id: 'x', category: 'voice_ai', provider: 'tts', text: '', voiceId: 'abc' })).toThrow();
  });

  it('ZoneMusicSource validates and fills chunk/stinger defaults', () => {
    const m = ZoneMusicSource.parse({
      id: 'music.zone.dock', category: 'music_stem', zone: 'dock', bpm: 90, bars: 16, key: 'Am',
      plan: { musicLengthMs: 30000, seed: 42, chunks: [{ text: 'dark drone', durationMs: 30000, positiveStyles: ['ambient'] }] },
      layers: [{ layer: 'pad', stem: 'other', tensionBand: [0, 0.5] }],
    });
    expect(m.stingers).toEqual([]);
    expect(m.plan.chunks[0]!.negativeStyles).toEqual([]);
    expect(m.plan.chunks[0]!.contextAdherence).toBe('high');
  });
});
