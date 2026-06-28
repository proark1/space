import { describe, it, expect } from 'vitest';
import {
  sfxRequest, musicRequest, ttsRequest, stemSeparationRequest,
  ElevenLabsProvider, ELEVEN_BASE_URL, type FetchLike,
} from './provider';
import { SfxSource, VoiceSource, ZoneMusicSource } from './schema';

const sfx = SfxSource.parse({ id: 'sfx.creak', category: 'sfx', provider: 'sfx', prompt: 'a long creak', durationSeconds: 2 });
const voice = VoiceSource.parse({ id: 'voice.ai.x', category: 'voice_ai', provider: 'tts', text: 'Docking complete.', voiceId: 'VOICE7' });
const music = ZoneMusicSource.parse({
  id: 'music.zone.dock', category: 'music_stem', zone: 'dock', bpm: 90, bars: 16, key: 'Am',
  plan: { musicLengthMs: 30000, seed: 7, chunks: [{ text: 'drone', durationMs: 30000, positiveStyles: ['dark'] }] },
  layers: [{ layer: 'pad', stem: 'other', tensionBand: [0, 0.5] }],
});

describe('request builders hit the right endpoints with correct bodies', () => {
  it('sound-generation', () => {
    const r = sfxRequest(sfx);
    expect(r.url).toBe(`${ELEVEN_BASE_URL}/sound-generation`);
    expect(r.body).toMatchObject({ text: 'a long creak', model_id: 'eleven_text_to_sound_v2', duration_seconds: 2, output_format: 'pcm_44100' });
  });
  it('music', () => {
    const r = musicRequest(music);
    expect(r.url).toBe(`${ELEVEN_BASE_URL}/music`);
    expect(r.body).toMatchObject({ model_id: 'music_v2', music_length_ms: 30000, seed: 7, force_instrumental: true });
  });
  it('text-to-speech', () => {
    const r = ttsRequest(voice, 1234);
    expect(r.url).toBe(`${ELEVEN_BASE_URL}/text-to-speech/VOICE7`);
    expect(r.body).toMatchObject({ text: 'Docking complete.', model_id: 'eleven_flash_v2_5', seed: 1234 });
  });
  it('stem-separation', () => {
    expect(stemSeparationRequest().url).toBe(`${ELEVEN_BASE_URL}/music/stem-separation`);
  });
});

describe('ElevenLabsProvider.send', () => {
  it('posts with the api key header and serialized body', async () => {
    const calls: Array<{ url: string; init: { headers: Record<string, string>; body?: string } }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return { status: 200, arrayBuffer: async () => new ArrayBuffer(8), headers: { get: () => null } };
    };
    const provider = new ElevenLabsProvider({ apiKey: 'KEY123', fetchImpl });
    await provider.send(sfxRequest(sfx));
    expect(calls[0]!.url).toBe(`${ELEVEN_BASE_URL}/sound-generation`);
    expect(calls[0]!.init.headers['xi-api-key']).toBe('KEY123');
    expect(JSON.parse(calls[0]!.init.body!).text).toBe('a long creak');
  });
});
