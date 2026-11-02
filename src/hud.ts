// All in-game DOM. Updates only when values change (cheap on Chromebooks).
import type { Comrade } from './comrade';

export const DART_CSS = ['#22e6ff', '#ff3df0', '#ffd23d', '#6dff5a'];
const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class Hud {
  onSelect: (i: number) => void = () => {};
  private panel = $('qpanel'); private who = $('qwho'); private text = $('qtext');
  private opts = $('qopts'); private hp = $('qhp').firstElementChild as HTMLElement;
  private toastEl = $('toast'); private bannerEl = $('banner'); private cross = $('crosshair');
  private bar = $('dartbar'); private indRoot = $('indicators');
  private inds: HTMLElement[] = [];
  private toastTimer = 0; private bannerTimer = 0;
  private lastKey = ''; private lastStats = ''; private lastSel = -1;
  private dartBtns: HTMLButtonElement[] = [];

  constructor() {
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('button');
      b.style.setProperty('--c', DART_CSS[i]); b.textContent = String(i + 1);
      b.addEventListener('click', () => this.onSelect(i));
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.onSelect(i); }, { passive: false });
      this.bar.appendChild(b); this.dartBtns.push(b);
    }
  }

  stats(wave: number, total: number, score: number, saved: number, lost: number) {
    const key = `${wave}|${score}|${saved}|${lost}`;
    if (key === this.lastStats) return;
    this.lastStats = key;
    $('sWave').innerHTML = `WAVE <b>${wave}/${total}</b>`;
    $('sScore').innerHTML = `SCORE <b>${score}</b>`;
    $('sSaved').innerHTML = `SAVED <b>${saved}</b>${lost ? ` · LOST <b>${lost}</b>` : ''}`;
  }

  fps(text: string) { $('fps').textContent = text; }

  select(i: number, count: number) {
    if (i === this.lastSel && count === this.dartBtns.filter((b) => !b.hidden).length) return;
    this.lastSel = i;
    this.dartBtns.forEach((b, j) => { b.classList.toggle('sel', j === i); b.hidden = j >= count; });
    this.opts.querySelectorAll('button').forEach((b, j) => b.classList.toggle('sel', j === i));
  }

  target(c: Comrade | null, selected: number) {
    this.cross.classList.toggle('lock', !!c);
    if (!c) { if (this.lastKey) { this.panel.classList.add('hidden'); this.lastKey = ''; } return; }
    this.hp.style.width = `${c.health}%`;
    this.hp.style.background = c.health > 50 ? '#6dff5a' : c.health > 25 ? '#ffd23d' : '#ff4d6d';
    const key = c.name + c.ask.q.id;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.panel.classList.remove('hidden');
    this.who.textContent = `⚕ ${c.name} needs a diagnosis · ${c.ask.q.topic}`;
    this.text.textContent = c.ask.q.prompt;
    this.opts.innerHTML = c.ask.options.map((o, i) =>
      `<button style="--c:${DART_CSS[i]}" class="${i === selected ? 'sel' : ''}"><span class="k">${i + 1}</span>${esc(o)}</button>`).join('');
    this.opts.querySelectorAll('button').forEach((b, i) => {
      b.addEventListener('click', () => this.onSelect(i));
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.onSelect(i); }, { passive: false });
    });
    this.lastSel = -1;
  }

  toast(kind: 'good' | 'bad' | 'info', head: string, body: string, ms: number) {
    this.toastEl.className = kind;
    this.toastEl.innerHTML = `<div class="h">${esc(head)}</div>${esc(body)}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  banner(text: string, ms = 2200) {
    this.bannerEl.textContent = text; this.bannerEl.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.remove('show'), ms);
  }

  /** Edge arrows for wounded comrades that are off screen. */
  indicators(list: { x: number; y: number; angle: number; color: string }[]) {
    while (this.inds.length < list.length) {
      const d = document.createElement('div'); d.className = 'ind'; this.indRoot.appendChild(d); this.inds.push(d);
    }
    this.inds.forEach((d, i) => {
      const it = list[i];
      if (!it) { d.style.display = 'none'; return; }
      d.style.display = '';
      d.style.left = it.x + 'px'; d.style.top = it.y + 'px';
      d.style.transform = `rotate(${it.angle}rad)`;
      d.style.setProperty('--c', it.color);
    });
  }

  clear() {
    this.panel.classList.add('hidden'); this.toastEl.classList.add('hidden');
    this.bannerEl.classList.remove('show'); this.indicators([]); this.lastKey = ''; this.lastStats = '';
  }
}
