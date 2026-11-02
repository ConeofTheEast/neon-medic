// Question bank + spaced repetition (Leitner boxes), saved on this device.
export interface RawQ {
  id: string;
  topic: string;
  prompt: string;
  correct: string;
  wrong: string[];
  explain: string;
}
export interface AskedQ {
  q: RawQ;
  options: string[]; // shuffled, max 4
  answer: number; // index of correct option
}
interface Stat { box: number; seen: number; right: number }

const KEY = 'neonmedic.progress.v1';
// box 0 = never seen, 1 = missed last time, 5 = mastered
const WEIGHT = [6, 12, 4, 2, 1, 0.5];

function valid(q: any): q is RawQ {
  return q && typeof q.id === 'string' && typeof q.topic === 'string' && typeof q.prompt === 'string'
    && typeof q.correct === 'string' && Array.isArray(q.wrong) && q.wrong.length > 0;
}

export class QuestionBank {
  all: RawQ[] = [];
  topics: string[] = [];
  enabled = new Set<string>();
  private stats: Record<string, Stat> = {};
  private recent: string[] = [];
  private active = new Set<string>();

  async load(url: string) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list: unknown[] = Array.isArray(data) ? data : data.questions;
    this.all = list.filter(valid).map((q) => ({ ...q, explain: q.explain ?? '' }));
    if (!this.all.length) throw new Error('no valid questions');
    this.topics = [...new Set(this.all.map((q) => q.topic))];
    this.enabled = new Set(this.topics);
    try { this.stats = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { this.stats = {}; }
  }

  private stat(id: string): Stat {
    return this.stats[id] ?? { box: 0, seen: 0, right: 0 };
  }

  pool() {
    return this.all.filter((q) => this.enabled.has(q.topic));
  }

  next(): AskedQ {
    const pool = this.pool();
    let cands = pool.filter((q) => !this.active.has(q.id) && !this.recent.includes(q.id));
    if (!cands.length) cands = pool.filter((q) => !this.active.has(q.id));
    if (!cands.length) cands = pool;
    const weights = cands.map((q) => WEIGHT[this.stat(q.id).box] ?? 1);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let pick = cands[cands.length - 1];
    for (let i = 0; i < cands.length; i++) { r -= weights[i]; if (r <= 0) { pick = cands[i]; break; } }

    this.active.add(pick.id);
    this.recent.push(pick.id);
    if (this.recent.length > Math.min(6, Math.floor(pool.length / 2))) this.recent.shift();

    const opts = [pick.correct, ...shuffle(pick.wrong.slice()).slice(0, 3)];
    const order = shuffle(opts.map((_, i) => i));
    return { q: pick, options: order.map((i) => opts[i]), answer: order.indexOf(0) };
  }

  release(id: string) { this.active.delete(id); }

  record(id: string, right: boolean) {
    const s = this.stat(id);
    s.seen++;
    if (right) { s.right++; s.box = Math.min(5, Math.max(2, s.box + 1)); } else s.box = 1;
    this.stats[id] = s;
    try { localStorage.setItem(KEY, JSON.stringify(this.stats)); } catch { /* storage blocked: fine */ }
  }

  /** Per-topic mastery: share of questions answered right enough times (box >= 3). */
  mastery(topic?: string) {
    const qs = this.all.filter((q) => !topic || q.topic === topic);
    const mastered = qs.filter((q) => this.stat(q.id).box >= 3).length;
    const weak = qs.filter((q) => this.stat(q.id).box === 1).length;
    return { total: qs.length, mastered, weak };
  }

  reset() {
    this.stats = {};
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
