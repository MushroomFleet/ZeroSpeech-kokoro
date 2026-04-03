<!--
  TINS Specification v1.0
  ZS:COMPLEXITY:HIGH
  ZS:PRIORITY:HIGH
  ZS:PLATFORM:WEB
  ZS:LANGUAGE:TYPESCRIPT
  ZS:VERSION:1.0.0
  ZS:STATUS:SPECIFICATION
  ZS:SCOPE:FULL-IMPLEMENTATION
  ZS:LAYER:ZEROBYTES + ZERO-RESPONSE + ZEROVOICE + RING-MODULATION
-->

# ZeroSpeechAce

> **TINS — There Is No Source.**
> This document is a complete implementation specification for ZeroSpeechAce v1.0.0.
> All reference files (`ZeroVoice-KokoroTTS-postV2-TINS.md`, `ZeroResponseSystem-adaptation-plan.md`,
> `RingVoiceModulator.jsx`, `drone_wing_profile.json`) are available alongside this file
> and are referenced directly throughout these instructions.

---

## 1. Description

**ZeroSpeechAce** is a self-contained, zero-dependency speech system for React/TypeScript/Vite games and applications. It unifies three existing subsystems — **ZeroResponse** (procedural text generation), **ZeroVoice** (KokoroTTS ONNX synthesis), and **DJZ-RingVoice** (ring modulation post-processing) — into a single importable module behind three clean public API functions.

The system solves the generation-latency problem inherent in real-time TTS by separating generation from playback entirely. Voices are synthesised in the background from mission start and stored in **IndexedDB**, ready for instant retrieval. A rotating pool ensures freshness without re-generating on demand. Ring modulation is applied once during generation and baked into the stored audio — zero processing cost at playback time.

The position-as-seed ZeroBytes principle governs all deterministic behaviour: enemy spawn coordinates drive both the text selection (ZeroResponse) and the voice identity (ZeroVoice), so every nameless pilot at position `(x, y, z)` will always say the same thing in the same voice across sessions and across machines, with no stored state.

### The Three Public Functions

| Function | Purpose | Voice Strategy | Pool Strategy |
|---|---|---|---|
| `GoonSpeech` | Nameless NPCs (enemy pilots, grunts) | Positionally-derived unique voice per NPC | Rotating pool; voices pre-generated and cached in IndexedDB |
| `PersonaSpeech` | Named NPCs (traders, commanders, wingmen) | Fixed VoiceID per character, authored lines | Fixed pool per character; generated once, re-used forever |
| `NarrativeSpeech` | Cutscenes, mission briefings, narration | Unique VoiceID per character, pre-written lines | Pre-generated at content build time; cached permanently |

### Reference Files Available at Implementation Time

- **`ZeroVoice-KokoroTTS-postV2-TINS.md`** — Full source of the ZeroVoice engine. Contains all Rust and TypeScript files, voice table, xxhash64 voice derivation logic, `KokoroSession` IPC interface, and the Zero-Quadratic arc property system. The implementor must read Section 3 (Technical Implementation) for the voice derivation algorithm and the Kokoro voice name table.
- **`ZeroResponseSystem-adaptation-plan.md`** — Full source of the ZeroResponse headless speech module. Contains `engine.ts` (xxhash32 + `generateResponse`), `types.ts` (`ResponseProfile` interface), and the integration pattern. The implementor must copy `engine.ts` verbatim.
- **`RingVoiceModulator.jsx`** — Full source of the DJZ-RingVoice Web Audio API ring modulator. Contains the `buildGraph` function with the complete signal chain: bandpass filter → waveshaper saturation → ring gain → LFO → analyser → output. The implementor must extract `buildGraph` as a standalone function that accepts an `AudioBuffer` source and returns a processed `AudioBuffer`.
- **`drone_wing_profile.json`** — An example enemy speech profile demonstrating the ZeroResponse JSON schema (`templates`, `pools`). Used as the reference profile for Goon-class enemies in implementation examples.

---

## 2. Functionality

### 2.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ZeroSpeechAce Module                         │
│                                                                     │
│  ┌──────────────┐  ┌────────────────┐  ┌───────────────────────┐   │
│  │ ZeroResponse │  │   ZeroVoice    │  │    RingModulator      │   │
│  │  engine.ts   │  │ (KokoroTTS via │  │  (Web Audio API,      │   │
│  │  (xxhash32   │  │  Tauri IPC or  │  │   offline offline     │   │
│  │   text gen)  │  │  WASM port)    │  │   OfflineAudioContext)│   │
│  └──────┬───────┘  └───────┬────────┘  └──────────┬────────────┘   │
│         │                  │                       │                │
│         └──────────────────┴───────────────────────┘                │
│                            │                                        │
│                    ┌───────▼────────┐                               │
│                    │  SpeechBaker   │                               │
│                    │ (generates &   │                               │
│                    │  ring-mods     │                               │
│                    │  AudioBuffer)  │                               │
│                    └───────┬────────┘                               │
│                            │                                        │
│                    ┌───────▼────────┐                               │
│                    │   IndexedDB    │                               │
│                    │   SpeechCache  │                               │
│                    │  (key → PCM    │                               │
│                    │   blob)        │                               │
│                    └───────┬────────┘                               │
│                            │                                        │
│         ┌──────────────────┼─────────────────────┐                 │
│         │                  │                     │                  │
│  ┌──────▼──────┐  ┌────────▼───────┐  ┌─────────▼──────┐          │
│  │ GoonSpeech  │  │ PersonaSpeech  │  │NarrativeSpeech │          │
│  │ (pool,      │  │ (fixed voice + │  │(pre-written +  │          │
│  │  rotating)  │  │  fixed lines)  │  │ unique voice)  │          │
│  └─────────────┘  └────────────────┘  └────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 ZeroBytes Voice Derivation (from ZeroVoice)

The voice assigned to any NPC is derived from its spawn coordinates `(x, y, z)` using the xxhash64 position-as-seed algorithm defined in `ZeroVoice-KokoroTTS-postV2-TINS.md`, Section 2.1.

The implementor must read that section in full. The key points reproduced here for reference:

- Six independent xxhash64 calls (one per property, each with a distinct salt and XOR'd with `WORLD_SEED`) produce: Voice A index `[0,26)`, Voice B index `[0,26)` (B ≠ A), blend `t [0,1)`, pitch scale `[0.85,1.15]`, energy scale `[0.80,1.20]`, region bias.
- The Zero-Quadratic arc table (precomputed 26×26 entries) adds `curve_warp`, `harmonic_weight`, `spectral_skew`, and `kinship` to each voice pair blend.
- The same `(x, y, z)` + `WORLD_SEED` always produces the same `VoiceSpec`. This is the VoiceID used to key the IndexedDB cache.

For the browser context (non-Tauri), the implementor must use `xxhash-wasm` (version `1.1.x`, `createXXHash64` default import) to replicate the hash logic in TypeScript, as shown in `ZeroVoice-KokoroTTS-postV2-TINS.md`, file `src/lib/voice.ts`.

### 2.3 ZeroResponse Text Generation (from ZeroResponseSystem)

Text lines are generated using the `generateResponse(seed, encounterIndex, profile)` function from `ZeroResponseSystem-adaptation-plan.md`, file `src/speech/engine.ts`. Copy this file verbatim — zero changes to the hash logic.

The `seed` passed to `generateResponse` is derived from the NPC's position: `positionToSeed(x, y)` using xxhash32 (for 3D games: `positionToSeed(x, y, z)` hashing all three).

Speech profiles follow the JSON schema demonstrated in `drone_wing_profile.json` — a `templates` array and a `pools` object with named string arrays. The `drone_wing_profile.json` file is the canonical example of a Goon-class enemy profile.

### 2.4 Ring Modulation Post-Processing (from RingVoiceModulator)

Ring modulation is applied **offline** (not in real time) during the bake phase using `OfflineAudioContext`. The signal chain is extracted from `RingVoiceModulator.jsx`, function `buildGraph`:

```
AudioBufferSourceNode → BiquadFilter (bandpass 100Hz–8kHz) → WaveShaper (tanh saturation)
  → GainNode (ring gain, gain driven by carrier OscillatorNode)
  → OscillatorNode (LFO → LFO GainNode → carrier.frequency)
  → AnalyserNode → OfflineAudioContext destination
```

Each enemy class carries a `RingPreset` (a subset of the PRESETS from `RingVoiceModulator.jsx`). The `drone_wing_profile.json` enemy class should default to the `"Classic Dalek"` preset (`freq: 30, mix: 1.0, lfoRate: 0, lfoDepth: 0, drive: 1.0, waveform: "sine"`).

### 2.5 IndexedDB Speech Cache

All generated audio is stored in IndexedDB as raw PCM `Float32Array` data (one channel or stereo depending on Kokoro output). The database is opened once at module init.

**Database name:** `ZeroSpeechAce`
**Object store:** `speech_cache`
**Key structure:** `{cacheKey: string}` where `cacheKey` is constructed differently per speech type (see Section 3.5).

Each record:
```typescript
{
  key: string,           // cache key
  pcm: Float32Array,     // raw PCM samples
  sampleRate: number,    // e.g. 24000 (Kokoro native)
  channels: number,      // 1 (mono)
  text: string,          // the text that was synthesised
  voiceSpec: VoiceSpec,  // the ZeroVoice spec used
  preset: RingPreset,    // the ring modulation preset applied
  createdAt: number,     // Date.now()
  poolSlot: number,      // 0..POOL_SIZE-1 (for Goon rotation)
}
```

### 2.6 GoonSpeech Pool Strategy

The Goon pool pre-generates `POOL_SIZE` (default: `32`) unique voice lines per enemy class at mission start. The pool is filled by a background worker, generating entries with varying `encounterIndex` values (0 through `POOL_SIZE - 1`) derived from positionally-diverse enemy positions in the current scene.

At playback time, `GoonSpeech` claims the next available pool slot using a round-robin pointer stored in `sessionStorage` (integer, wraps at `POOL_SIZE`). The claimed slot's record is flagged `poolSlot: CONSUMED` and regenerated asynchronously in the background, keeping the pool fresh.

**Pool fill priority:** Entries nearest the player position are generated first.

### 2.7 PersonaSpeech Fixed Pool Strategy

For named NPCs, the implementor provides a `PersonaDefinition`:

```typescript
interface PersonaDefinition {
  personaId: string;         // unique string, e.g. "commander_rex"
  voiceCoords: [number, number, number];  // fixed coords → deterministic VoiceID
  lines: string[];           // authored text lines, pre-written
  ringPreset: RingPreset;    // modulation style for this character
}
```

On first use, all lines in `lines[]` are synthesised and cached. On subsequent uses, cached audio is returned immediately. The `cacheKey` is `persona:{personaId}:line:{lineIndex}`. Cache is permanent (never evicted).

### 2.8 NarrativeSpeech Strategy

NarrativeSpeech is identical to PersonaSpeech but intended for mission briefings and cutscenes. It accepts a `NarrativeDefinition`:

```typescript
interface NarrativeDefinition {
  narrativeId: string;       // e.g. "mission_03_briefing"
  speakerId: string;         // e.g. "admiral_kane"
  voiceCoords: [number, number, number];
  lines: string[];
  ringPreset: RingPreset | null;  // null = no modulation (human narrators)
}
```

`cacheKey` is `narrative:{narrativeId}:{speakerId}:line:{lineIndex}`. NarrativeSpeech lines should be pre-generated before the scene begins (call `prewarmNarrative(def)` during the loading screen).

### 2.9 Playback

All three functions return a `Promise<SpeechHandle>`:

```typescript
interface SpeechHandle {
  play(): void;
  stop(): void;
  onEnded(cb: () => void): void;
  text: string;
  duration: number;  // seconds
}
```

Internally, playback decodes the stored `Float32Array` into an `AudioBuffer` and plays it via a `AudioBufferSourceNode` on the shared `AudioContext`. No Web Audio processing occurs at playback — the ring modulation is already baked in.

---

## 3. Technical Implementation

### 3.1 Module Directory Layout

```
src/
└── speech/
    ├── index.ts                  ← Public API: GoonSpeech, PersonaSpeech, NarrativeSpeech
    ├── types.ts                  ← All shared types and interfaces
    ├── engine.ts                 ← ZeroResponse engine (copied verbatim from ZeroResponseSystem)
    ├── voice.ts                  ← ZeroVoice browser port (xxhash64 voice derivation)
    ├── ring.ts                   ← Ring modulation offline baker (extracted from RingVoiceModulator)
    ├── cache.ts                  ← IndexedDB wrapper
    ├── baker.ts                  ← SpeechBaker: text → TTS → ring → IndexedDB
    ├── pool.ts                   ← GoonPool: rotating pool manager
    ├── kokoro.ts                 ← KokoroTTS interface (WASM or Tauri IPC)
    ├── playback.ts               ← SpeechHandle + AudioContext management
    └── profiles/
        └── (speech profile JSON files, following drone_wing_profile.json schema)
```

### 3.2 Step 1 — Install Dependencies

```bash
npm install xxhash-wasm
```

`xxhash-wasm` version `1.1.x`. No other new dependencies are required beyond what the host React/TypeScript/Vite project already provides.

### 3.3 Step 2 — Create `src/speech/types.ts`

Define all shared types. The `ResponseProfile` interface and `VoiceSpec` type are both required.

```typescript
// src/speech/types.ts

/** ZeroResponse profile shape — matches drone_wing_profile.json and all Dungeon-Speech-*.json files */
export interface ResponseProfile {
  name: string;
  description: string;
  version: string;
  templates: string[];
  pools: Record<string, string[]>;
}

/** Derived from ZeroVoice-KokoroTTS-postV2-TINS.md Section 2.1 */
export interface VoiceSpec {
  voiceA: string;           // e.g. "af_nova"
  voiceB: string;           // e.g. "bm_lewis"
  blendT: number;           // [0.0, 1.0)
  pitchScale: number;       // [0.85, 1.15]
  energyScale: number;      // [0.80, 1.20]
  arcIndex: number;         // unordered pair index in arc table
  curveWarp: number;        // [0.2, 0.8]
  harmonicWeight: number;   // [0.0, 0.3]
  spectralSkew: number;     // [-0.15, +0.15]
  kinship: number;          // [0.0, 1.0]
}

/** Extracted from RingVoiceModulator.jsx PRESETS array */
export interface RingPreset {
  name: string;
  freq: number;       // carrier frequency Hz
  mix: number;        // wet/dry [0.0, 1.0]
  lfoRate: number;    // LFO rate Hz
  lfoDepth: number;   // LFO depth Hz
  drive: number;      // waveshaper drive [1.0, 5.0]
  waveform: OscillatorType;
}

/** All presets from RingVoiceModulator.jsx — copy the PRESETS array verbatim */
export const RING_PRESETS: Record<string, RingPreset> = {
  classicDalek:    { name: "Classic Dalek",    freq: 30, mix: 1.0, lfoRate: 0,   lfoDepth: 0,  drive: 1.0, waveform: "sine" },
  modernDalek:     { name: "Modern Dalek",     freq: 50, mix: 1.0, lfoRate: 1.5, lfoDepth: 5,  drive: 1.2, waveform: "sine" },
  cyborgBlend:     { name: "Cyborg Blend",     freq: 35, mix: 0.5, lfoRate: 0,   lfoDepth: 0,  drive: 1.0, waveform: "sine" },
  grittyAnalogue:  { name: "Gritty Analogue",  freq: 30, mix: 1.0, lfoRate: 0.8, lfoDepth: 3,  drive: 2.5, waveform: "sine" },
  alienRadio:      { name: "Alien Radio",      freq: 80, mix: 0.85,lfoRate: 2.0, lfoDepth: 10, drive: 1.5, waveform: "triangle" },
  wobbleDrone:     { name: "Wobble Drone",     freq: 20, mix: 1.0, lfoRate: 3.0, lfoDepth: 15, drive: 1.0, waveform: "sine" },
};

export interface PersonaDefinition {
  personaId: string;
  voiceCoords: [number, number, number];
  lines: string[];
  ringPreset: RingPreset;
}

export interface NarrativeDefinition {
  narrativeId: string;
  speakerId: string;
  voiceCoords: [number, number, number];
  lines: string[];
  ringPreset: RingPreset | null;
}

export interface SpeechCacheRecord {
  key: string;
  pcm: Float32Array;
  sampleRate: number;
  channels: number;
  text: string;
  voiceSpec: VoiceSpec;
  preset: RingPreset | null;
  createdAt: number;
  poolSlot: number;
}

export interface SpeechHandle {
  play(): void;
  stop(): void;
  onEnded(cb: () => void): void;
  readonly text: string;
  readonly duration: number;
}

export interface GoonRequest {
  x: number;
  y: number;
  z: number;
  profile: ResponseProfile;
  encounterIndex?: number;
  ringPreset?: RingPreset;
  worldSeed?: bigint;
}

export interface GoonPoolConfig {
  profileKey: string;
  profile: ResponseProfile;
  ringPreset: RingPreset;
  poolSize?: number;           // default: 32
  worldSeed?: bigint;
}

/** GOON_POOL_SIZE: number of pre-generated entries per enemy class */
export const GOON_POOL_SIZE = 32;

/** DB_VERSION: bump this if the schema changes */
export const DB_VERSION = 1;
export const DB_NAME = "ZeroSpeechAce";
export const DB_STORE = "speech_cache";
```

### 3.4 Step 3 — Copy `src/speech/engine.ts`

Copy `engine.ts` **verbatim** from `ZeroResponseSystem-adaptation-plan.md` (the file labelled `src/speech/engine.ts` in that document). Do not modify any hash logic. The exported functions required are:

- `xxhash32(data: number[], seed: number): number`
- `generateResponse(seed: number, promptIdx: number, profile: ResponseProfile): string`
- `positionToSeed(x: number, y: number): number`

For three-dimensional positions, add this helper at the bottom of the copied file:

```typescript
/** 3D variant: hashes (x, y, z) into a 32-bit seed */
export function positionToSeed3D(x: number, y: number, z: number): number {
  // Encode z into the seed input by hashing the result of positionToSeed(x,y) with z
  const seed2d = positionToSeed(x, y);
  return xxhash32([z & 0xff, (z >> 8) & 0xff, (z >> 16) & 0xff, (z >> 24) & 0xff], seed2d);
}
```

### 3.5 Step 4 — Create `src/speech/voice.ts`

This is the browser port of the ZeroVoice voice derivation logic. Read `ZeroVoice-KokoroTTS-postV2-TINS.md`, file `src/lib/voice.ts`, in full, then implement the following:

```typescript
// src/speech/voice.ts
// Browser port of ZeroVoice position-as-seed voice derivation.
// Reference: ZeroVoice-KokoroTTS-postV2-TINS.md — src/lib/voice.ts
// Uses xxhash-wasm (createXXHash64) for 64-bit hashing.

import createXXHash64 from "xxhash-wasm";
import type { VoiceSpec } from "./types";

/** The 26-voice Kokoro voice table. 
 *  Copy the full VOICE_TABLE array from ZeroVoice-KokoroTTS-postV2-TINS.md src/lib/voice.ts.
 *  Indices 0-9: af_* (American female), 10-17: am_* (American male),
 *  18-21: bf_* (British female), 22-25: bm_* (British male). */
export const VOICE_TABLE: string[] = [
  "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica",
  "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah",
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam",
  "am_michael", "am_onyx", "am_puck",
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
];

export type GenderFilter = "mixed" | "female" | "male";

const FEMALE_INDICES = [0,1,2,3,4,5,6,7,8,9,18,19,20,21];
const MALE_INDICES   = [10,11,12,13,14,15,16,17,22,23,24,25];

let hasher: Awaited<ReturnType<typeof createXXHash64>> | null = null;

export async function initVoiceHasher(): Promise<void> {
  hasher = await createXXHash64();
}

/** Derive a [0,1) float from xxhash64 of (worldSeed XOR salt, x, y, z) */
function hashProperty(
  worldSeed: bigint,
  salt: bigint,
  x: number, y: number, z: number
): number {
  if (!hasher) throw new Error("Voice hasher not initialised — call initVoiceHasher() first");
  // Encode coordinates as little-endian bytes
  const buf = new ArrayBuffer(12);
  const view = new DataView(buf);
  view.setInt32(0, x, true);
  view.setInt32(4, y, true);
  view.setInt32(8, z, true);
  const seed64 = (worldSeed ^ salt) & 0xffffffffffffffffn;
  const hash = hasher.h64Raw(new Uint8Array(buf), seed64);
  // Normalise to [0,1)
  return Number(hash & 0x7fffffffffffffffn) / Number(0x7fffffffffffffffn);
}

/** 
 * Derive a deterministic VoiceSpec from NPC spawn coordinates.
 * Implements the ZeroBytes Laws from ZeroVoice-KokoroTTS-postV2-TINS.md Section 2.1.
 * The arc property computation follows ZeroVoice src/lib/voice.ts `resolveVoiceSpec`.
 */
export function deriveVoiceSpec(
  x: number, y: number, z: number,
  worldSeed: bigint = 0n,
  genderFilter: GenderFilter = "mixed"
): VoiceSpec {
  // Filter pool by gender
  let pool: number[];
  if (genderFilter === "female") pool = FEMALE_INDICES;
  else if (genderFilter === "male") pool = MALE_INDICES;
  else pool = VOICE_TABLE.map((_, i) => i);

  const fA = hashProperty(worldSeed, 0x0001n, x, y, z);
  const fB = hashProperty(worldSeed, 0x0002n, x, y, z);
  const fT = hashProperty(worldSeed, 0x0003n, x, y, z);
  const fP = hashProperty(worldSeed, 0x0004n, x, y, z);
  const fE = hashProperty(worldSeed, 0x0005n, x, y, z);

  const idxA = Math.floor(fA * pool.length);
  let idxB = Math.floor(fB * (pool.length - 1));
  if (idxB >= idxA) idxB += 1;  // ensure B != A

  const voiceIdxA = pool[idxA];
  const voiceIdxB = pool[idxB];

  // Arc properties — symmetric, sort indices before hashing
  const lo = Math.min(voiceIdxA, voiceIdxB);
  const hi = Math.max(voiceIdxA, voiceIdxB);
  const arcIndex = lo * 26 + hi;

  const fCW  = hashProperty(worldSeed, 0x0010n, lo, hi, 0);
  const fHW  = hashProperty(worldSeed, 0x0011n, lo, hi, 0);
  const fSS  = hashProperty(worldSeed, 0x0012n, lo, hi, 0);

  return {
    voiceA:         VOICE_TABLE[voiceIdxA],
    voiceB:         VOICE_TABLE[voiceIdxB],
    blendT:         fT,
    pitchScale:     0.85 + fP * 0.30,   // [0.85, 1.15]
    energyScale:    0.80 + fE * 0.40,   // [0.80, 1.20]
    arcIndex,
    curveWarp:      0.20 + fCW * 0.60,  // [0.20, 0.80]
    harmonicWeight: fHW * 0.30,          // [0.00, 0.30]
    spectralSkew:   (fSS - 0.5) * 0.30, // [-0.15, +0.15]
    kinship:        0,                   // computed separately from voice geometry
  };
}

/** Build a deterministic string key from a VoiceSpec for use as a cache prefix */
export function voiceSpecKey(spec: VoiceSpec): string {
  return [
    spec.voiceA, spec.voiceB,
    spec.blendT.toFixed(4),
    spec.pitchScale.toFixed(4),
    spec.energyScale.toFixed(4),
    spec.arcIndex,
  ].join(":");
}
```

### 3.6 Step 5 — Create `src/speech/kokoro.ts`

This is the TTS synthesis interface. The system supports two backends: Tauri IPC (desktop) and a WASM port. For web-only targets, implement the WASM path using the KokoroTTS ONNX model loaded via `ort-web`.

Reference: `ZeroVoice-KokoroTTS-postV2-TINS.md` — the Rust `synthesise` command and the TypeScript `useSynthesis.ts` hook show the exact call signature and the PCM float array return format.

```typescript
// src/speech/kokoro.ts
// KokoroTTS synthesis interface.
// Reference: ZeroVoice-KokoroTTS-postV2-TINS.md — src-tauri/src/synth.rs (Rust backend)
// and src/hooks/useSynthesis.ts (IPC call pattern).
//
// The synthesise call accepts:
//   text: string
//   voice_a: string       (Kokoro voice name e.g. "af_nova")
//   voice_b: string
//   blend_t: number       [0,1)
//   pitch_scale: number
//   energy_scale: number
// And returns Float32Array of PCM samples at 24000 Hz, mono.
//
// For Tauri desktop targets: use invoke("synthesise", {...}) from @tauri-apps/api/core
// For web/WASM targets: load the KokoroTTS ONNX int8 model (~88MB) via ort-web,
//   implement phonemisation via eSpeak-NG WASM, and replicate the ONNX inference
//   pipeline shown in ZeroVoice-KokoroTTS-postV2-TINS.md src-tauri/src/synth.rs.
//
// The public contract of this module is:

import type { VoiceSpec } from "./types";

export interface KokoroBackend {
  synthesise(text: string, spec: VoiceSpec): Promise<Float32Array>;
  readonly sampleRate: number;  // Always 24000 for KokoroTTS
}

// ---------- Tauri IPC Backend ----------
// Use this in Tauri desktop builds.
// Requires: @tauri-apps/api

export async function createTauriBackend(): Promise<KokoroBackend> {
  const { invoke } = await import("@tauri-apps/api/core");
  return {
    sampleRate: 24000,
    async synthesise(text: string, spec: VoiceSpec): Promise<Float32Array> {
      const samples: number[] = await invoke("synthesise", {
        text,
        voiceA:      spec.voiceA,
        voiceB:      spec.voiceB,
        blendT:      spec.blendT,
        pitchScale:  spec.pitchScale,
        energyScale: spec.energyScale,
        // Arc properties are passed for ZeroQuadratic blending in Rust
        curveWarp:      spec.curveWarp,
        harmonicWeight: spec.harmonicWeight,
        spectralSkew:   spec.spectralSkew,
      });
      return new Float32Array(samples);
    },
  };
}

// ---------- WASM Backend (stub) ----------
// For full web builds, implement ONNX inference here.
// The model file is: kokoro-v0_19-half.onnx (int8 quantised, ~73MB)
// Load via ort-web: https://onnxruntime.ai/docs/tutorials/web/
// Phonemiser: eSpeak-NG compiled to WASM.
// Full inference pipeline: see ZeroVoice-KokoroTTS-postV2-TINS.md src-tauri/src/synth.rs
//   function `synthesise_inner` for the exact tensor shapes and inference loop.
// This stub must be replaced with a working ONNX inference implementation.
export async function createWasmBackend(_modelUrl: string): Promise<KokoroBackend> {
  throw new Error(
    "WASM KokoroTTS backend not yet implemented. " +
    "Implement ONNX inference from ZeroVoice-KokoroTTS-postV2-TINS.md src-tauri/src/synth.rs. " +
    "Or use createTauriBackend() for desktop targets."
  );
}
```

### 3.7 Step 6 — Create `src/speech/ring.ts`

Extract the signal chain from `RingVoiceModulator.jsx` `buildGraph` function and re-implement it for offline batch processing using `OfflineAudioContext`. The key difference: instead of a live `MediaStreamSource`, the input is an `AudioBuffer` decoded from KokoroTTS PCM samples.

```typescript
// src/speech/ring.ts
// Offline ring modulation baker.
// Signal chain extracted from RingVoiceModulator.jsx buildGraph().
// Uses OfflineAudioContext so processing is faster-than-realtime and produces
// a Float32Array result without live audio output.

import type { RingPreset } from "./types";

/**
 * Apply ring modulation to a Float32Array of PCM samples.
 * Processes offline (no audio output — CPU-bound, non-blocking via await).
 * Returns a new Float32Array of processed PCM at the same sample rate.
 *
 * Signal chain (mirrors RingVoiceModulator.jsx buildGraph exactly):
 *   source → bandpass (100Hz–8kHz, Q=0.4) → waveshaper (tanh drive)
 *   → ringGain (gain driven by carrier OSC) → carrier LFO → analyser → output
 *
 * When preset.mix < 1.0, a dry/wet blend is applied at the output.
 */
export async function applyRingModulation(
  pcm: Float32Array,
  sampleRate: number,
  preset: RingPreset
): Promise<Float32Array> {
  const numSamples = pcm.length;
  const duration = numSamples / sampleRate;

  // Create offline context with enough length for the full audio
  const offlineCtx = new OfflineAudioContext(1, numSamples, sampleRate);

  // Decode PCM → AudioBuffer
  const inputBuffer = offlineCtx.createBuffer(1, numSamples, sampleRate);
  inputBuffer.copyToChannel(pcm, 0);
  const source = offlineCtx.createBufferSource();
  source.buffer = inputBuffer;

  // Pre-bandpass filter — matches RingVoiceModulator.jsx lines 189-193
  const bpFilter = offlineCtx.createBiquadFilter();
  bpFilter.type = "bandpass";
  bpFilter.frequency.value = 2000;
  bpFilter.Q.value = 0.4;

  // Waveshaper saturation — matches RingVoiceModulator.jsx lines 195-204
  const waveshaper = offlineCtx.createWaveShaper();
  const curve = new Float32Array(256);
  const drive = preset.drive;
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  waveshaper.curve = curve;
  waveshaper.oversample = "4x";

  // Ring modulator gain node — matches RingVoiceModulator.jsx lines 206-209
  const ringGain = offlineCtx.createGain();
  ringGain.gain.value = 0; // carrier drives this

  // Carrier oscillator — matches RingVoiceModulator.jsx lines 211-215
  const carrier = offlineCtx.createOscillator();
  carrier.type = preset.waveform;
  carrier.frequency.value = preset.freq;

  // LFO → LFO gain → carrier frequency — matches RingVoiceModulator.jsx lines 217-226
  const lfoGain = offlineCtx.createGain();
  lfoGain.gain.value = preset.lfoDepth;
  if (preset.lfoRate > 0) {
    const lfo = offlineCtx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = preset.lfoRate;
    lfo.connect(lfoGain);
    lfoGain.connect(carrier.frequency);
    lfo.start(0);
  }

  // Carrier drives ringGain.gain
  carrier.connect(ringGain.gain);

  // Wet path: source → bpFilter → waveshaper → ringGain → destination
  source.connect(bpFilter);
  bpFilter.connect(waveshaper);
  waveshaper.connect(ringGain);

  // Dry/wet mix
  if (preset.mix < 1.0) {
    // Wet gain
    const wetGain = offlineCtx.createGain();
    wetGain.gain.value = preset.mix;
    ringGain.connect(wetGain);
    wetGain.connect(offlineCtx.destination);
    // Dry gain
    const dryGain = offlineCtx.createGain();
    dryGain.gain.value = 1.0 - preset.mix;
    source.connect(dryGain);
    dryGain.connect(offlineCtx.destination);
  } else {
    ringGain.connect(offlineCtx.destination);
  }

  carrier.start(0);
  source.start(0);

  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

/** Skip ring modulation — returns the input PCM unchanged (used for human narrators). */
export function passthrough(pcm: Float32Array): Float32Array {
  return pcm;
}
```

### 3.8 Step 7 — Create `src/speech/cache.ts`

```typescript
// src/speech/cache.ts
// IndexedDB wrapper for ZeroSpeechAce.
// Database: "ZeroSpeechAce", Store: "speech_cache", Key: record.key (string)

import { DB_NAME, DB_STORE, DB_VERSION, type SpeechCacheRecord } from "./types";

let db: IDBDatabase | null = null;

export async function openCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = (e.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(DB_STORE)) {
        database.createObjectStore(DB_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = (e) => { db = (e.target as IDBOpenDBRequest).result; resolve(); };
    req.onerror   = () => reject(req.error);
  });
}

function getStore(mode: IDBTransactionMode): IDBObjectStore {
  if (!db) throw new Error("Cache not opened — call openCache() first");
  return db.transaction(DB_STORE, mode).objectStore(DB_STORE);
}

export async function cacheGet(key: string): Promise<SpeechCacheRecord | null> {
  return new Promise((resolve, reject) => {
    const req = getStore("readonly").get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

export async function cachePut(record: SpeechCacheRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = getStore("readwrite").put(record);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function cacheDelete(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = getStore("readwrite").delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** List all keys with a given prefix */
export async function cacheListKeys(prefix: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const range = IDBKeyRange.bound(prefix, prefix + "\uffff");
    const req = getStore("readonly").getAllKeys(range);
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror   = () => reject(req.error);
  });
}

/** Count records with a given prefix */
export async function cacheCount(prefix: string): Promise<number> {
  const keys = await cacheListKeys(prefix);
  return keys.length;
}
```

### 3.9 Step 8 — Create `src/speech/baker.ts`

The `SpeechBaker` is the core production pipeline: text + VoiceSpec → KokoroTTS PCM → ring modulation → IndexedDB record.

```typescript
// src/speech/baker.ts
// SpeechBaker: orchestrates text → TTS → ring-mod → cache write.

import { applyRingModulation, passthrough } from "./ring";
import { cachePut } from "./cache";
import type { KokoroBackend } from "./kokoro";
import type { RingPreset, SpeechCacheRecord, VoiceSpec } from "./types";

export interface BakeOptions {
  key: string;
  text: string;
  spec: VoiceSpec;
  preset: RingPreset | null;
  poolSlot?: number;
}

/**
 * Generate one speech entry: synthesise via KokoroTTS, apply ring modulation,
 * write result to IndexedDB. Returns the completed SpeechCacheRecord.
 * This function is async and designed to be called from a background queue.
 */
export async function bakeEntry(
  backend: KokoroBackend,
  opts: BakeOptions
): Promise<SpeechCacheRecord> {
  // 1. Synthesise raw PCM via KokoroTTS
  const rawPcm = await backend.synthesise(opts.text, opts.spec);

  // 2. Apply ring modulation offline (or passthrough for null preset)
  const processedPcm = opts.preset
    ? await applyRingModulation(rawPcm, backend.sampleRate, opts.preset)
    : passthrough(rawPcm);

  // 3. Build cache record
  const record: SpeechCacheRecord = {
    key:        opts.key,
    pcm:        processedPcm,
    sampleRate: backend.sampleRate,
    channels:   1,
    text:       opts.text,
    voiceSpec:  opts.spec,
    preset:     opts.preset,
    createdAt:  Date.now(),
    poolSlot:   opts.poolSlot ?? -1,
  };

  // 4. Write to IndexedDB
  await cachePut(record);

  return record;
}
```

### 3.10 Step 9 — Create `src/speech/pool.ts`

The `GoonPool` manages the rotating pre-generated voice pool for nameless enemies.

```typescript
// src/speech/pool.ts
// GoonPool: rotating IndexedDB pool of pre-generated goon voice lines.
// Pre-generates POOL_SIZE entries per enemy class at mission start.
// Dispenses entries round-robin; regenerates consumed slots in the background.

import { generateResponse, positionToSeed3D } from "./engine";
import { deriveVoiceSpec } from "./voice";
import { bakeEntry } from "./baker";
import { cacheGet, cacheListKeys } from "./cache";
import type { KokoroBackend } from "./kokoro";
import type { GoonPoolConfig, RingPreset, SpeechCacheRecord } from "./types";
import { GOON_POOL_SIZE } from "./types";

/** Pointer persisted per session to enable round-robin dispensing */
const POINTER_KEY_PREFIX = "zsa_pool_ptr:";

function getPointer(profileKey: string): number {
  return parseInt(sessionStorage.getItem(POINTER_KEY_PREFIX + profileKey) ?? "0", 10);
}

function advancePointer(profileKey: string, poolSize: number): void {
  const next = (getPointer(profileKey) + 1) % poolSize;
  sessionStorage.setItem(POINTER_KEY_PREFIX + profileKey, String(next));
}

/** Cache key for a pool slot */
function slotKey(profileKey: string, slot: number): string {
  return `goon:${profileKey}:slot:${slot}`;
}

/**
 * Pre-warm the goon pool for one enemy class.
 * Skips slots that are already cached. Call this at mission start.
 * Pass `enemyPositions` sorted by ascending distance from the player — closest first.
 */
export async function prewarmGoonPool(
  backend: KokoroBackend,
  config: GoonPoolConfig,
  enemyPositions: Array<[number, number, number]>,
  onProgress?: (filled: number, total: number) => void
): Promise<void> {
  const poolSize = config.poolSize ?? GOON_POOL_SIZE;
  let filled = 0;

  for (let slot = 0; slot < poolSize; slot++) {
    const key = slotKey(config.profileKey, slot);
    const existing = await cacheGet(key);
    if (existing) { filled++; onProgress?.(filled, poolSize); continue; }

    // Pick a position for this slot (cycle through provided positions)
    const pos = enemyPositions[slot % enemyPositions.length] ?? [slot, slot * 3, 0];
    const [x, y, z] = pos;

    const seed    = positionToSeed3D(x, y, z);
    const spec    = deriveVoiceSpec(x, y, z, config.worldSeed ?? 0n);
    const text    = generateResponse(seed, slot, config.profile);

    await bakeEntry(backend, {
      key,
      text,
      spec,
      preset:   config.ringPreset,
      poolSlot: slot,
    });

    filled++;
    onProgress?.(filled, poolSize);
  }
}

/**
 * Dispense one pre-generated goon speech entry.
 * Returns null if the pool is not yet ready for this slot (generation still in progress).
 * After dispensing, triggers background regeneration of the consumed slot.
 */
export async function dispensGoonEntry(
  backend: KokoroBackend,
  config: GoonPoolConfig,
  enemyPositions: Array<[number, number, number]>
): Promise<SpeechCacheRecord | null> {
  const poolSize = config.poolSize ?? GOON_POOL_SIZE;
  const slot     = getPointer(config.profileKey);
  const key      = slotKey(config.profileKey, slot);

  const record = await cacheGet(key);
  advancePointer(config.profileKey, poolSize);

  if (record) {
    // Regenerate this slot in the background to keep pool fresh
    regenerateSlot(backend, config, slot, enemyPositions).catch(console.warn);
  }

  return record;
}

/** Internal: regenerate one pool slot asynchronously */
async function regenerateSlot(
  backend: KokoroBackend,
  config: GoonPoolConfig,
  slot: number,
  enemyPositions: Array<[number, number, number]>
): Promise<void> {
  const poolSize = config.poolSize ?? GOON_POOL_SIZE;
  const pos = enemyPositions[slot % enemyPositions.length] ?? [slot * 7, slot * 13, slot * 3];
  const [x, y, z] = pos;
  // Offset encounterIndex well beyond normal range to ensure fresh text
  const encounterIndex = slot + Math.floor(Date.now() / 1000) % 1000;

  const seed = positionToSeed3D(x, y, z);
  const spec = deriveVoiceSpec(x, y, z, config.worldSeed ?? 0n);
  const text = generateResponse(seed, encounterIndex, config.profile);

  await bakeEntry(backend, {
    key:      slotKey(config.profileKey, slot),
    text,
    spec,
    preset:   config.ringPreset,
    poolSlot: slot,
  });
}
```

### 3.11 Step 10 — Create `src/speech/playback.ts`

```typescript
// src/speech/playback.ts
// SpeechHandle implementation using Web Audio API.
// Decodes stored Float32Array PCM into AudioBuffer and plays via AudioBufferSourceNode.
// All ring modulation is already baked into the PCM — no processing at playback time.

import type { SpeechCacheRecord, SpeechHandle } from "./types";

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AudioContext();
  }
  return sharedCtx;
}

export function createSpeechHandle(record: SpeechCacheRecord): SpeechHandle {
  const ctx = getAudioContext();

  // Build AudioBuffer from stored PCM
  const audioBuffer = ctx.createBuffer(1, record.pcm.length, record.sampleRate);
  audioBuffer.copyToChannel(record.pcm, 0);

  let sourceNode: AudioBufferSourceNode | null = null;
  const endedCallbacks: Array<() => void> = [];

  return {
    get text()     { return record.text; },
    get duration() { return audioBuffer.duration; },

    play() {
      if (sourceNode) { sourceNode.stop(); }
      sourceNode = ctx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(ctx.destination);
      sourceNode.onended = () => endedCallbacks.forEach(cb => cb());
      sourceNode.start(0);
    },

    stop() {
      sourceNode?.stop();
      sourceNode = null;
    },

    onEnded(cb: () => void) {
      endedCallbacks.push(cb);
    },
  };
}

/** Resume AudioContext after user gesture (required by browsers) */
export async function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();
}
```

### 3.12 Step 11 — Create `src/speech/index.ts`

The three public API functions. This is the only file the rest of the game needs to import from.

```typescript
// src/speech/index.ts
// ZeroSpeechAce public API.
// Import: import { GoonSpeech, PersonaSpeech, NarrativeSpeech, initSpeech } from "./speech";

import { openCache, cacheGet } from "./cache";
import { initVoiceHasher, deriveVoiceSpec } from "./voice";
import { generateResponse, positionToSeed3D } from "./engine";
import { bakeEntry } from "./baker";
import { prewarmGoonPool, dispensGoonEntry } from "./pool";
import { createSpeechHandle, resumeAudioContext } from "./playback";
import type {
  GoonPoolConfig,
  GoonRequest,
  KokoroBackend,
  NarrativeDefinition,
  PersonaDefinition,
  SpeechHandle,
} from "./types";

// Re-export all types and presets for consumer convenience
export * from "./types";
export { prewarmGoonPool } from "./pool";
export { resumeAudioContext } from "./playback";

let backend: KokoroBackend | null = null;

/**
 * Initialise ZeroSpeechAce.
 * Call once at application startup, before any speech functions.
 * @param kokoroBackend - A KokoroBackend from kokoro.ts (Tauri or WASM)
 */
export async function initSpeech(kokoroBackend: KokoroBackend): Promise<void> {
  await initVoiceHasher();
  await openCache();
  backend = kokoroBackend;
}

function requireBackend(): KokoroBackend {
  if (!backend) throw new Error("ZeroSpeechAce not initialised — call initSpeech() first");
  return backend;
}

// ─────────────────────────────────────────────────────────────────────────────
// GoonSpeech
// For nameless enemies. Dispenses from pre-generated rotating pool.
// Returns null if the pool is not yet ready (dispense attempted before prewarm).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispense one pre-generated goon voice line.
 * Pool must have been pre-warmed via prewarmGoonPool() at mission start.
 * Returns null if the pool slot is not yet available.
 *
 * @example
 * const handle = await GoonSpeech(poolConfig, enemyPositions);
 * handle?.play();
 */
export async function GoonSpeech(
  config: GoonPoolConfig,
  enemyPositions: Array<[number, number, number]>
): Promise<SpeechHandle | null> {
  const be = requireBackend();
  const record = await dispensGoonEntry(be, config, enemyPositions);
  if (!record) return null;
  return createSpeechHandle(record);
}

// ─────────────────────────────────────────────────────────────────────────────
// PersonaSpeech
// For named NPCs. Fixed VoiceID + authored lines. Generated once, re-used.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve (or generate on first call) a speech line for a named NPC persona.
 * Subsequent calls return the cached version instantly.
 *
 * @example
 * const handle = await PersonaSpeech(commanderRexDef, 0); // line index 0
 * handle.play();
 */
export async function PersonaSpeech(
  def: PersonaDefinition,
  lineIndex: number
): Promise<SpeechHandle> {
  const be = requireBackend();
  const key = `persona:${def.personaId}:line:${lineIndex}`;

  let record = await cacheGet(key);
  if (!record) {
    const [x, y, z] = def.voiceCoords;
    const spec = deriveVoiceSpec(x, y, z);
    const text = def.lines[lineIndex];
    if (!text) throw new Error(`PersonaSpeech: no line at index ${lineIndex} for persona "${def.personaId}"`);
    record = await bakeEntry(be, { key, text, spec, preset: def.ringPreset });
  }

  return createSpeechHandle(record);
}

/**
 * Pre-generate all lines for a persona and cache them.
 * Call during a loading screen to ensure zero latency at playback time.
 */
export async function prewarmPersona(def: PersonaDefinition): Promise<void> {
  const be = requireBackend();
  for (let i = 0; i < def.lines.length; i++) {
    const key = `persona:${def.personaId}:line:${i}`;
    const existing = await cacheGet(key);
    if (existing) continue;
    const [x, y, z] = def.voiceCoords;
    const spec = deriveVoiceSpec(x, y, z);
    await bakeEntry(be, { key, text: def.lines[i], spec, preset: def.ringPreset });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NarrativeSpeech
// For cutscenes and mission briefings. Pre-generated and cached permanently.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve (or generate on first call) a narrative speech line.
 * Call prewarmNarrative() during the loading screen for zero-latency playback.
 *
 * @example
 * await prewarmNarrative(mission03Briefing);   // during loading
 * const handle = await NarrativeSpeech(mission03Briefing, 0);
 * handle.play();
 */
export async function NarrativeSpeech(
  def: NarrativeDefinition,
  lineIndex: number
): Promise<SpeechHandle> {
  const be = requireBackend();
  const key = `narrative:${def.narrativeId}:${def.speakerId}:line:${lineIndex}`;

  let record = await cacheGet(key);
  if (!record) {
    const [x, y, z] = def.voiceCoords;
    const spec = deriveVoiceSpec(x, y, z);
    const text = def.lines[lineIndex];
    if (!text) throw new Error(`NarrativeSpeech: no line at index ${lineIndex} for narrative "${def.narrativeId}"`);
    record = await bakeEntry(be, { key, text, spec, preset: def.ringPreset });
  }

  return createSpeechHandle(record);
}

/**
 * Pre-generate all lines for a narrative sequence.
 * Call during mission loading screen.
 */
export async function prewarmNarrative(
  def: NarrativeDefinition,
  onProgress?: (filled: number, total: number) => void
): Promise<void> {
  const be = requireBackend();
  for (let i = 0; i < def.lines.length; i++) {
    const key = `narrative:${def.narrativeId}:${def.speakerId}:line:${i}`;
    const existing = await cacheGet(key);
    if (existing) { onProgress?.(i + 1, def.lines.length); continue; }
    const [x, y, z] = def.voiceCoords;
    const spec = deriveVoiceSpec(x, y, z);
    await bakeEntry(be, { key, text: def.lines[i], spec, preset: def.ringPreset });
    onProgress?.(i + 1, def.lines.length);
  }
}
```

### 3.13 Step 12 — Wire Into the Game

#### Initialisation (once at app startup)

```typescript
// e.g. in src/main.tsx or your game bootstrap

import { initSpeech } from "./speech";
import { createTauriBackend } from "./speech/kokoro";

// For Tauri desktop:
const kokoroBackend = await createTauriBackend();
await initSpeech(kokoroBackend);
```

#### Mission Start — Pre-warm Goon Pool

Call `prewarmGoonPool` immediately when a mission begins, passing all enemy positions in the scene sorted by distance from the player (closest first ensures the most immediately relevant voice lines are ready soonest).

```typescript
import { prewarmGoonPool, RING_PRESETS } from "./speech";
import droneWingProfile from "./speech/profiles/drone_wing_profile.json";

// Called at mission start, does not block gameplay — runs in background
prewarmGoonPool(
  kokoroBackend,
  {
    profileKey: "drone_wing",
    profile: droneWingProfile,
    ringPreset: RING_PRESETS.classicDalek,
    poolSize: 32,
    worldSeed: 0n,
  },
  sortedEnemyPositions,   // Array<[x, y, z]> sorted by proximity to player
  (filled, total) => console.log(`Pool: ${filled}/${total}`)
);
```

#### Trigger GoonSpeech (enemy taunts during combat)

```typescript
import { GoonSpeech } from "./speech";
import { resumeAudioContext } from "./speech";

async function onEnemySpotPlayer(enemy: Enemy) {
  await resumeAudioContext(); // must be called after a user gesture
  const handle = await GoonSpeech(droneWingPoolConfig, allEnemyPositions);
  if (handle) {
    handle.play();
    handle.onEnded(() => console.log("Taunt complete"));
  }
}
```

#### PersonaSpeech (named NPC dialogue)

```typescript
import { PersonaSpeech, prewarmPersona, RING_PRESETS } from "./speech";
import type { PersonaDefinition } from "./speech";

const commanderAce: PersonaDefinition = {
  personaId: "commander_ace",
  voiceCoords: [42, 17, 0],  // fixed coords → always the same voice
  ringPreset: RING_PRESETS.cyborgBlend,
  lines: [
    "Wing Two, stay on my six. We hit the relay and pull out fast.",
    "Target acquired. Weapons free on my mark.",
    "Good kill. Reform on me — there are more inbound.",
  ],
};

// During mission loading:
await prewarmPersona(commanderAce);

// During gameplay:
const handle = await PersonaSpeech(commanderAce, 0); // line index 0
handle.play();
```

#### NarrativeSpeech (mission briefing)

```typescript
import { NarrativeSpeech, prewarmNarrative } from "./speech";
import type { NarrativeDefinition } from "./speech";

const mission03Briefing: NarrativeDefinition = {
  narrativeId: "mission_03_briefing",
  speakerId:   "admiral_kane",
  voiceCoords: [0, 0, 999],  // unique, fixed → Admiral Kane's unique voice
  ringPreset:  null,          // no ring mod — human narrator, unprocessed
  lines: [
    "Pilots, the relay station at sector seven has gone dark.",
    "Your orders are to investigate and neutralise any hostile presence.",
    "You have thirty minutes before the enemy reinforces. Do not waste them.",
  ],
};

// During loading screen:
await prewarmNarrative(mission03Briefing, (n, total) => updateLoadingBar(n / total));

// In cutscene:
for (let i = 0; i < mission03Briefing.lines.length; i++) {
  const handle = await NarrativeSpeech(mission03Briefing, i);
  handle.play();
  await new Promise(resolve => handle.onEnded(resolve));
}
```

### 3.14 Step 13 — Add a New Enemy Speech Profile

To add a new enemy class (e.g. a fighter ace with a different speech register):

1. Create a new JSON profile at `src/speech/profiles/my_profile.json` following the exact schema of `drone_wing_profile.json` — a `name`, `description`, `version`, `templates` array, and `pools` object with named string arrays.
2. Import it where needed and pass it as `profile` in a `GoonPoolConfig`.
3. Use a unique `profileKey` string in `GoonPoolConfig` to namespace its IndexedDB pool slots separately.

No other files require changes.

---

## 4. Data Models

### Cache Key Conventions

| Speech Type | Key Format | Example |
|---|---|---|
| GoonSpeech pool slot | `goon:{profileKey}:slot:{0..N-1}` | `goon:drone_wing:slot:7` |
| PersonaSpeech line | `persona:{personaId}:line:{idx}` | `persona:commander_ace:line:0` |
| NarrativeSpeech line | `narrative:{narrativeId}:{speakerId}:line:{idx}` | `narrative:mission_03_briefing:admiral_kane:line:2` |

### VoiceSpec Derivation (ZeroBytes Laws)

| Hash | Salt | Output Range | Property |
|---|---|---|---|
| xxhash64 #1 | `0x0001` | `[0, poolSize)` | Voice A index |
| xxhash64 #2 | `0x0002` | `[0, poolSize-1)` | Voice B index (≠ A) |
| xxhash64 #3 | `0x0003` | `[0.0, 1.0)` | Blend t |
| xxhash64 #4 | `0x0004` | `[0.85, 1.15]` | Pitch scale |
| xxhash64 #5 | `0x0005` | `[0.80, 1.20]` | Energy scale |
| xxhash64 arc #1 | `0x0010` | `[0.20, 0.80]` | Curve warp |
| xxhash64 arc #2 | `0x0011` | `[0.00, 0.30]` | Harmonic weight |
| xxhash64 arc #3 | `0x0012` | `[-0.15, +0.15]` | Spectral skew |

---

## 5. Testing Scenarios

| Test | Input | Expected |
|---|---|---|
| GoonSpeech pool prewarm | `prewarmGoonPool(...)` with 32 positions | 32 IndexedDB records created, no errors |
| GoonSpeech dispense | `GoonSpeech(config, positions)` after prewarm | Returns non-null SpeechHandle, `handle.play()` produces audio |
| GoonSpeech round-robin | Dispense 33 times from pool of 32 | Pointer wraps to slot 0; slot 0 is regenerated asynchronously |
| PersonaSpeech first call | `PersonaSpeech(def, 0)` cold (no cache) | Generates, caches, returns handle |
| PersonaSpeech second call | `PersonaSpeech(def, 0)` warm (cached) | Returns handle without calling KokoroTTS |
| PersonaSpeech prewarm | `prewarmPersona(def)` with 3 lines | 3 IndexedDB records; subsequent calls instant |
| NarrativeSpeech sequence | Loop NarrativeSpeech 0..N-1, await onEnded each | Lines play in order without overlap |
| Determinism — same coords | `deriveVoiceSpec(10, 25, 0)` x2 | Identical VoiceSpec both times |
| Determinism — adjacent coords | `deriveVoiceSpec(10, 25, 0)` vs `(11, 25, 0)` | Different VoiceSpec |
| Ring mod offline | `applyRingModulation(pcm, 24000, classicDalek)` | Returns Float32Array, length = pcm.length |
| Ring mod null preset | `bakeEntry(be, {..., preset: null})` | PCM stored unprocessed; playback is unmodified TTS |
| Cache miss then hit | `cacheGet("persona:x:line:0")` before/after bakeEntry | null before, SpeechCacheRecord after |
| Pool regeneration | Dispense slot, wait for background regen | New record at same key with different text/encounterIndex |

---

## 6. Performance Goals

| Metric | Target | Notes |
|---|---|---|
| `GoonSpeech` dispense latency | < 5ms | IndexedDB read + AudioBuffer decode only |
| `PersonaSpeech` warm call | < 5ms | Same — cache hit path |
| `PersonaSpeech` cold call | < TTS synthesis time | Typically 0.5–3s; only happens once per persona/line |
| Pool prewarm (32 entries) | Background — does not block gameplay | KokoroTTS + ring mod per entry, ~1–5s each depending on text length |
| Ring modulation offline | < 2× audio duration | OfflineAudioContext renders faster than real-time on modern hardware |
| Memory per SpeechCacheRecord | ~2–10 KB per second of audio at 24kHz mono float32 | 1s ≈ 96 KB; 5s ≈ 480 KB |
| IndexedDB writes | Non-blocking | Awaited only in baker; caller returns immediately after dispense |

---

## 7. Extended Features (Optional)

### World Seed Support

Pass `worldSeed: 42n` in `GoonPoolConfig` and as the `worldSeed` parameter of `deriveVoiceSpec`. All voice derivation hashes XOR with the world seed, meaning the same enemy at the same position says different things in different generated worlds.

### Gender Filter per Enemy Class

Add `genderFilter: GenderFilter` to `GoonPoolConfig`. Pass it through to `deriveVoiceSpec`. Female-coded AI pilots, male-coded ground troops, etc.

### Volume and Spatial Audio

In `playback.ts`, before connecting `sourceNode` to `ctx.destination`, insert a `PannerNode` using the enemy's world position. This adds 3D positional audio to all three speech types with no changes to the generation pipeline.

### Speech Subtitle Hook

`SpeechHandle` exposes `text` — wire this to your subtitle/HUD system to display the line being spoken. No additional data needed.

### Clearing Stale Cache

Add a cache maintenance function to `cache.ts` that deletes records older than a configurable TTL (e.g. 7 days), called on application startup. Permanent persona and narrative records can be excluded from TTL by checking their key prefix.

---

## 8. Glossary

| Term | Definition |
|---|---|
| **ZeroBytes** | Position-as-seed procedural generation: same coordinates always produce the same output. |
| **ZeroResponse** | Procedural text generation from JSON profiles using xxhash32 template/pool selection. |
| **ZeroVoice** | Deterministic TTS voice assignment using xxhash64 coordinate-to-VoiceSpec derivation over KokoroTTS ONNX. |
| **DJZ-RingVoice** | Web Audio API ring modulator producing Dalek/robotic voice effects. Applied offline at bake time. |
| **SpeechBaker** | The pipeline unit that chains: text generation → KokoroTTS synthesis → ring modulation → IndexedDB write. |
| **GoonSpeech** | Voice pool for nameless NPCs. Pre-generated, rotating, immediately available. |
| **PersonaSpeech** | Voice pool for named NPCs. Fixed voice + authored lines. Generated once, cached permanently. |
| **NarrativeSpeech** | Voice pool for cutscenes. Pre-generated during loading. Cached permanently. |
| **VoiceSpec** | The complete set of parameters (voice pair, blend, pitch, energy, arc properties) that fully define one voice. |
| **RingPreset** | One set of ring modulation parameters (carrier freq, mix, LFO, drive, waveform). Copied from RingVoiceModulator.jsx PRESETS. |
| **ProfileKey** | A stable string identifier for a GoonPool namespace in IndexedDB (`"drone_wing"`, `"ground_trooper"`, etc.). |
| **OfflineAudioContext** | Web Audio API context that renders audio to a buffer faster than real-time, used for baking ring modulation without playback. |
| **Pool slot** | One pre-generated IndexedDB record in the GoonPool. Indexed `0..POOL_SIZE-1`. |
| **Baking** | The offline process of generating and processing a voice line for storage. Separated from playback entirely. |
| **WORLD_SEED** | A `bigint` XOR'd into all xxhash64 calls to differentiate voice assignments across different game worlds. |

---

--- END OF DOCUMENT ---
