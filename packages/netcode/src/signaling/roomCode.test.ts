import { describe, it, expect } from 'vitest';
import { generateRoomCode, isValidRoomCode, roomId } from './roomCode';

describe('room codes', () => {
  it('generates 6-char codes that all validate and stay in the alphabet', () => {
    for (let i = 0; i < 2000; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[0-9A-HJ-NP-TV-Z]{6}$/);
      expect(isValidRoomCode(code)).toBe(true);
    }
  });

  it('rejects malformed codes and accepts well-formed ones case-insensitively', () => {
    expect(isValidRoomCode('K7M2QX')).toBe(true);
    expect(isValidRoomCode('k7m2qx')).toBe(true);
    expect(isValidRoomCode('ABC')).toBe(false); // too short
    expect(isValidRoomCode('ABCDEFG')).toBe(false); // too long
    expect(isValidRoomCode('ABCDEI')).toBe(false); // I is excluded
    expect(isValidRoomCode('ABCDEO')).toBe(false); // O is excluded
    expect(isValidRoomCode('ABC-12')).toBe(false); // punctuation
  });

  it('namespaces the room id and upper-cases the code', () => {
    expect(roomId('k7m2qx')).toBe('signal-lost/v1/K7M2QX');
  });
});
