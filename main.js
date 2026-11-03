import { THREE } from './core/three.js';
import { Game } from './game.js';
import { Menus } from './ui/menus.js';
import { loadSettings } from './ui/settings.js';

function boot() {
  const bootEl = document.getElementById('boot');
  if (!THREE) { bootEl.textContent = 'Three.js did not load. Check your connection and reload.'; bootEl.classList.add('err'); return; }
  const settings = loadSettings();
  const menus = new Menus(settings);
  let game;
  try {
    game = new Game(document.getElementById('view'), document.getElementById('hud'), settings, menus);
  } catch (e) {
    console.error(e);
    bootEl.textContent = 'WebGL is not available in this browser, so the arena cannot be drawn.';
    bootEl.classList.add('err');
    return;
  }
  menus.attach(game);
  menus.show('menu');
  bootEl.hidden = true;
  window.__arena = game;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
