import { mountHud } from './ui/ConnectionHud';

// Placeholder entry point for the M0 spike: mounts the connection HUD. The render bootstrap
// (Three.js / WebGPU) and game loop land in M1.
const el = document.getElementById('app');
if (el) mountHud(el);
