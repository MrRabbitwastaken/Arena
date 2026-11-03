import { THREE } from '../core/three.js';

// Low evening sun, cool sky fill, and a small environment map so plate reads as steel.
export function setupLighting(renderer, scene) {
  scene.fog = new THREE.FogExp2(0x4a3a30, 0.006);
  scene.background = new THREE.Color(0x2a2230);

  const hemi = new THREE.HemisphereLight(0xb8c4e0, 0x6a5240, 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd2a0, 3.2);
  sun.position.set(-14, 16, 9);
  sun.castShadow = true;
  const sc = sun.shadow.camera;
  sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 60;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);

  const rim = new THREE.DirectionalLight(0xa8bce6, 1.0);
  rim.position.set(12, 8, -14);
  scene.add(rim);
  const amb = new THREE.AmbientLight(0xfff1e0, 0.35);
  scene.add(amb);

  // Environment for reflections: dusk gradient with a warm horizon and a few bright windows.
  const env = new THREE.Scene();
  const envMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){ float h = vP.y;
      vec3 c = mix(vec3(0.45,0.36,0.28), vec3(1.2,0.85,0.55), smoothstep(-0.2,0.05,h));
      c = mix(c, vec3(0.45,0.5,0.62), smoothstep(0.05,0.5,h));
      c = mix(c, vec3(0.25,0.28,0.38), smoothstep(0.5,1.0,h));
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

  return { sun, hemi, rim, amb };
}
