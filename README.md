# Neon Medic: SEHS Field Training

A browser-based first-person study game for **IB SEHS (SL)**. Your squad is down on a neon battlefield.
Each wounded comrade shows a question about **planes, axes and movement types**. Load the dart that
matches the correct answer and shoot to heal them.

- Runs in Chrome on school Chromebooks, plus phones and tablets (installable as an app)
- No server: it's static files hosted free on GitHub Pages
- Spaced repetition: missed questions come back more often, and progress saves on each device
- Two modes: **Combat** (health drains) and **Calm** (no timer)

## Editing questions (no coding needed)

All questions live in [`public/questions.json`](public/questions.json). On GitHub, open the file,
click the ✏️ pencil, edit, then **Commit changes**. The site updates by itself in about a minute.

```json
{ "id": "pl-04", "topic": "Planes",
  "prompt": "Elbow flexion in a biceps curl happens in which plane?",
  "correct": "Sagittal",
  "wrong": ["Frontal (coronal)", "Transverse"],
  "explain": "Flexion and extension happen in the sagittal plane." }
```

- `id` must be unique. `topic` creates the topic buttons on the menu.
- Give 1–3 `wrong` answers. The order is shuffled in the game.
- Axis names differ between textbooks (e.g. "transverse axis" vs "mediolateral axis"). Edit them
  to match the terms your class uses.
- Write your own questions. Don't paste IB past-paper questions into a public repo, since they're copyrighted.

## Developing

```bash
npm install
npm run dev      # local dev server
npm run build    # production build into dist/
```

Pushing to `main` deploys through `.github/workflows/deploy.yml`.
One-time setup: in the repo, go to **Settings → Pages → Source: GitHub Actions**.

## Performance notes (low-end Chromebooks)

- About 20 draw calls, no shadows, no post-processing, instanced geometry
- Dynamic resolution drops render scale if FPS falls below 40 (the menu offers Auto / Low / High)
- About 140 KB gzipped JavaScript; there are no image or audio files to download

## Roadmap

- [x] Single-player loop, question bank, spaced repetition, touch controls, PWA
- [ ] Network connection test on school Wi-Fi (WebRTC vs WebSocket relay)
- [ ] Co-op multiplayer with room codes (2–4 medics)
- [ ] More SEHS topics (anatomy, energy systems, etc.)
