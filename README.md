# PixelSynth

A browser-based audio sequencer and synthesizer — draw notes on a pixel grid, watch them play back as synthesized sound in real time.

**[Live demo link here]** &nbsp;|&nbsp; Built with React · TypeScript · Tone.js · Canvas API

---

## What it does

You paint cells on a grid. Each row maps to a musical note; each column is a time step. As the playhead sweeps left-to-right, every lit cell triggers a synthesized note. The result is somewhere between a step sequencer, a generative art tool, and a DAW.

The full instrument panel includes:

| Component | What it is |
|-----------|------------|
| **Pixel Sequencer** | 128×64 canvas grid (up to 512×256). Draw, erase, or use the line tool. Undo/redo stack (50 levels). 6 procedural seed patterns. |
| **Drum Machine** | 8-voice step sequencer with layered synthesis per sound — kick uses a sub sine + pitch-decayed MembraneSynth + transient click, snare uses three noise layers, etc. |
| **Retro Keyboard** | 4 playable presets (piano, organ, lead, bass) with velocity-sensitive keys and recording. |
| **XY Pad** | 2D control surface. Three mapping modes: filter/reverb, delay/chorus, attack/release. |
| **Mood Grid** | 6×6 macro grid. Each row maps to a different parameter; toggling cells sets intensity. |
| **Mixer Strip** | Waveform, envelope (ADSR), filter, reverb, delay, chorus, compression, pan, swing. Grid transform tools: reverse, flip, shift, scatter, double, thin. |

---

## Audio architecture

The synth engine is built entirely in Tone.js with a deliberate signal chain:

```
Voice Pool (×12 round-robin)
  → Distortion  → Gain  → Filter (LP)
  → Chorus  → Delay  → Reverb
  → Limiter  → Analyser  → Master
```

Key decisions worth noting:

- **Round-robin voice pool instead of PolySynth** — avoids the voice-accumulation bug that causes clicks and CPU spikes when columns contain many simultaneous notes.
- **Ref-based parameter ramping** — effect nodes (filter, reverb, etc.) are updated via `rampTo()` on refs rather than re-creating nodes, so parameter changes are glitch-free during playback.
- **Swing timing** — the playback loop uses alternating step intervals (`baseInterval × (1 ± swing × 0.33)`) to produce a triplet-feel shuffle at swing=100.
- **MediaRecorder master capture** — the app taps `Tone.getDestination()` into a `createMediaStreamDestination()` node and pipes it to MediaRecorder, letting users export a WebM recording of their session.

---

## Scale modes

Five scales are supported, each transposable to any of the 7 root keys:

| Mode | Notes | Character |
|------|-------|-----------|
| Pentatonic | 5 | Safe and consonant — nothing clashes |
| Major | 7 | Bright, classic diatonic |
| Minor | 7 | Dark, emotional |
| Dorian | 7 | Minor with a raised 6th — jazz and funk |
| Chromatic | 12 | Every semitone — maximum grid density |

Each row of the grid maps to `scale[noteIndex % scale.length]`, with octave calculated as `floor(noteIndex / scale.length) + 2 + octaveShift`. Changing the scale recomputes all row-to-note mappings live, so patterns transform as you switch modes.

---

## Running locally

```bash
npm install
npm run dev
```

Requires Node 18+. No backend — runs entirely in the browser.

**Keyboard shortcuts**

| Key | Action |
|-----|--------|
| `Space` | Play / Stop |
| `D` / `E` / `L` | Draw / Erase / Line tool |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `1`–`8` | Trigger drum pads (instruments panel open) |
| `Z X C V B N M` | Piano white keys |
| `?` | Toggle shortcuts overlay |

---

## Session persistence

The app auto-saves your entire session to `localStorage` on every parameter change (600 ms debounce). Grid content, all synth parameters, theme, and scale mode are restored when you reopen the tab. Presets can also be exported as JSON and re-imported.

---

## Tech stack

- **React 18** — component tree, state management, keyboard event handling
- **TypeScript** — strict prop interfaces across all components
- **Tone.js** — Web Audio synthesis, effect nodes, scheduling
- **Canvas API** — grid rendering, waveform display, particle trail effects
- **Tailwind CSS** — layout and utility styling
- **Vite** — dev server and build

---

## Design

Designed in Figma with a retro terminal aesthetic — three colour themes (Amber, Violet, Ice), CRT scanline overlay, vignette, and monospace type throughout. The inverted mode flips primary and background colours for a light-theme variant.

The layout is built around the sequencer as the primary surface, with all controls living in collapsible sidebars and a bottom panel so the grid is never obscured.
