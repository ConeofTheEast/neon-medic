// Core game: player, darts, waves, answers.
import * as THREE from 'three';
import { buildWorld, segBox, type World } from './world';
import { Comrade, CALLSIGNS } from './comrade';
import { Input } from './input';
import { Hud } from './hud';
import type { QuestionBank, RawQ } from './questions';
import { sfx } from './sfx';

export type Mode = 'combat' | 'calm';
export type Quality = 'auto' | 'low' | 'high';
export interface Summary {
  mode: Mode; score: number; best: number; saved: number; lost: number;
  answered: number; correct: number; missed: { q: RawQ; picked: string }[];
}

const DART_HEX = [0x22e6ff, 0xff3df0, 0xffd23d, 0x6dff5a];
const TOTAL_WAVES = 5;
const EYE = 1.6, RADIUS = 0.45, SPEED = 5.5;
const DART_SPEED = 45, GRAVITY = 6, HIT_R = 0.8;

interface Dart { mesh: THREE.Mesh; vel: THREE.Vector3; type: number; live: boolean; stuck: number }

export class Game {
  readonly input: Input;
  onEnd: (s: Summary) => void = () => {};
  onPauseRequest: () => void = () => {};

  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(72, 1, 0.05, 220);
  private world: World;
  private hud = new Hud();
  private gun = new THREE.Group();
  private gunStripe: THREE.MeshBasicMaterial;
  private darts: Dart[] = [];
  private dartMats: THREE.MeshBasicMaterial[] = [];
  private comrades: Comrade[] = [];

  private running = false;
  private paused = false;
  private mode: Mode = 'combat';
  private pos = new THREE.Vector3(0, EYE, 24);
  private yaw = 0; private pitch = 0;
  private selected = 0;
  private cooldown = 0; private recoil = 0; private bob = 0;
  private target: Comrade | null = null; private targetHold = 0;

  private wave = 0; private toSpawn = 0; private spawnTimer = 0; private waveDone = -1;
  private score = 0; private saved = 0; private lost = 0; private answered = 0; private correct = 0;
  private missed: Summary['missed'] = [];
  private names: string[] = [];

  // perf
  private quality: Quality = 'auto';
  private resScale = 1; private frames = 0; private acc = 0; private last = 0;

  private v1 = new THREE.Vector3(); private v2 = new THREE.Vector3(); private v3 = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, private bank: QuestionBank) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.world = buildWorld();
    this.world.scene.add(this.camera);
    this.camera.rotation.order = 'YXZ';

    // Dart gun view model
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a2440 });
    this.gunStripe = new THREE.MeshBasicMaterial({ color: DART_HEX[0] });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.26), dark);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.18, 8), dark);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.015, -0.2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.015, 0.2), this.gunStripe); stripe.position.y = 0.045;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.1, 0.05), dark); grip.position.set(0, -0.08, 0.07); grip.rotation.x = 0.3;
    this.gun.add(body, barrel, stripe, grip);
    this.gun.position.set(0.16, -0.15, -0.32);
    this.gun.scale.setScalar(0.55);
    this.camera.add(this.gun);

    const dartGeo = new THREE.CylinderGeometry(0.025, 0.012, 0.35, 6); dartGeo.rotateX(Math.PI / 2);
    this.dartMats = DART_HEX.map((c) => new THREE.MeshBasicMaterial({ color: c }));
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(dartGeo, this.dartMats[0]); mesh.visible = false;
      this.world.scene.add(mesh);
      this.darts.push({ mesh, vel: new THREE.Vector3(), type: 0, live: false, stuck: 0 });
    }

    this.input = new Input(canvas, document.getElementById('joy')!, document.getElementById('joyKnob')!, document.getElementById('fireBtn')!);
    this.input.onLockChange = (locked) => {
      document.getElementById('lockHint')!.classList.toggle('hidden', locked || !this.running);
      if (!locked && this.running && !this.paused && !this.input.touchMode) this.onPauseRequest();
    };
    canvas.addEventListener('click', () => { if (this.running && !this.paused && !this.input.locked) this.input.requestLock(); });
    this.hud.onSelect = (i) => this.selectDart(i);
    document.getElementById('pauseBtn')!.addEventListener('click', () => this.running && this.onPauseRequest());

    addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  // ---------- public controls ----------
  setQuality(q: Quality) { this.quality = q; this.resScale = q === 'low' ? 0.6 : 1; this.resize(); }

  start(mode: Mode) {
    this.cleanup();
    this.mode = mode; this.running = true; this.paused = false;
    this.pos.set(0, EYE, 24); this.yaw = 0; this.pitch = 0;
    this.score = this.saved = this.lost = this.answered = this.correct = 0;
    this.missed = []; this.wave = 0; this.waveDone = -1;
    this.names = shuffle(CALLSIGNS.slice());
    document.getElementById('hud')!.classList.remove('hidden');
    this.input.clear();
    this.selectDart(0);
    this.nextWave();
    this.input.requestLock();
  }
  pause() { this.paused = true; }
  resume() { this.paused = false; this.input.clear(); this.input.requestLock(); }
  quit() { this.finish(); }
  get isRunning() { return this.running; }

  // ---------- loop ----------
  private resize() {
    const w = innerWidth, h = innerHeight;
    const base = Math.min(devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.25);
    this.renderer.setPixelRatio(base * this.resScale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 85 : 72; // phones held upright get a wider view
    this.camera.updateProjectionMatrix();
  }

  private frame(tMs: number) {
    const t = tMs / 1000;
    const dt = Math.min(0.05, this.last ? t - this.last : 0.016);
    this.last = t;
    this.perf(dt);
    if (this.running && !this.paused) this.update(dt);
    else if (!this.running) this.menuCam(t);
    this.world.update(this.paused ? 0 : dt, t, this.pos);
    this.renderer.render(this.world.scene, this.camera);
  }

  private perf(dt: number) {
    this.frames++; this.acc += dt;
    if (this.acc < 2) return;
    const fps = this.frames / this.acc;
    this.hud.fps(`${fps.toFixed(0)} fps · ${Math.round(this.resScale * 100)}% res`);
    if (this.quality === 'auto') { // dynamic resolution: keep it smooth
      const before = this.resScale;
      if (fps < 40 && this.resScale > 0.5) this.resScale = Math.max(0.5, this.resScale - 0.15);
      else if (fps > 57 && this.resScale < 1) this.resScale = Math.min(1, this.resScale + 0.1);
      if (before !== this.resScale) this.resize();
    }
    this.frames = 0; this.acc = 0;
  }

  private menuCam(t: number) {
    const a = t * 0.06;
    this.camera.position.set(Math.cos(a) * 22, 7, Math.sin(a) * 22);
    this.camera.lookAt(0, 2, 0);
    this.gun.visible = false;
  }

  private update(dt: number) {
    const inp = this.input;
    this.gun.visible = true;

    // look
    const l = inp.takeLook();
    const sens = inp.touchMode ? 0.0024 : 0.0022;
    this.yaw -= l.x * sens; this.pitch = THREE.MathUtils.clamp(this.pitch - l.y * sens, -1.4, 1.4);
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    // move
    const mv = inp.move();
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.pos.x += (fx * mv.y + -fz * mv.x) * SPEED * dt;
    this.pos.z += (fz * mv.y + fx * mv.x) * SPEED * dt;
    this.collide();
    const moving = Math.hypot(mv.x, mv.y);
    this.bob += dt * moving * 10;
    this.camera.position.set(this.pos.x, EYE + Math.sin(this.bob) * 0.04 * moving, this.pos.z);

    // dart select
    const n = inp.takeNumber(); if (n !== null) this.selectDart(n);
    const w = inp.takeWheel(); if (w) this.selectDart((this.selected + (w > 0 ? 1 : -1) + this.optCount()) % this.optCount());

    // target + fire
    this.findTarget(dt);
    this.cooldown -= dt;
    if (inp.takeFire() && this.cooldown <= 0) this.fire();

    this.updateDarts(dt);
    this.updateComrades(dt);
    this.updateWave(dt);

    // gun anim
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.gun.position.set(0.17 + Math.sin(this.bob * 0.5) * 0.008 * moving, -0.14 + this.recoil * 0.015, -0.36 + this.recoil * 0.03);
    this.gun.rotation.x = this.recoil * 0.4;

    this.hud.target(this.target, this.selected);
    this.hud.select(this.selected, this.optCount());
    this.hud.stats(Math.max(1, this.wave), TOTAL_WAVES, this.score, this.saved, this.lost);
    this.updateIndicators();
  }

  private collide() {
    const h = this.world.half - RADIUS;
    for (const b of this.world.boxes) {
      const cx = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
      const dx = this.pos.x - cx, dz = this.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2); this.pos.x = cx + (dx / d) * RADIUS; this.pos.z = cz + (dz / d) * RADIUS; }
        else this.pos.z = b.maxZ + RADIUS;
      }
    }
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -h, h);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -h, h);
  }

  private optCount() { return this.target ? this.target.ask.options.length : 4; }

  private selectDart(i: number) {
    if (i < 0 || i > 3) return;
    if (i !== this.selected) sfx.select();
    this.selected = i;
    this.gunStripe.color.setHex(DART_HEX[i]);
  }

  private blocked(from: THREE.Vector3, to: THREE.Vector3) {
    const d = this.v3.subVectors(to, from);
    return this.world.boxes.some((b) => { const t = segBox(from, d, b); return t !== null && t < 0.97; });
  }

  private findTarget(dt: number) {
    const fwd = this.camera.getWorldDirection(this.v1);
    const assist = this.input.touchMode ? 0.13 : 0.06; // radians of aim help
    let best: Comrade | null = null, bestScore = Infinity;
    for (const c of this.comrades) {
      if (c.state !== 'wounded') continue;
      const to = this.v2.subVectors(c.center, this.camera.position);
      const dist = to.length();
      if (dist > 45) continue;
      const ang = to.normalize().angleTo(fwd);
      const allowed = Math.max(Math.atan(HIT_R / dist), assist);
      if (ang > allowed || ang / allowed > bestScore) continue;
      if (this.blocked(this.camera.position, c.center)) continue;
      best = c; bestScore = ang / allowed;
    }
    // keep the panel a moment after drifting off target, so it doesn't flicker
    if (best) { this.target = best; this.targetHold = 0.6; }
    else if ((this.targetHold -= dt) <= 0 || this.target?.state !== 'wounded') this.target = null;
    if (this.selected >= this.optCount()) this.selectDart(0);
  }

  private fire() {
    const d = this.darts.find((x) => !x.live && x.stuck <= 0) ?? this.darts[0];
    const cam = this.camera;
    const start = this.v1.set(0.16, -0.12, -0.55).applyMatrix4(cam.matrixWorld);
    d.mesh.position.copy(start);
    const aim = this.target && this.target.state === 'wounded' && this.lookingNear(this.target)
      ? this.target.center.clone()
      : cam.getWorldDirection(this.v2).multiplyScalar(60).add(cam.position);
    // aim slightly high to counter gravity
    const dist = aim.distanceTo(start);
    aim.y += 0.5 * GRAVITY * (dist / DART_SPEED) ** 2;
    d.vel.subVectors(aim, start).normalize().multiplyScalar(DART_SPEED);
    d.type = this.selected; d.live = true; d.stuck = 0; d.mesh.visible = true;
    d.mesh.material = this.dartMats[d.type];
    d.mesh.lookAt(this.v3.copy(d.mesh.position).add(d.vel));
    this.cooldown = 0.35; this.recoil = 1;
    sfx.fire();
  }

  private lookingNear(c: Comrade) {
    const to = this.v3.subVectors(c.center, this.camera.position);
    const dist = to.length();
    const allowed = Math.max(Math.atan(HIT_R / dist), this.input.touchMode ? 0.13 : 0.06) * 1.2;
    return to.normalize().angleTo(this.camera.getWorldDirection(this.v2)) < allowed;
  }

  private updateDarts(dt: number) {
    for (const d of this.darts) {
      if (d.stuck > 0) { d.stuck -= dt; if (d.stuck <= 0) d.mesh.visible = false; continue; }
      if (!d.live) continue;
      const p = d.mesh.position;
      d.vel.y -= GRAVITY * dt;
      const step = this.v1.copy(d.vel).multiplyScalar(dt);
      // nearest hit along this step
      let hitT = Infinity; let hitC: Comrade | null = null;
      for (const b of this.world.boxes) { const t = segBox(p, step, b); if (t !== null && t < hitT) hitT = t; }
      for (const c of this.comrades) {
        if (c.state !== 'wounded') continue;
        const t = segSphere(p, step, c.center, HIT_R);
        if (t !== null && t < hitT) { hitT = t; hitC = c; }
      }
      if (p.y + step.y <= 0 && hitT === Infinity) hitT = Math.max(0, -p.y / (step.y || -1));
      if (hitT !== Infinity) {
        p.addScaledVector(step, Math.min(1, hitT));
        d.live = false;
        if (hitC) { d.mesh.visible = false; this.answer(hitC, d.type); } else d.stuck = 2;
      } else {
        p.add(step);
        d.mesh.lookAt(this.v2.copy(p).add(d.vel));
        if (p.lengthSq() > 120 * 120) { d.live = false; d.mesh.visible = false; }
      }
    }
  }

  private answer(c: Comrade, type: number) {
    const ask = c.ask;
    if (type >= ask.options.length) return;
    const right = type === ask.answer;
    this.answered++;
    this.bank.record(ask.q.id, right);
    if (right) {
      this.correct++; this.saved++;
      this.score += 100 + Math.round(c.health);
      this.bank.release(ask.q.id);
      c.heal();
      sfx.correct();
      this.hud.toast('good', `✔ ${ask.options[ask.answer]}. ${c.name} is back up!`, ask.q.explain, 3500);
    } else {
      this.score = Math.max(0, this.score - 30);
      this.missed.push({ q: ask.q, picked: ask.options[type] });
      sfx.wrong();
      this.hud.toast('bad', `✘ Not "${ask.options[type]}". Answer: ${ask.options[ask.answer]}`, ask.q.explain, 6500);
      if (this.mode === 'combat') c.health = Math.max(1, c.health - 20);
      // same comrade, fresh question; the missed one comes back soon
      this.bank.release(ask.q.id);
      c.ask = this.bank.next();
    }
  }

  private updateComrades(dt: number) {
    const drain = this.mode === 'combat' ? 100 / Math.max(40, 75 - this.wave * 6) : 0;
    for (const c of this.comrades) {
      c.update(dt, drain);
      if (c.state === 'wounded' && c.health <= 0) {
        c.evac(); this.lost++;
        this.bank.release(c.ask.q.id);
        sfx.lost();
        this.hud.toast('bad', `${c.name} was evacuated. Answer was: ${c.ask.options[c.ask.answer]}`, c.ask.q.explain, 6000);
      }
    }
    this.comrades = this.comrades.filter((c) => c.state !== 'done');
  }

  private nextWave() {
    this.wave++;
    this.toSpawn = 2 + this.wave;
    this.spawnTimer = 1.2;
    this.waveDone = -1;
    this.hud.banner(`WAVE ${this.wave} · ${this.toSpawn} DOWN`);
    sfx.wave();
  }

  private updateWave(dt: number) {
    const wounded = this.comrades.filter((c) => c.state === 'wounded').length;
    this.spawnTimer -= dt;
    const maxActive = this.mode === 'calm' ? 2 : 4;
    if (this.toSpawn > 0 && wounded < maxActive && (this.spawnTimer <= 0 || wounded === 0)) {
      this.spawnComrade(); this.toSpawn--;
      this.spawnTimer = this.mode === 'calm' ? 3 : Math.max(4, 8 - this.wave);
    }
    if (this.toSpawn === 0 && wounded === 0 && this.waveDone < 0) this.waveDone = 2.5;
    if (this.waveDone > 0 && (this.waveDone -= dt) <= 0) {
      if (this.wave >= TOTAL_WAVES) this.finish();
      else this.nextWave();
    }
  }

  private spawnComrade() {
    const h = this.world.half - 2;
    let p = new THREE.Vector3();
    for (let i = 0; i < 60; i++) {
      p.set((Math.random() * 2 - 1) * h, 0, (Math.random() * 2 - 1) * h);
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d < 7 || d > 32) continue;
      if (this.world.boxes.some((b) => p.x > b.minX - 1 && p.x < b.maxX + 1 && p.z > b.minZ - 1 && p.z < b.maxZ + 1)) continue;
      if (this.comrades.some((c) => c.group.position.distanceTo(p) < 3)) continue;
      break;
    }
    const name = this.names[(this.saved + this.lost + this.comrades.length) % this.names.length];
    this.comrades.push(new Comrade(name, this.bank.next(), p, this.pos, this.world.scene));
    sfx.spawn();
  }

  private updateIndicators() {
    const out: { x: number; y: number; angle: number; color: string }[] = [];
    const W = innerWidth, H = innerHeight;
    for (const c of this.comrades) {
      if (c.state !== 'wounded') continue;
      const v = this.v2.copy(c.center).applyMatrix4(this.camera.matrixWorldInverse);
      const ndc = this.v3.copy(c.center).project(this.camera);
      if (v.z < 0 && Math.abs(ndc.x) < 0.95 && Math.abs(ndc.y) < 0.95) continue; // on screen
      const ang = Math.atan2(v.x, v.y); // 0 = up
      const rx = W / 2 - 34, ry = H / 2 - 34;
      const sx = Math.sin(ang), sy = Math.cos(ang);
      const k = Math.min(rx / Math.abs(sx || 1e-6), ry / Math.abs(sy || 1e-6));
      out.push({ x: W / 2 + sx * k, y: H / 2 - sy * k, angle: ang,
        color: c.health > 50 ? '#ffd23d' : c.health > 25 ? '#ff9a3d' : '#ff4d6d' });
    }
    this.hud.indicators(out);
  }

  private finish() {
    if (!this.running) return;
    this.running = false; this.paused = false;
    let best = 0;
    try {
      const key = `neonmedic.best.${this.mode}`;
      best = Math.max(+(localStorage.getItem(key) || 0), this.score);
      localStorage.setItem(key, String(best));
    } catch { best = this.score; }
    const summary: Summary = { mode: this.mode, score: this.score, best, saved: this.saved, lost: this.lost,
      answered: this.answered, correct: this.correct, missed: this.missed };
    this.cleanup();
    if (document.pointerLockElement) document.exitPointerLock();
    this.onEnd(summary);
  }

  private cleanup() {
    for (const c of this.comrades) { this.bank.release(c.ask.q.id); this.world.scene.remove(c.group); }
    this.comrades = [];
    for (const d of this.darts) { d.live = false; d.stuck = 0; d.mesh.visible = false; }
    this.target = null;
    this.hud.clear();
    document.getElementById('hud')!.classList.add('hidden');
  }
}

/** Segment p + d*t (0..1) vs sphere. Returns t of entry or null. */
function segSphere(p: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, r: number): number | null {
  const mx = p.x - c.x, my = p.y - c.y, mz = p.z - c.z;
  const a = d.x * d.x + d.y * d.y + d.z * d.z;
  const b = mx * d.x + my * d.y + mz * d.z;
  const cc = mx * mx + my * my + mz * mz - r * r;
  if (cc <= 0) return 0;
  const disc = b * b - a * cc;
  if (disc < 0 || a === 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : null;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
