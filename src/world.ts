// Neon battlefield. Built for weak GPUs: instancing, merged lines, no shadows,
// no post-processing. About 15 draw calls for the whole level.
import * as THREE from 'three';

export interface Box { minX: number; maxX: number; minZ: number; maxZ: number; h: number }
export interface World {
  scene: THREE.Scene;
  boxes: Box[];
  half: number;
  update(dt: number, t: number, focus: THREE.Vector3): void;
}

function rng(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

/** Segment p + d*t (t in 0..1) vs box. Returns hit t or null. */
export function segBox(p: THREE.Vector3, d: THREE.Vector3, b: Box): number | null {
  let t0 = 0, t1 = 1;
  const axes: [number, number, number, number][] = [
    [p.x, d.x, b.minX, b.maxX], [p.y, d.y, 0, b.h], [p.z, d.z, b.minZ, b.maxZ],
  ];
  for (const [o, v, lo, hi] of axes) {
    if (Math.abs(v) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let a = (lo - o) / v, c = (hi - o) / v;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}

function windowTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d0a1c'; g.fillRect(0, 0, 64, 256);
  const cols = ['#ffcf7a', '#7ae8ff', '#ff7ae0'];
  const r = rng(3);
  for (let y = 4; y < 256; y += 8) for (let x = 4; x < 64; x += 12) {
    if (r() < 0.32) { g.globalAlpha = 0.5 + r() * 0.5; g.fillStyle = cols[Math.floor(r() * 3)]; g.fillRect(x, y, 7, 4); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
  return tex;
}

function signTexture(text: string, color: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(4, 4, 248, 56);
  g.font = 'bold 36px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 12; g.fillStyle = color; g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(): World {
  const scene = new THREE.Scene();
  const bg = new THREE.Color(0x0a0618);
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 20, 95);
  scene.add(new THREE.HemisphereLight(0x9a8cff, 0x2a1a4a, 2.2));
  const sun = new THREE.DirectionalLight(0xff6fd8, 1.0); sun.position.set(-20, 30, 10); scene.add(sun);

  const half = 30;
  const r = rng(11);

  // Floor + neon grid
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ color: 0x1c1436 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const grid = new THREE.GridHelper(half * 2, 30, 0xff3df0, 0x2a6bff);
  const gm = grid.material as THREE.LineBasicMaterial; gm.transparent = true; gm.opacity = 0.5;
  grid.position.y = 0.01; scene.add(grid);

  // Cover + perimeter walls
  const boxes: Box[] = [];
  const add = (x: number, z: number, w: number, d: number, h: number) =>
    boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
  add(0, -half - 0.5, half * 2 + 2, 1, 3); add(0, half + 0.5, half * 2 + 2, 1, 3);
  add(-half - 0.5, 0, 1, half * 2, 3); add(half + 0.5, 0, 1, half * 2, 3);
  let tries = 0;
  while (boxes.length < 30 && tries++ < 500) {
    const kind = r();
    const [w, d, h] = kind < 0.45 ? [1.2 + r() * 1.2, 1.2 + r() * 1.2, 1 + r() * 1.2]
      : kind < 0.8 ? (r() < 0.5 ? [4, 0.6, 1.1] : [0.6, 4, 1.1])
      : (r() < 0.5 ? [6, 0.8, 2.6] : [0.8, 6, 2.6]);
    const x = (r() * 2 - 1) * (half - 4), z = (r() * 2 - 1) * (half - 4);
    if (Math.hypot(x, z - 24) < 6) continue; // keep spawn clear
    const clash = boxes.some((b) => x + w / 2 + 2.5 > b.minX && x - w / 2 - 2.5 < b.maxX && z + d / 2 + 2.5 > b.minZ && z - d / 2 - 2.5 < b.maxZ);
    if (clash) continue;
    add(x, z, w, d, h);
  }
  const boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x2e2450, emissive: 0x0e0a22 }), boxes.length);
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const s = new THREE.Vector3(); const p = new THREE.Vector3();
  const edge: number[] = [];
  boxes.forEach((b, i) => {
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    m.compose(p.set((b.minX + b.maxX) / 2, b.h / 2, (b.minZ + b.maxZ) / 2), q, s.set(w, b.h, d));
    boxMesh.setMatrixAt(i, m);
    const xs = [b.minX, b.maxX], zs = [b.minZ, b.maxZ], ys = [0.02, b.h];
    for (const y of ys) { // top + bottom rectangles
      edge.push(xs[0], y, zs[0], xs[1], y, zs[0], xs[1], y, zs[0], xs[1], y, zs[1],
        xs[1], y, zs[1], xs[0], y, zs[1], xs[0], y, zs[1], xs[0], y, zs[0]);
    }
    for (const x of xs) for (const z of zs) edge.push(x, 0, z, x, b.h, z);
  });
  scene.add(boxMesh);
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
  scene.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x22e6ff })));

  // Skyline ring (one draw call)
  const N = 70;
  const sky = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: windowTexture() }), N);
  const tints = [0xb9a8ff, 0x8fb8ff, 0xff9ee6, 0xffffff];
  const tall: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + r() * 0.05, rad = 45 + r() * 45;
    const w = 6 + r() * 9, h = 14 + r() * 50;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    m.compose(p.set(x, h / 2, z), q, s.set(w, h, w));
    sky.setMatrixAt(i, m); sky.setColorAt(i, new THREE.Color(tints[i % 4]));
    if (h > 30 && rad < 75) tall.push(new THREE.Vector3(x, Math.max(10, h * (0.5 + r() * 0.35)), z));
  }
  scene.add(sky);

  // Neon signs on the tall towers
  const words = ['MEDIC', 'AXIS', 'PLANE', 'STIM-24', 'NOVA', 'FLEXION', 'CLINIC', 'ROTATE'];
  const colors = ['#ff3df0', '#22e6ff', '#ffd23d', '#6dff5a'];
  const signs: THREE.Mesh[] = [];
  tall.slice(0, words.length).forEach((v, i) => {
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(words[i], colors[i % 4]), transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), mat);
    const dir = new THREE.Vector3(v.x, 0, v.z).normalize();
    sign.position.set(v.x - dir.x * 9, v.y, v.z - dir.z * 9);
    sign.lookAt(0, v.y, 0);
    scene.add(sign); signs.push(sign);
  });

  // Rain: one LineSegments, moved on the CPU (cheap at this count)
  const RAIN = 600, RR = 30;
  const rp = new Float32Array(RAIN * 6);
  for (let i = 0; i < RAIN; i++) {
    const x = (r() * 2 - 1) * RR, y = r() * 25, z = (r() * 2 - 1) * RR;
    rp.set([x, y, z, x + 0.05, y + 0.7, z], i * 6);
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x8fa8ff, transparent: true, opacity: 0.35 }));
  rain.frustumCulled = false;
  scene.add(rain);

  return {
    scene, boxes, half,
    update(dt, t, focus) {
      const a = rg.attributes.position as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      for (let i = 0; i < RAIN; i++) {
        const o = i * 6;
        arr[o + 1] -= 22 * dt; arr[o + 4] -= 22 * dt;
        if (arr[o + 1] < 0) { arr[o + 1] += 25; arr[o + 4] += 25; }
      }
      a.needsUpdate = true;
      rain.position.set(Math.round(focus.x / 10) * 10, 0, Math.round(focus.z / 10) * 10);
      signs.forEach((sg, i) => {
        const mat = sg.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.sin(t * 13 + i * 7) > 0.97 ? 0.25 : 1; // flicker
      });
    },
  };
}
