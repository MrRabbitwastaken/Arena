// Three.js is loaded as a global UMD build (index.html). Every module imports it from here.
export const THREE = (typeof window !== 'undefined' ? window : globalThis).THREE;
