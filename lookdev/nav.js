// SIGNAL LOST — shared scene navigation, consistent across every look-dev scene.
// Replaces each scene's ad-hoc nav with one standard bar (current scene highlighted),
// and hides itself during pointer-lock so it never clutters immersive play.
const SCENES = [
  ['/game', 'game'], ['/lobby', 'lobby'], ['/launch', 'capsule'], ['/pad', 'pad'],
  ['/dock', 'dock'], ['/exterior', 'derelict'], ['/units', 'crew'], ['/admin', 'forge'],
];
const here = location.pathname.replace(/\/+$/, '') || '/';

const old = document.getElementById('nav'); if (old) old.remove();   // drop the per-scene nav

const style = document.createElement('style');
style.textContent = `
  #slnav{position:fixed;top:38px;right:12px;z-index:90;display:flex;gap:5px;flex-wrap:wrap;
    justify-content:flex-end;max-width:74vw;font:11px ui-monospace,Menlo,monospace;transition:opacity .3s}
  #slnav a{color:#9fd0ff;text-decoration:none;background:rgba(8,12,18,.72);border:1px solid #20303c;
    border-radius:14px;padding:4px 10px;letter-spacing:1px}
  #slnav a:hover{border-color:#E8A33D;color:#fff}
  #slnav a.cur{color:#E8A33D;border-color:#E8A33D;background:rgba(232,163,61,.09)}
  body.lk #slnav{opacity:0;pointer-events:none}
  @media (max-width:640px){
    #slnav{left:8px;right:8px;max-width:none;justify-content:center;gap:4px}
    #slnav a{font-size:10px;padding:4px 8px}
  }`;
document.head.appendChild(style);

const nav = document.createElement('div'); nav.id = 'slnav';
nav.innerHTML = SCENES.map(([h, l]) => `<a href="${h}"${h === here ? ' class="cur"' : ''}>${l}</a>`).join('');
document.body.appendChild(nav);

document.addEventListener('pointerlockchange', () => document.body.classList.toggle('lk', !!document.pointerLockElement));
