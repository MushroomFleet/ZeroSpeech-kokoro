# ZeroSpeech

> **Deterministic, latency-free NPC voice lines for React/TypeScript/Vite games.**  
> Position-as-seed TTS · 5+ billion unique voices · Dalek-style ring modulation · IndexedDB pre-baking · Zero runtime delay.

---

## What Is ZeroSpeech?

ZeroSpeech is a unified NPC speech system that chains three subsystems together behind a three-function API:

- **ZeroResponse** — procedural text generation from JSON profiles using `xxhash32` position-as-seed selection
- **ZeroVoice** — deterministic TTS voice assignment over KokoroTTS ONNX (~88 MB, runs fully locally), exposing over 5 billion unique mixed-gender voices derived from NPC spawn coordinates
- **DJZ-RingVoice** — Web Audio API ring modulation (Dalek / Cylon / robotic register) baked offline into stored audio

The central problem it solves is **generation latency**. Real-time TTS cannot be triggered at the moment an enemy fires a taunt — the synthesis delay breaks immersion. ZeroSpeech solves this by separating generation from playback entirely: voices are synthesised in the background from mission start, ring-processed offline, and stored in **IndexedDB** as ready-to-play PCM audio. Playback is a cache read and an `AudioBufferSourceNode` start — under 5ms.

The **ZeroBytes** position-as-seed principle governs everything: every nameless enemy pilot at spawn position `(x, y, z)` always says the same line in the same voice, across sessions, across machines, with zero stored state. Same coordinates → same voice → same text, always. No database. No saved files. O(1) lookup.

---

## Voice Capacity

The KokoroTTS ONNX model ships 26 base voices. ZeroVoice blends any two into a continuous space:

| Metric | Value |
|---|---|
| Base Kokoro voices | 26 |
| Unique unordered voice pairs | 325 |
| Blend resolution (float32 t) | ~4.3 billion |
| Pitch × Energy parameter space | ~4.3 billion |
| **Effective unique voices** | **> 10¹⁸** |

Voices cover American female (`af_*`), American male (`am_*`), British female (`bf_*`), and British male (`bm_*`) registers. A gender filter (mixed / female / male) is available per enemy class.

---

## The Three API Functions

```
GoonSpeech       — nameless enemies, rotating pre-generated pool
PersonaSpeech    — named NPCs, fixed voice + authored lines
NarrativeSpeech  — cutscenes and briefings, pre-generated at load time
```

### `GoonSpeech` — Nameless Enemy Pilots and Grunts

Draws from a rotating pool of 32 pre-generated voice lines per enemy class. The pool is filled in the background when the mission begins (sorted by proximity — closest enemies first). Consumed slots are regenerated asynchronously, keeping the pool perpetually fresh. Playback has zero generation delay.

```typescript
// Mission start — fill the pool in background (non-blocking)
prewarmGoonPool(backend, {
  profileKey: "drone_wing",
  profile:    droneWingProfile,    // JSON speech profile
  ringPreset: RING_PRESETS.classicDalek,
  poolSize:   32,
}, sortedEnemyPositions);

// Combat trigger — instant (<5ms)
const handle = await GoonSpeech(poolConfig, enemyPositions);
handle?.play();
```

### `PersonaSpeech` — Named NPCs

A named character has a fixed `voiceCoords` tuple that permanently locks their voice identity via the ZeroVoice derivation algorithm. Lines are authored text strings. First call generates and caches; every subsequent call is an instant IndexedDB read. Calling `prewarmPersona()` during the loading screen ensures zero cold-call latency in gameplay.

```typescript
const commanderAce: PersonaDefinition = {
  personaId:   "commander_ace",
  voiceCoords: [42, 17, 0],           // fixed → always the same voice
  ringPreset:  RING_PRESETS.cyborgBlend,
  lines: [
    "Wing Two, stay on my six. We hit the relay and pull out fast.",
    "Target acquired. Weapons free on my mark.",
    "Good kill. Reform on me — there are more inbound.",
  ],
};

await prewarmPersona(commanderAce);          // during loading
const handle = await PersonaSpeech(commanderAce, 0);
handle.play();
```

### `NarrativeSpeech` — Mission Briefings and Cutscenes

Identical architecture to PersonaSpeech but keyed by `narrativeId:speakerId`. Supports `ringPreset: null` for unprocessed human narrators. Call `prewarmNarrative()` with a progress callback during the loading screen; all lines are cached permanently.

```typescript
const mission03Briefing: NarrativeDefinition = {
  narrativeId: "mission_03_briefing",
  speakerId:   "admiral_kane",
  voiceCoords: [0, 0, 999],
  ringPreset:  null,                  // no ring mod — unprocessed narrator voice
  lines: [
    "Pilots, the relay station at sector seven has gone dark.",
    "Your orders are to investigate and neutralise any hostile presence.",
    "You have thirty minutes before the enemy reinforces. Do not waste them.",
  ],
};

await prewarmNarrative(mission03Briefing, (n, t) => updateLoadingBar(n / t));

for (let i = 0; i < mission03Briefing.lines.length; i++) {
  const handle = await NarrativeSpeech(mission03Briefing, i);
  handle.play();
  await new Promise(resolve => handle.onEnded(resolve));
}
```

---

## Ring Modulation Presets

Six presets extracted from the DJZ-RingVoice modulator, all available as `RING_PRESETS.*`:

| Key | Name | Carrier | Mix | Character |
|---|---|---|---|---|
| `classicDalek` | Classic Dalek | 30 Hz | 1.0 | Pure ring mod, 1963 BBC Radiophonic style |
| `modernDalek` | Modern Dalek | 50 Hz | 1.0 | Faster carrier, subtle LFO wobble |
| `cyborgBlend` | Cyborg Blend | 35 Hz | 0.5 | Half dry/wet — human-machine hybrid |
| `grittyAnalogue` | Gritty Analogue | 30 Hz | 1.0 | Heavy drive (2.5×), slight wobble |
| `alienRadio` | Alien Radio | 80 Hz | 0.85 | High carrier, triangle wave, LFO chatter |
| `wobbleDrone` | Wobble Drone | 20 Hz | 1.0 | Deep carrier, strong LFO — unstable drone voice |

Ring modulation is applied **offline** via `OfflineAudioContext` during the bake phase — zero DSP cost at playback. The processed PCM is stored directly in IndexedDB.

Signal chain (mirrors DJZ-RingVoice exactly):

```
AudioBuffer → BandpassFilter (100Hz–8kHz) → WaveShaper (tanh saturation)
  → GainNode (ring gain ← carrier oscillator)
  → LFO → LFO Gain → carrier.frequency
  → OfflineAudioContext destination → Float32Array PCM
```

---

## How ZeroBytes Position-as-Seed Works

Every property of every NPC voice is derived from spawn coordinates `(x, y, z)` and a `WORLD_SEED` using `xxhash64` with per-property salts:

```
xxhash64(WORLD_SEED XOR salt, [x, y, z]) → normalised float → property value
```

| Hash | Salt | Range | Property |
|---|---|---|---|
| #1 | `0x0001` | `[0, pool)` | Voice A index |
| #2 | `0x0002` | `[0, pool-1)` | Voice B index (≠ A) |
| #3 | `0x0003` | `[0.0, 1.0)` | Blend t |
| #4 | `0x0004` | `[0.85, 1.15]` | Pitch scale |
| #5 | `0x0005` | `[0.80, 1.20]` | Energy scale |
| Arc #1 | `0x0010` | `[0.20, 0.80]` | Curve warp |
| Arc #2 | `0x0011` | `[0.00, 0.30]` | Harmonic weight |
| Arc #3 | `0x0012` | `[-0.15, +0.15]` | Spectral skew |

Arc properties (curve warp, harmonic weight, spectral skew) are symmetric — `arc(A, B) == arc(B, A)` — computed from the sorted voice pair indices. They modulate the interpolation path between the two base voices, producing richer and more distinct blends than a simple linear lerp.

Text selection runs a parallel `xxhash32` derivation over the same coordinates, selecting templates and pool items from the enemy's speech profile JSON. The same position always selects the same sentence structure and vocabulary — coherent per-enemy identity with zero state.

---

## Repository Contents

| File | Purpose |
|---|---|
| `ZeroSpeechAce-TINS.md` | Complete TINS implementation specification — all steps, all code |
| `ZeroVoice-KokoroTTS-postV2-TINS.md` | ZeroVoice engine source — voice derivation, KokoroTTS ONNX, Zero-Quadratic arc system |
| `ZeroResponseSystem-adaptation-plan.md` | ZeroResponse headless module — xxhash32 engine, profile types, integration pattern |
| `RingVoiceModulator.jsx` | DJZ-RingVoice Web Audio API component — signal chain, all presets, oscilloscope UI |
| `drone_wing_profile.json` | Example enemy speech profile (Drone Wing Chatter — cybernetic pilot taunts) |

All files required for a complete implementation are present in this repository. `ZeroSpeechAce-TINS.md` references the other four files directly and describes exactly where each is used, so an implementor working from the TINS document has everything they need without external context.

---

## Speech Profile Format

Enemy speech profiles follow the ZeroResponse JSON schema demonstrated in `drone_wing_profile.json`:

```json
{
  "name": "My Enemy Class",
  "description": "Tone and register description.",
  "version": "1.0.0",
  "templates": [
    "{opener_directive}. {probability_statement}. {doom_assertion}.",
    "{status_declaration} — {organic_insult}. {taunt_closer}."
  ],
  "pools": {
    "opener_directive": ["COMBAT SUBROUTINE ENGAGED", "ACQUISITION CONFIRMED"],
    "probability_statement": ["PROBABILITY OF ESCAPE: ZERO", "OUTCOME CALCULATED — INEVITABLE"],
    "doom_assertion": ["YOU WILL BE DISMANTLED", "WE DO NOT MISS"],
    "organic_insult": ["YOUR CORTISOL LEVELS ARE DETECTABLE FROM HERE"],
    "status_declaration": ["WEAPONS HOT", "LOCK ACHIEVED"],
    "taunt_closer": ["THANK YOU FOR THE FLIGHT DATA", "NOTED — AND IGNORED"]
  }
}
```

Templates use `{placeholder}` tokens that are filled from matching pool arrays. The xxhash32 engine selects both the template and each pool item deterministically from the position seed. Adding a new enemy class requires only a new JSON file and a `profileKey` — no engine changes.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ZeroSpeechAce Module                         │
│                                                                     │
│  ┌──────────────┐  ┌────────────────┐  ┌───────────────────────┐   │
│  │ ZeroResponse │  │   ZeroVoice    │  │    RingModulator      │   │
│  │  engine.ts   │  │ (KokoroTTS via │  │  (OfflineAudioContext) │   │
│  │  (xxhash32   │  │  Tauri IPC or  │  │   baked at generate   │   │
│  │   text gen)  │  │  WASM port)    │  │   time, not playback) │   │
│  └──────┬───────┘  └───────┬────────┘  └──────────┬────────────┘   │
│         └──────────────────┴───────────────────────┘                │
│                            │                                        │
│                    ┌───────▼────────┐                               │
│                    │  SpeechBaker   │                               │
│                    │  text → TTS    │                               │
│                    │  → ring mod    │                               │
│                    │  → IndexedDB   │                               │
│                    └───────┬────────┘                               │
│                            │                                        │
│         ┌──────────────────┼──────────────────────┐                │
│         │                  │                      │                 │
│  ┌──────▼──────┐  ┌────────▼───────┐  ┌──────────▼──────┐         │
│  │ GoonSpeech  │  │ PersonaSpeech  │  │ NarrativeSpeech │         │
│  │ rotating    │  │ fixed voice +  │  │ pre-generated   │         │
│  │ pool of 32  │  │ authored lines │  │ at load time    │         │
│  └─────────────┘  └────────────────┘  └─────────────────┘         │
└─────────────────────────────────────────────────────────────────────┘
                            │
              < 5ms IndexedDB read + AudioBuffer decode >
                            │
                    AudioBufferSourceNode → speakers
```

---

## Getting Started

### 1. Install the single dependency

```bash
npm install xxhash-wasm
```

### 2. Copy the `src/speech/` module into your project

Follow the step-by-step instructions in `ZeroSpeechAce-TINS.md`. Each of the seven source files is specified in full with complete TypeScript code. The TINS document references `ZeroVoice-KokoroTTS-postV2-TINS.md`, `ZeroResponseSystem-adaptation-plan.md`, and `RingVoiceModulator.jsx` for the sections it extracts — all are in this repository.

### 3. Choose a KokoroTTS backend

- **Tauri desktop:** use `createTauriBackend()` — delegates synthesis to the Rust KokoroTTS ONNX session via Tauri IPC (full implementation in `ZeroVoice-KokoroTTS-postV2-TINS.md`)
- **Web/WASM:** implement the ONNX inference path using `ort-web` and eSpeak-NG WASM, following the `synth.rs` pipeline in `ZeroVoice-KokoroTTS-postV2-TINS.md`

### 4. Initialise at app startup

```typescript
import { initSpeech } from "./speech";
import { createTauriBackend } from "./speech/kokoro";

const backend = await createTauriBackend();
await initSpeech(backend);
```

### 5. Pre-warm at mission start, play in combat

```typescript
// Non-blocking background generation
prewarmGoonPool(backend, poolConfig, sortedEnemyPositions);

// Instant playback during gameplay
const handle = await GoonSpeech(poolConfig, positions);
handle?.play();
```

---

## Performance Characteristics

| Operation | Latency | Notes |
|---|---|---|
| `GoonSpeech` dispense | < 5ms | IndexedDB read + AudioBuffer decode only |
| `PersonaSpeech` warm call | < 5ms | Cache hit — no synthesis |
| `PersonaSpeech` cold call | TTS synthesis time | ~0.5–3s; only happens once per line, ever |
| Pool prewarm (32 entries) | Background, non-blocking | ~1–5s per entry; fills while gameplay begins |
| Ring modulation bake | < 2× audio duration | OfflineAudioContext renders faster than real-time |
| Memory per 1s of audio | ~96 KB | 24kHz mono float32 |
| Additional npm dependencies | 1 (`xxhash-wasm`) | All other subsystems use browser-native APIs |

---

## ZeroBytes Laws Compliance

| Law | Requirement | How ZeroSpeech Complies |
|---|---|---|
| 1 | Deterministic output from coordinates | xxhash64 + xxhash32 with world seed produce identical VoiceSpec and text for identical `(x,y,z)` inputs |
| 2 | No stored state per NPC | Voice and text derived purely from position — zero per-NPC database |
| 3 | Continuous parameter space | Pitch `[0.85–1.15]`, energy `[0.80–1.20]`, blend t `[0.0–1.0)` are all continuous |
| 4 | World seed support | `WORLD_SEED` bigint XOR'd into every hash — same position, different seed, different voice |
| 5 | Gender filtering | `GenderFilter` ("mixed"/"female"/"male") constrains the voice pool before index selection |
| 6 | Arc symmetry | `arc(A,B) == arc(B,A)` — indices sorted before hashing |
| 7 | O(1) lookup | Hash function only — no iteration, no search |
| 8 | Reproducibility | Same coordinates + same world seed + same profile = identical audio output |

---

## Extending ZeroSpeech

### Adding a new enemy speech class

1. Create `src/speech/profiles/my_enemy.json` following the `drone_wing_profile.json` schema
2. Import it and pass as `profile` in a `GoonPoolConfig` with a unique `profileKey`
3. No engine changes required

### Spatial audio

In `playback.ts`, insert a `PannerNode` between the `AudioBufferSourceNode` and `ctx.destination` using the enemy's world position. All three speech types gain 3D positional audio with no changes to generation.

### Subtitle display

`SpeechHandle.text` exposes the generated or authored text line. Wire this to your HUD subtitle system — no additional data pipeline needed.

### World seed per generated level

Pass `worldSeed: myLevelSeed` in `GoonPoolConfig` and to `deriveVoiceSpec`. The same enemy coordinates produce entirely different voices and text in different procedurally generated worlds.

---

## Glossary

| Term | Definition |
|---|---|
| **ZeroBytes** | Position-as-seed methodology: same coordinates always produce the same output, with no stored state |
| **ZeroResponse** | Procedural text generation using xxhash32 template and vocabulary pool selection |
| **ZeroVoice** | Deterministic TTS voice assignment via xxhash64 coordinate-to-VoiceSpec derivation over KokoroTTS |
| **DJZ-RingVoice** | Web Audio API ring modulator producing Dalek-register robotic voice effects |
| **SpeechBaker** | The offline pipeline: text generation → KokoroTTS synthesis → ring modulation → IndexedDB write |
| **GoonSpeech** | Pre-generated rotating voice pool for nameless enemies |
| **PersonaSpeech** | Fixed voice + authored lines for named NPCs, cached permanently |
| **NarrativeSpeech** | Pre-generated cutscene and briefing speech, cached permanently |
| **VoiceSpec** | The full parameter set (voice pair, blend, pitch, energy, arc properties) defining one unique voice |
| **RingPreset** | One ring modulation configuration (carrier frequency, LFO, drive, waveform, wet/dry mix) |
| **Baking** | The offline process of generating and processing a voice line before it is needed for playback |
| **WORLD_SEED** | A bigint XOR'd into all xxhash64 calls to differentiate voice universes across game worlds |
| **TINS** | There Is No Source — a distribution paradigm where only the README spec is distributed; AI generates the implementation |

---

## 📚 Citation

### Academic Citation

If you use this codebase in your research or project, please cite:

```bibtex
@software{zerospeech_kokoro,
  title  = {ZeroSpeech: Deterministic Latency-Free NPC Voice Lines for React/TypeScript/Vite Games},
  author = {Drift Johnson},
  year   = {2025},
  url    = {https://github.com/MushroomFleet/ZeroSpeech-kokoro},
  version = {1.0.0}
}
```

### Donate

[![Ko-Fi](https://cdn.ko-fi.com/cdn/kofi3.png?v=3)](https://ko-fi.com/driftjohnson)
