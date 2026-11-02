import './style.css';
import { QuestionBank } from './questions';
import { Game, type Mode, type Quality, type Summary } from './game';
import { sfx } from './sfx';

const $ = (id: string) => document.getElementById(id)!;
const show = (id: string, on: boolean) => $(id).classList.toggle('hidden', !on);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const bank = new QuestionBank();
let game: Game;
let lastMode: Mode = 'combat';

function renderMenu() {
  const t = $('topics');
  t.innerHTML = '';
  for (const topic of bank.topics) {
    const b = document.createElement('button');
    b.textContent = topic;
    b.className = bank.enabled.has(topic) ? 'on' : '';
    b.onclick = () => {
      if (bank.enabled.has(topic)) { if (bank.enabled.size > 1) bank.enabled.delete(topic); }
      else bank.enabled.add(topic);
      renderMenu();
    };
    t.appendChild(b);
  }
  const m = bank.mastery();
  const pct = Math.round((m.mastered / m.total) * 100);
  $('mastery').innerHTML = `Mastery: <b>${m.mastered}/${m.total}</b> questions (${pct}%)` +
    (m.weak ? ` · <span style="color:#ff4d6d">${m.weak} need work</span>` : '') +
    `<div class="bar"><i style="width:${pct}%"></i></div>`;
}

function start(mode: Mode) {
  lastMode = mode;
  sfx.unlock();
  show('menu', false); show('debrief', false); show('pause', false);
  if (game.input.touchMode) {
    document.documentElement.requestFullscreen?.().catch(() => {});
    (screen.orientation as any)?.lock?.('landscape').catch(() => {});
  }
  game.start(mode);
}

function debrief(s: Summary) {
  const acc = s.answered ? Math.round((s.correct / s.answered) * 100) : 0;
  $('dStats').innerHTML = [
    [s.score, 'score'], [s.best, `best (${s.mode})`], [`${s.saved}`, 'comrades saved'],
    [`${acc}%`, 'accuracy'], [s.lost, 'evacuated'],
  ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  const seen = new Set<string>();
  const uniq = s.missed.filter((m) => !seen.has(m.q.id) && seen.add(m.q.id));
  show('dMissedH', uniq.length > 0);
  $('dMissed').innerHTML = uniq.length
    ? uniq.map((m) => `<div class="miss"><div>${esc(m.q.prompt)}</div>
        <div>You picked: ${esc(m.picked)} · <span class="a">Answer: ${esc(m.q.correct)}</span></div>
        <div class="e">${esc(m.q.explain)}</div></div>`).join('')
    : '<p style="color:#6dff5a">No mistakes. Excellent field work, medic.</p>';
  show('debrief', true);
  renderMenu();
}

async function boot() {
  try {
    await bank.load('questions.json');
  } catch (e) {
    $('loading').textContent = `Could not load questions.json (${(e as Error).message}).`;
    return;
  }
  show('loading', false);
  game = new Game($('c') as HTMLCanvasElement, bank);
  game.onEnd = debrief;
  if (location.search.includes('debug')) (window as any).game = game;
  game.onPauseRequest = () => { game.pause(); show('pause', true); };

  $('playCombat').onclick = () => start('combat');
  $('playCalm').onclick = () => start('calm');
  $('resumeBtn').onclick = () => { show('pause', false); game.resume(); };
  $('quitBtn').onclick = () => { show('pause', false); game.quit(); };
  $('againBtn').onclick = () => start(lastMode);
  $('menuBtn').onclick = () => { show('debrief', false); show('menu', true); };
  $('muteBtn').onclick = () => {
    sfx.setMuted(!sfx.muted);
    $('muteBtn').textContent = sfx.muted ? '🔇 Sound off' : '🔊 Sound on';
  };
  const qualities: Quality[] = ['auto', 'low', 'high'];
  let qi = 0;
  $('qualityBtn').onclick = () => {
    qi = (qi + 1) % 3; game.setQuality(qualities[qi]);
    $('qualityBtn').textContent = `Graphics: ${qualities[qi][0].toUpperCase()}${qualities[qi].slice(1)}`;
  };
  $('resetBtn').onclick = () => {
    if (confirm('Erase saved progress on this device?')) { bank.reset(); renderMenu(); }
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && game.isRunning && $('pause').classList.contains('hidden') && game.input.touchMode) game.onPauseRequest();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.isRunning && $('pause').classList.contains('hidden')) game.onPauseRequest();
  });
  renderMenu();
}

boot();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
