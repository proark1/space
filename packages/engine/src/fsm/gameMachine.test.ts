import { describe, expect, it } from 'vitest';
import { createGameMachine } from './gameMachine';

describe('GameFlowMachine', () => {
  it('walks the vertical-slice flow in order', () => {
    const machine = createGameMachine();
    expect(machine.state).toBe('mainMenu');
    expect(machine.send('HOST_ROOM')).toBe('lobby');
    expect(machine.send('START_LAUNCH')).toBe('launchCinematic');
    expect(machine.send('DOCKED')).toBe('docking');
    expect(machine.send('ENTER_SHIP')).toBe('inShip');
    expect(machine.send('OBJECTIVE_COMPLETE')).toBe('win');
    expect(machine.send('SHOW_DEBRIEF')).toBe('debrief');
    expect(machine.send('DEBRIEF_DONE')).toBe('mainMenu');
  });

  it('ignores invalid events for the current state', () => {
    const machine = createGameMachine();
    expect(machine.send('ENTER_SHIP')).toBe('mainMenu');
  });
});
