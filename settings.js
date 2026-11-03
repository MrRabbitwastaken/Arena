const KEY = 'medieval-arena-settings';
export const DEFAULTS = {
  sensitivity: 1, invertY: false, lockOn: true,
  gore: 'full', shadows: 'high', resolution: 1,
  brightness: 1, volume: 0.8, ambience: 0.5, difficulty: 0.72, hints: true,
};

export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch (e) { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
}
