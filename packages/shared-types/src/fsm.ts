/** Top-level game-flow states (the client XState machine; T32). */
export type GameState =
  | 'mainMenu'
  | 'lobby'
  | 'launchCinematic'
  | 'docking'
  | 'inShip'
  | 'win'
  | 'debrief';

/** Per-peer connection lifecycle surfaced to the HUD (T08). */
export type ConnectionState =
  | 'idle'
  | 'signaling'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';
