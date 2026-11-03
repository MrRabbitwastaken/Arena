import { THREE } from '../core/three.js';

// Low evening sun, cool sky fill, and a small environment map so plate reads as steel.
export function setupLighting(renderer, scene) {
  scene.fog = new THREE.FogExp2(0x1c1716, 0.018);
  scene.background = new THREE.Color(0x16121a);

  const hemi = new THREE.HemisphereLight(0x7f8db0, 0x3a2a1c, 0.42);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffc48a, 2.1);
  sun.position.set(-14, 16, 9);
  sun.castShadow = true;
  const sc = sun.shadow.camera;
  sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 60;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);

  const rim = new THREE.DirectionalLight(0x8fa6d6, 0.55);
  rim.position.set(12, 8, -14);
  scene.add(rim);

  // Environment for reflections: dusk gradient with a warm horizon and a few bright windows.
  const env = new THREE.Scene();
  const envMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){ float h = vP.y;
      vec3 c = mix(vec3(0.22,0.16,0.12), vec3(0.9,0.55,0.32), smoothstep(-0.2,0.05,h));
      c = mix(c, vec3(0.16,0.18,0.26), smoothstep(0.05,0.5,h));
      c = mix(c, vec3(0.05,0.06,0.1), smoothstep(0.5,1.0,h));
      gl_FragColor = vec4(c,1.0); }`,
  });
  env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat));
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd9a8 });
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), glow);
    const a = (i / 6) * Math.PI * 2;
    p.position.set(Math.cos(a) * 8, 1.5 + (i % 2), Math.sin(a) * 8); p.lookAt(0, 0, 0);
    env.add(p);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.04).texture;
  pm.dispose();

  return { sun, hemi, rim };
}
