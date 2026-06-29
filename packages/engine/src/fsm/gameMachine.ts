export type GameFlowState =
  | 'mainMenu'
  | 'lobby'
  | 'launchCinematic'
  | 'docking'
  | 'inShip'
  | 'win'
  | 'debrief';

export type GameFlowEvent =
  | 'HOST_ROOM'
  | 'JOIN_ROOM'
  | 'START_LAUNCH'
  | 'DOCKED'
  | 'ENTER_SHIP'
  | 'OBJECTIVE_COMPLETE'
  | 'WIN'
  | 'SHOW_DEBRIEF'
  | 'DEBRIEF_DONE'
  | 'LEAVE'
  | 'RESET';

export type GameFlowListener = (next: GameFlowState, prev: GameFlowState, event: GameFlowEvent) => void;

const TRANSITIONS: Record<GameFlowState, Partial<Record<GameFlowEvent, GameFlowState>>> = {
  mainMenu: {
    HOST_ROOM: 'lobby',
    JOIN_ROOM: 'lobby',
    RESET: 'mainMenu',
  },
  lobby: {
    START_LAUNCH: 'launchCinematic',
    LEAVE: 'mainMenu',
    RESET: 'mainMenu',
  },
  launchCinematic: {
    DOCKED: 'docking',
    LEAVE: 'mainMenu',
    RESET: 'mainMenu',
  },
  docking: {
    ENTER_SHIP: 'inShip',
    LEAVE: 'mainMenu',
    RESET: 'mainMenu',
  },
  inShip: {
    OBJECTIVE_COMPLETE: 'win',
    WIN: 'win',
    LEAVE: 'mainMenu',
    RESET: 'mainMenu',
  },
  win: {
    SHOW_DEBRIEF: 'debrief',
    RESET: 'mainMenu',
  },
  debrief: {
    DEBRIEF_DONE: 'mainMenu',
    RESET: 'mainMenu',
  },
};

/**
 * Top-level game-flow machine (T32). Kept hand-rolled for now so the runtime stays dependency-light;
 * the transition table mirrors the XState shape and can be swapped for XState without changing the
 * Game composition root.
 */
export class GameFlowMachine {
  private _state: GameFlowState = 'mainMenu';
  private readonly listeners = new Set<GameFlowListener>();

  get state(): GameFlowState {
    return this._state;
  }

  send(event: GameFlowEvent): GameFlowState {
    const prev = this._state;
    const next = TRANSITIONS[prev][event];
    if (!next || next === prev) return this._state;
    this._state = next;
    for (const listener of this.listeners) listener(next, prev, event);
    return this._state;
  }

  subscribe(listener: GameFlowListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function createGameMachine(): GameFlowMachine {
  return new GameFlowMachine();
}
