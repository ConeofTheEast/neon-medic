// A wounded squadmate. Low-poly, shared geometry, cheap animations.
import * as THREE from 'three';
import type { AskedQ } from './questions';

export const CALLSIGNS = ['VEX', 'KILO', 'NOVA', 'ROOK', 'SABLE', 'JINX', 'ECHO', 'TANGO', 'PIXEL', 'HALO', 'ZERO', 'RIFT', 'CIPHER', 'BLITZ'];

const G = {
  body: new THREE.CapsuleGeometry(0.28, 0.7, 3, 8),
  head: new THREE.SphereGeometry(0.2, 10, 8),
  visor: new THREE.BoxGeometry(0.3, 0.08, 0.12),
  pack: new THREE.BoxGeometry(0.36, 0.42, 0.18),
  marker: new THREE.OctahedronGeometry(0.3),
  ring: new THREE.RingGeometry(0.6, 0.75, 24),
  beam: new THREE.CylinderGeometry(0.8, 0.8, 30, 12, 1, true),
};
const M = {
  body: new THREE.MeshLambertMaterial({ color: 0x5a6aa0, emissive: 0x1c2450 }),
  head: new THREE.MeshLambertMaterial({ color: 0x4a3c70, emissive: 0x1a1236 }),
  visor: new THREE.MeshBasicMaterial({ color: 0x22e6ff }),
  pack: new THREE.MeshLambertMaterial({ color: 0x1c1830 }),
};

export type ComradeState = 'wounded' | 'healed' | 'lost' | 'done';
const RED = new THREE.Color(0xff3355), YEL = new THREE.Color(0xffd23d), GRN = new THREE.Color(0x6dff5a);

export class Comrade {
  group = new THREE.Group();
  private rig = new THREE.Group();
  private markerMat = new THREE.MeshBasicMaterial({ color: 0xffd23d, depthTest: false, transparent: true });
  private marker = new THREE.Mesh(G.marker, this.markerMat);
  private fx: THREE.Mesh | null = null;
  state: ComradeState = 'wounded';
  health = 100;
  private t = 0;
  private stand = 0;
  private runDir = new THREE.Vector3();
  private _c = new THREE.Vector3();

  constructor(public name: string, public ask: AskedQ, pos: THREE.Vector3, face: THREE.Vector3, private scene: THREE.Scene) {
    const body = new THREE.Mesh(G.body, M.body); body.position.y = 0.63;
    const head = new THREE.Mesh(G.head, M.head); head.position.y = 1.45;
    const visor = new THREE.Mesh(G.visor, M.visor); visor.position.set(0, 1.47, 0.15);
    const pack = new THREE.Mesh(G.pack, M.pack); pack.position.set(0, 0.85, -0.25);
    this.rig.add(body, head, visor, pack);
    this.group.add(this.rig);
    this.marker.renderOrder = 10; // seen through walls, like a ping
    this.group.add(this.marker);
    this.group.position.copy(pos);
    this.group.lookAt(face.x, 0, face.z);
    this.applyPose();
    scene.add(this.group);
  }

  /** Point to aim at (chest). */
  get center() {
    return this._c.set(this.group.position.x, this.group.position.y + 0.55 + this.stand * 0.4, this.group.position.z);
  }

  private applyPose() {
    // stand: 0 = slumped down, 1 = upright
    this.rig.position.y = -0.35 * (1 - this.stand);
    this.rig.rotation.x = -0.5 * (1 - this.stand);
  }

  heal() {
    this.state = 'healed'; this.t = 0;
    this.markerMat.color.copy(GRN);
    this.runDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const ring = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({ color: 0x6dff5a, transparent: true, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    this.group.add(ring); this.fx = ring;
  }

  evac() {
    this.state = 'lost'; this.t = 0;
    this.markerMat.color.copy(RED);
    const beam = new THREE.Mesh(G.beam, new THREE.MeshBasicMaterial({ color: 0xff3df0, transparent: true, opacity: 0.25, depthWrite: false }));
    beam.position.y = 15; this.group.add(beam); this.fx = beam;
  }

  update(dt: number, drainPerSec: number) {
    this.t += dt;
    this.marker.position.y = 2.0 + Math.sin(this.t * 3) * 0.12;
    this.marker.rotation.y += dt * 2;
    if (this.state === 'wounded') {
      this.health = Math.max(0, this.health - drainPerSec * dt);
      const k = this.health / 100;
      this.markerMat.color.copy(RED).lerp(YEL, k);
      const pulse = 1 + (1 - k) * 0.4 * Math.abs(Math.sin(this.t * (3 + (1 - k) * 6)));
      this.marker.scale.setScalar(pulse);
      this.rig.rotation.z = Math.sin(this.t * 1.3) * 0.05;
    } else if (this.state === 'healed') {
      this.stand = Math.min(1, this.stand + dt * 3);
      this.applyPose();
      if (this.fx) { const s = 1 + this.t * 5; this.fx.scale.setScalar(s); (this.fx.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - this.t * 1.5); }
      if (this.t > 0.9) {
        this.group.position.addScaledVector(this.runDir, dt * 5);
        this.group.lookAt(this.group.position.x + this.runDir.x, 0, this.group.position.z + this.runDir.z);
        this.rig.position.y = Math.abs(Math.sin(this.t * 12)) * 0.08;
      }
      if (this.t > 2.4) this.group.scale.setScalar(Math.max(0.01, 1 - (this.t - 2.4) * 3));
      if (this.t > 2.8) this.finish();
    } else if (this.state === 'lost') {
      this.rig.position.y += dt * 2.5;
      if (this.t > 1.6) this.finish();
    }
  }

  private finish() {
    this.state = 'done';
    this.scene.remove(this.group);
    this.markerMat.dispose();
    if (this.fx) (this.fx.material as THREE.Material).dispose();
  }
}
