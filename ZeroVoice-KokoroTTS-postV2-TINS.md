<!--
  ZS:COMPLEXITY:HIGH
  ZS:PRIORITY:HIGH
  ZS:PLATFORM:DESKTOP
  ZS:LANGUAGE:RUST,TYPESCRIPT
  ZS:VERSION:0.8.0
  ZS:STATUS:POST-IMPLEMENTATION
  ZS:SCOPE:FULL-REPRODUCTION
  ZS:LAYER:ZERO-QUADRATIC
-->

# ZeroVoice — KokoroTTS ONNX Workbench (Post-Implementation TINS v0.8.0)

> **TINS — There Is No Source.**
> This document contains every file, in full, required to reproduce the
> ZeroVoice-KokoroTTS v0.8.0 desktop application from an empty directory.
> No external context, no abbreviated snippets, no "see repo for details."

---

## 1. Description

**ZeroVoice Workbench** is a Tauri v2 desktop application (Rust + React/TypeScript)
that deterministically assigns unique, reproducible voices to game NPCs based solely
on their spawn coordinates. It uses the **KokoroTTS** ONNX model (int8-quantised,
~88 MB) running locally via ONNX Runtime to synthesise speech in real time.

The core insight is **position-as-seed**: given integer spawn coordinates `(x, y, z)`
and a fixed world seed, the application derives a voice specification (two base voices,
a blend factor, pitch scale, and energy scale) using xxHash64 with per-property salts.
The same coordinates always produce the same voice — no database, no stored state,
O(1) lookup.

The **Zero-Quadratic layer** extends each voice pair (arc) with four deterministic
properties — curve warp, harmonic weight, spectral skew, and kinship — that shape
the interpolation path between two base voices. These arc properties are symmetric
(order-independent), precomputed at startup, and influence synthesis without adding
any per-NPC state.

The workbench UI lets designers explore the voice space by entering coordinates,
previewing voice specs, adjusting parameters with sliders, and synthesising speech
with a single click. A history bar records every synthesis for A/B comparison.

---

## 2. Functionality

### 2.1 Core Concept — Position-as-Seed

Every NPC's voice is derived from its spawn position `(sx, sy, sz)`:

```
xxh64(WORLD_SEED ^ SALT, sx ++ sy ++ sz) → property value
```

Six independent hashes (one per property) produce:

| Property       | Salt     | Range                |
| -------------- | -------- | -------------------- |
| Voice A index  | `0x0001` | `[0, 26)`            |
| Voice B index  | `0x0002` | `[0, 26)`, B != A    |
| Slerp t        | `0x0003` | `[0.0, 1.0)`         |
| Pitch scale    | `0x0004` | `[0.85, 1.15]`       |
| Energy scale   | `0x0005` | `[0.80, 1.20]`       |
| Region bias    | `0x0006` | `[0.0, 1.0)` (noise) |

### 2.2 Voice Capacity

| Metric                      | Value   |
| --------------------------- | ------- |
| Base Kokoro voices          | 26      |
| Unordered blend pairs       | 325     |
| Blend resolution (float32)  | ~4.3 B  |
| Pitch x Energy combinations | ~4.3 B  |
| **Effective unique voices** | > 10^18 |

### 2.3 Gender Filter

The UI exposes a three-way toggle: **Mixed** / **Female** / **Male**.

- **Female pool** (14 voices): `af_*` indices 0-9, `bf_*` indices 18-21
- **Male pool** (12 voices): `am_*` indices 10-17, `bm_*` indices 22-25
- **Mixed**: all 26 voices (default)

### 2.4 Zero-Quadratic Arc Properties

Each unordered voice pair (arc) carries four deterministic properties that modify
how the two base voices blend during synthesis:

| Property         | Salt       | Range              | Effect                                    |
| ---------------- | ---------- | ------------------ | ----------------------------------------- |
| `curve_warp`     | `0x0010`   | `[0.2, 0.8]`      | Power-curve exponent on t before lerp     |
| `harmonic_weight`| `0x0011`   | `[0.0, 0.3]`      | Blend toward mean of A+B (tonal richness) |
| `spectral_skew`  | `0x0012`   | `[-0.15, +0.15]`  | Asymmetric tilt at t=0.5                  |
| `kinship`        | (computed) | `[0.0, 1.0]`      | Cosine similarity of style vectors        |

Arc properties are **symmetric** — `arc(A,B) == arc(B,A)` — enforced by sorting
indices before hashing. `kinship` is not hashed but computed from the voice table
geometry (normalised dot product of row-0 style vectors).

The arc table is precomputed at session startup (26x26 = 676 entries, < 100 us)
and stored alongside the voice table in `KokoroSession`. During synthesis,
`resolve_style_quadratic` applies curve warp, spectral skew, and harmonic blend
before the standard lerp, producing richer and more distinctive voice blends.

### 2.5 Three-Column Layout

```
+------------------------------------------------------+
|  COORDINATE PANEL  |  VOICE SPEC PANEL  |  SYNTHESIS  |
|                    |                    |   PANEL     |
|  X [ -999 ]       |  Voice A: af_nova  |  [textarea] |
|  Y [ 1024 ]       |  Voice B: bm_lewis |             |
|  Z [ 5000 ]       |  Blend t: 0.42     |  [Synth]    |
|                    |  Pitch:   0.97     |             |
|  [Region Bias Map] |  Energy:  1.05     |  [waveform] |
|                    |  Hash: 3a7f...     |             |
|                    |  Arc: #142         |             |
|                    |  ARC CHARACTER     |             |
|                    |  Curve Warp  0.432 |             |
|                    |  Harmonic    0.112 |             |
|                    |  Spectral   -0.034 |             |
|                    |  Kinship     0.871 |             |
+------------------------------------------------------+
|              HISTORY BAR (scrollable)                 |
+------------------------------------------------------+
|              STATUS BAR / DEBUG CONSOLE               |
+------------------------------------------------------+
```

**Coordinate Panel** (left): X/Y/Z integer inputs with seven-segment-style
display, a region bias mini-map, and the gender filter toggle.

**Voice Spec Panel** (centre): real-time voice specification derived from
current coordinates, hash display, arc visualiser showing the A-B blend on
a circular diagram, override sliders for t / pitch / energy, and a read-only
ARC CHARACTER section displaying the four Zero-Quadratic properties.

**Synthesis Panel** (right): text input area, Synthesise button, waveform
canvas with playback, voice selector dropdowns for manual A/B override.

**History Bar**: horizontal scrollable strip at the bottom. Each synthesis
is recorded as a card showing coordinates, voice names, and a play button.
Cards persist for the session and allow instant A/B comparison.

### 2.6 Aesthetic Specification

| Property        | Value                                      |
| --------------- | ------------------------------------------ |
| Background      | `#0a0a0f` (near-black with blue tint)      |
| Panel surface   | `#12121a` with 1px `#1a1a2e` borders       |
| Accent          | `#00ff88` (matrix green)                   |
| Accent alt      | `#ff6644` (warm orange)                    |
| Text primary    | `#e0e0e0`                                  |
| Text muted      | `#666680`                                  |
| Font body       | `'JetBrains Mono', 'Fira Code', monospace` |
| Font display    | Seven-segment style for coordinates        |
| Scanlines       | Subtle CRT overlay via CSS pseudo-elements |
| Waveform        | Accent green on transparent canvas         |

---

## 3. Technical Implementation

### 3.1 Repository Layout

```
ZeroVoice-KokorotTTS/
  package.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  index.html
  .gitignore
  src/
    vite-env.d.ts
    main.tsx
    App.tsx
    lib/
      types.ts
      voice.ts
      zerovoice-preview.ts
      waveform.ts
      history.ts
    hooks/
      useVoiceSpec.ts
      useRegionBias.ts
      useSynthesis.ts
    workers/
      regionBias.worker.ts
    styles/
      workbench.css
      controls.css
    components/
      ui/
        SegmentNumber.tsx
        StatusBar.tsx
        DebugConsole.tsx
      controls/
        CoordInput.tsx
        ParamSlider.tsx
        WaveformCanvas.tsx
        VoiceSelector.tsx
        HashDisplay.tsx
        ArcVisualiser.tsx
      workbench/
        WorkbenchShell.tsx
        CoordinatePanel.tsx
        VoiceSpecPanel.tsx
        SynthesisPanel.tsx
        RegionBiasMap.tsx
        HistoryBar.tsx
        SetupScreen.tsx
  src-tauri/
    Cargo.toml
    tauri.conf.json
    build.rs
    capabilities/
      default.json
    src/
      main.rs
      lib.rs
      zerovoice.rs
      arc_properties.rs
      slerp.rs
      phonemize.rs
      kokoro_tts.rs
      setup.rs
      commands/
        mod.rs
        voice.rs
        setup.rs
```

---

## 4. Implementation Steps

---

### Step 1 — Project Scaffolding

Create the directory structure and root configuration files.

#### `package.json`

```json
{
  "name": "zerov0ice",
  "private": true,
  "version": "0.8.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-shell": "^2",
    "react": "^18",
    "react-dom": "^18",
    "xxhash-wasm": "^1.0.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5",
    "vite": "^5"
  }
}
```

#### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "useDefineForClassFields": true,
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

#### `tsconfig.node.json`

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

#### `vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["es2022", "chrome100", "safari15"],
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
```

#### `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ZER0VOICE WORKBENCH</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

#### `.gitignore`

```
# Dependencies
node_modules/

# Build output
dist/
src-tauri/target/

# Model assets (download separately)
src-tauri/resources/kokoro-v1.0.int8.onnx
src-tauri/resources/voices-v1.0.bin
src-tauri/resources/espeak-ng.exe
src-tauri/resources/espeak-ng-data/

# ONNX Runtime DLL
src-tauri/onnxruntime.dll

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
```

#### `src/vite-env.d.ts`

```ts
/// <reference types="vite/client" />
```

---

### Step 2 — Cargo.toml

Create `src-tauri/Cargo.toml`. Note the `ort` v2.0.0-rc.12 with `download-binaries`
feature (provides the ONNX Runtime DLL at build time) and `profile.dev.package`
optimisations so model loading is not painfully slow in debug builds.

#### `src-tauri/Cargo.toml`

```toml
[package]
name    = "zerov0ice"
version = "0.8.0"
edition = "2021"

[lib]
name         = "zerov0ice_lib"
crate-type   = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri       = { version = "2", features = [] }
tauri-plugin-shell = { version = "2" }
serde       = { version = "1", features = ["derive"] }
serde_json  = "1"
anyhow      = "1"
ort         = { version = "2.0.0-rc.12", features = ["download-binaries"] }
# ndarray not needed — ort rc12 uses Tensor::from_array directly
xxhash-rust = { version = "0.8", features = ["xxh64"] }
npyz        = "0.8"
zip         = { version = "2", default-features = false, features = ["deflate"] }
reqwest     = { version = "0.12", features = ["stream"] }
futures-util = "0.3"
tokio       = { version = "1", features = ["fs", "io-util"] }

# Optimize heavy deps even in debug builds so model loading isn't painfully slow
[profile.dev.package.ort]
opt-level = 2
[profile.dev.package.ort-sys]
opt-level = 2
[profile.dev.package.ndarray]
opt-level = 2
[profile.dev.package.zip]
opt-level = 2
[profile.dev.package.npyz]
opt-level = 2
```

---

### Step 3 — tauri.conf.json

Create `src-tauri/tauri.conf.json`. Version 0.8.0, icon paths, no `bundle.resources`
(assets are downloaded at runtime to app-data).

#### `src-tauri/tauri.conf.json`

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "ZeroVoice Workbench",
  "version": "0.8.0",
  "identifier": "dev.zerovoice.workbench",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "ZER0VOICE WORKBENCH",
        "width": 1140,
        "height": 700,
        "minWidth": 900,
        "minHeight": 560,
        "resizable": true,
        "decorations": true,
        "theme": "Dark"
      }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.ico",
      "icons/icon.png"
    ],
    "windows": {
      "wix": {},
      "nsis": {}
    }
  },
  "plugins": {
    "shell": {
      "open": false
    }
  }
}
```

---

### Step 4 — Tauri build.rs and capabilities/default.json

#### `src-tauri/build.rs`

```rust
fn main() {
    tauri_build::build();
}
```

#### `src-tauri/capabilities/default.json`

```json
{
  "identifier": "default",
  "description": "Default capabilities for ZeroVoice Workbench",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:app:default",
    "core:event:default",
    "core:event:allow-listen",
    "core:event:allow-emit",
    "shell:default"
  ]
}
```

---

### Step 5 — Rust: zerovoice.rs

The core voice derivation module. Contains the `GenderFilter` enum,
gender-filtered index tables, `pick_voice_pair`, `voice_from_spawn`,
`voice_from_spawn_biased` with regional noise, `spec_to_dto` (now accepting
`&ArcProperties` for Zero-Quadratic fields), `VoiceSpecDto` with serde renames
and arc property fields, and tests.

#### `src-tauri/src/zerovoice.rs`

```rust
use xxhash_rust::xxh64::Xxh64;
use crate::arc_properties::ArcProperties;

pub const KOKORO_VOICES: [&str; 26] = [
    "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore",
    "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
    "am_adam",  "am_echo",  "am_eric",  "am_fenrir", "am_liam",
    "am_michael","am_onyx", "am_puck",  "bf_alice",  "bf_emma",
    "bf_isabella","bf_lily","bm_daniel","bm_fable",  "bm_george",
    "bm_lewis",
];

pub const NUM_VOICES: u64 = 26;

/// Gender-filtered index tables — indices into KOKORO_VOICES
/// Female: af_* (0-9) + bf_* (18-21) = 14 voices
pub const FEMALE_INDICES: [usize; 14] = [0,1,2,3,4,5,6,7,8,9,18,19,20,21];
/// Male: am_* (10-17) + bm_* (22-25) = 12 voices
pub const MALE_INDICES: [usize; 12] = [10,11,12,13,14,15,16,17,22,23,24,25];

#[derive(Clone, Copy, Debug, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GenderFilter {
    Mixed,
    Male,
    Female,
}

// Salt constants — each property gets a unique, collision-free salt
const SALT_VOICE_A: u64 = 0x0001;
const SALT_VOICE_B: u64 = 0x0002;
const SALT_SLERP_T: u64 = 0x0003;
const SALT_PITCH:   u64 = 0x0004;
const SALT_ENERGY:  u64 = 0x0005;
const SALT_REGION:  u64 = 0x0006;

/// The world seed. Changing this changes every NPC voice — treat as a
/// save-file breaking change and increment the save schema version.
pub const WORLD_SEED: u64 = 0xDEAD_BEEF_C0FFE;

pub struct VoiceSpec {
    pub voice_a:      usize,
    pub voice_b:      usize,
    pub t:            f32,
    pub pitch_scale:  f32,
    pub energy_scale: f32,
}

#[derive(serde::Serialize)]
pub struct VoiceSpecDto {
    #[serde(rename = "voiceA")]
    pub voice_a_idx:  usize,
    #[serde(rename = "voiceAName")]
    pub voice_a_name: String,
    #[serde(rename = "voiceB")]
    pub voice_b_idx:  usize,
    #[serde(rename = "voiceBName")]
    pub voice_b_name: String,
    pub t:            f32,
    #[serde(rename = "pitchScale")]
    pub pitch_scale:  f32,
    #[serde(rename = "energyScale")]
    pub energy_scale: f32,
    #[serde(rename = "hashHex")]
    pub hash_hex:     String,
    #[serde(rename = "arcIndex")]
    pub arc_index:    usize,
    // Zero-Quadratic arc properties
    #[serde(rename = "arcCurveWarp")]
    pub arc_curve_warp:      f32,
    #[serde(rename = "arcHarmonicWeight")]
    pub arc_harmonic_weight: f32,
    #[serde(rename = "arcSpectralSkew")]
    pub arc_spectral_skew:   f32,
    #[serde(rename = "arcKinship")]
    pub arc_kinship:         f32,
}

/// Hash spawn coordinates with an independent salt per property.
/// Uses spawn point only — current position MUST NEVER be passed here.
/// The xxh64 output is platform-independent (same result on all OSes).
pub fn position_hash(sx: i32, sy: i32, sz: i32, salt: u64) -> u64 {
    let mut h = Xxh64::new(WORLD_SEED ^ salt);
    h.update(&sx.to_le_bytes());
    h.update(&sy.to_le_bytes());
    h.update(&sz.to_le_bytes());
    h.digest()
}

/// Map the lower 32 bits of a hash to a float in [0.0, 1.0).
pub fn hash_to_float(h: u64) -> f32 {
    (h & 0xFFFF_FFFF) as f32 / 0x1_0000_0000_u64 as f32
}

/// Derive a VoiceSpec from spawn coordinates using the world seed.
/// This is O(1) — no iteration, no stored state.
pub fn voice_from_spawn(sx: i32, sy: i32, sz: i32, gender: GenderFilter) -> VoiceSpec {
    let h_a   = position_hash(sx, sy, sz, SALT_VOICE_A);
    let h_b   = position_hash(sx, sy, sz, SALT_VOICE_B);
    let h_t   = position_hash(sx, sy, sz, SALT_SLERP_T);
    let h_p   = position_hash(sx, sy, sz, SALT_PITCH);
    let h_e   = position_hash(sx, sy, sz, SALT_ENERGY);

    let (idx_a, idx_b) = pick_voice_pair(h_a, h_b, gender);

    VoiceSpec {
        voice_a:      idx_a,
        voice_b:      idx_b,
        t:            hash_to_float(h_t),
        pitch_scale:  0.85 + hash_to_float(h_p) * 0.30,
        energy_scale: 0.80 + hash_to_float(h_e) * 0.40,
    }
}

/// Select a voice pair from the appropriate gender pool.
/// Returns (voice_a_idx, voice_b_idx) into KOKORO_VOICES, B ≠ A guaranteed.
fn pick_voice_pair(h_a: u64, h_b: u64, gender: GenderFilter) -> (usize, usize) {
    match gender {
        GenderFilter::Mixed => {
            let idx_a = (h_a % NUM_VOICES) as usize;
            let idx_b = ((h_b % (NUM_VOICES - 1)) as usize + idx_a + 1) % NUM_VOICES as usize;
            (idx_a, idx_b)
        }
        GenderFilter::Female => {
            let pool = &FEMALE_INDICES;
            let n = pool.len() as u64;
            let a_pos = (h_a % n) as usize;
            let b_pos = ((h_b % (n - 1)) as usize + a_pos + 1) % pool.len();
            (pool[a_pos], pool[b_pos])
        }
        GenderFilter::Male => {
            let pool = &MALE_INDICES;
            let n = pool.len() as u64;
            let a_pos = (h_a % n) as usize;
            let b_pos = ((h_b % (n - 1)) as usize + a_pos + 1) % pool.len();
            (pool[a_pos], pool[b_pos])
        }
    }
}

/// Convert VoiceSpec to a serialisable DTO for the preview Tauri command.
pub fn spec_to_dto(sx: i32, sy: i32, sz: i32, spec: &VoiceSpec, arc: &ArcProperties) -> VoiceSpecDto {
    let hash_hex = format!("{:016x}", position_hash(sx, sy, sz, SALT_VOICE_A));
    let arc_index = {
        let a = spec.voice_a;
        let b = spec.voice_b;
        let (lo, hi) = if a < b { (a, b) } else { (b, a) };
        // Map unordered pair to 0..324
        lo * (NUM_VOICES as usize - 1) - (lo * lo.saturating_sub(1)) / 2 + hi - lo - 1
    };
    VoiceSpecDto {
        voice_a_idx:  spec.voice_a,
        voice_a_name: KOKORO_VOICES[spec.voice_a].to_string(),
        voice_b_idx:  spec.voice_b,
        voice_b_name: KOKORO_VOICES[spec.voice_b].to_string(),
        t:            spec.t,
        pitch_scale:  spec.pitch_scale,
        energy_scale: spec.energy_scale,
        hash_hex,
        arc_index,
        arc_curve_warp:      arc.curve_warp,
        arc_harmonic_weight: arc.harmonic_weight,
        arc_spectral_skew:   arc.spectral_skew,
        arc_kinship:         arc.kinship,
    }
}

/// Optional: regional coherent noise bias. Constrains voice index selection
/// to a sub-range based on slowly-varying noise across the X/Z plane.
/// Scale factor 0.005 → voice "dialects" change roughly every 200 world units.
pub fn regional_voice_bias(sx: i32, sz: i32) -> f32 {
    let freq = 0.005_f32;
    let x0 = (sx as f32 * freq) as i32;
    let z0 = (sz as f32 * freq) as i32;
    let sx_f = smooth_step((sx as f32 * freq).fract());
    let sz_f = smooth_step((sz as f32 * freq).fract());

    let n00 = hash_to_float(position_hash(x0,     z0,     0, SALT_REGION));
    let n10 = hash_to_float(position_hash(x0 + 1, z0,     0, SALT_REGION));
    let n01 = hash_to_float(position_hash(x0,     z0 + 1, 0, SALT_REGION));
    let n11 = hash_to_float(position_hash(x0 + 1, z0 + 1, 0, SALT_REGION));

    let nx0 = lerp(n00, n10, sx_f);
    let nx1 = lerp(n01, n11, sx_f);
    lerp(nx0, nx1, sz_f)
}

fn smooth_step(t: f32) -> f32 { t * t * (3.0 - 2.0 * t) }
fn lerp(a: f32, b: f32, t: f32) -> f32 { a + (b - a) * t }

/// voice_from_spawn with regional bias applied.
/// bias < 0.33  → voice pair drawn from indices 0–8   (American female / light)
/// bias 0.33..0.66 → indices 9–17 (American male / mid)
/// bias > 0.66  → indices 18–25 (British / deep)
pub fn voice_from_spawn_biased(sx: i32, sy: i32, sz: i32, gender: GenderFilter) -> VoiceSpec {
    let bias = regional_voice_bias(sx, sz);
    let h_a  = position_hash(sx, sy, sz, SALT_VOICE_A);
    let h_b  = position_hash(sx, sy, sz, SALT_VOICE_B);
    let h_t  = position_hash(sx, sy, sz, SALT_SLERP_T);
    let h_p  = position_hash(sx, sy, sz, SALT_PITCH);
    let h_e  = position_hash(sx, sy, sz, SALT_ENERGY);

    // Region bias narrows to a sub-range, then gender filter is applied on top
    let (range_start, range_len): (u64, u64) = if bias < 0.33 {
        (0, 9)
    } else if bias < 0.66 {
        (9, 9)
    } else {
        (18, 8)
    };

    // Apply gender filter if not mixed, otherwise use region-biased selection
    let (idx_a, idx_b) = match gender {
        GenderFilter::Mixed => {
            let a = (range_start + h_a % range_len) as usize;
            let b = ((h_b % (NUM_VOICES - 1)) as usize + a + 1) % NUM_VOICES as usize;
            (a, b)
        }
        _ => pick_voice_pair(h_a, h_b, gender),
    };

    VoiceSpec {
        voice_a:      idx_a,
        voice_b:      idx_b,
        t:            hash_to_float(h_t),
        pitch_scale:  0.85 + hash_to_float(h_p) * 0.30,
        energy_scale: 0.80 + hash_to_float(h_e) * 0.40,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn voice_spec_is_deterministic() {
        let coords = [(0,0,0), (312,0,-88), (-999,1024,5000), (32767,-32768,1)];
        for (x, y, z) in coords {
            let a = voice_from_spawn(x, y, z, GenderFilter::Mixed);
            let b = voice_from_spawn(x, y, z, GenderFilter::Mixed);
            let c = voice_from_spawn(x, y, z, GenderFilter::Mixed);
            assert_eq!(a.voice_a, b.voice_a);
            assert_eq!(b.voice_a, c.voice_a);
            assert_eq!(a.voice_b, b.voice_b);
            assert_eq!(a.t.to_bits(), b.t.to_bits());
            assert_eq!(a.pitch_scale.to_bits(), c.pitch_scale.to_bits());
        }
    }

    #[test]
    fn voice_b_never_equals_voice_a() {
        for x in -10..10_i32 {
            for z in -10..10_i32 {
                let spec = voice_from_spawn(x, 0, z, GenderFilter::Mixed);
                assert_ne!(spec.voice_a, spec.voice_b,
                    "A == B at ({x}, 0, {z})");
            }
        }
    }

    #[test]
    fn lerp_blend_preserves_dimensions() {
        // Style blending is now lerp-based and requires a loaded voice table.
        // Integration test only — not unit testable without NPZ files.
    }
}
```

---

### Step 6 — Rust: arc_properties.rs

The Zero-Quadratic arc properties module. Defines `ArcProperties` (curve_warp,
harmonic_weight, spectral_skew, kinship), symmetric pair hashing, kinship
computation from voice table geometry, and the `build_arc_table` function that
precomputes all 325 unique arc property sets at startup.

#### `src-tauri/src/arc_properties.rs`

```rust
// src-tauri/src/arc_properties.rs

use crate::zerovoice::WORLD_SEED;
use crate::slerp::VoiceTable;
use xxhash_rust::xxh64::Xxh64;

// Arc-level salt constants — distinct from NPC-level salts (0x0001–0x0006)
const SALT_ARC_CURVE:    u64 = 0x0010;
const SALT_ARC_HARMONIC: u64 = 0x0011;
const SALT_ARC_SPECTRAL: u64 = 0x0012;

#[derive(Clone)]
pub struct ArcProperties {
    /// Slerp path warping — power-curve exponent applied to t before lerp.
    /// 0.5 = linear (identical to current behaviour).
    /// < 0.5 = biased toward voice_a, > 0.5 = biased toward voice_b.
    pub curve_warp: f32,        // [0.2, 0.8]

    /// Harmonic modulation — how much to blend toward the mean of A and B.
    /// Higher = richer tonal blend. 0.0 = pure lerp (current behaviour).
    pub harmonic_weight: f32,   // [0.0, 0.3]

    /// Spectral dominance asymmetry — tilts the blend even at t=0.5.
    pub spectral_skew: f32,     // [-0.15, +0.15]

    /// Perceptual kinship — dot product of representative style vectors.
    /// Not hashed — computed from voice table geometry.
    pub kinship: f32,           // [0.0, 1.0]
}

/// Symmetric pair hash — pair_hash(a, b) == pair_hash(b, a).
/// Sorts indices before packing to enforce symmetry (Zero-Quadratic Law 2).
fn pair_hash(idx_a: usize, idx_b: usize, salt: u64) -> u64 {
    let (lo, hi) = if idx_a <= idx_b { (idx_a, idx_b) } else { (idx_b, idx_a) };
    let mut h = Xxh64::new(WORLD_SEED ^ salt);
    h.update(&(lo as u64).to_le_bytes());
    h.update(&(hi as u64).to_le_bytes());
    h.digest()
}

fn to_float(h: u64) -> f32 {
    (h & 0xFFFF_FFFF) as f32 / 0x1_0000_0000_u64 as f32
}

/// Compute kinship from row-0 of each voice's multi-row style table.
/// Uses unnormalized dot product clamped to [0,1] — NOT cosine similarity
/// (voices are not L2-normalized in the working codebase).
fn compute_kinship(voice_table: &VoiceTable, a: usize, b: usize) -> f32 {
    let va = &voice_table[a][0]; // representative row (token count 0)
    let vb = &voice_table[b][0];

    // Normalise on the fly for the kinship dot product only
    let norm_a: f32 = va.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-8);
    let norm_b: f32 = vb.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-8);

    let dot: f32 = va.iter().zip(vb).map(|(x, y)| x * y).sum();
    (dot / (norm_a * norm_b)).clamp(0.0, 1.0)
}

/// Derive per-arc properties for the (voice_a, voice_b) pair.
/// Symmetric — same result regardless of argument order.
pub fn arc_properties(idx_a: usize, idx_b: usize, voice_table: &VoiceTable) -> ArcProperties {
    let h_curve    = pair_hash(idx_a, idx_b, SALT_ARC_CURVE);
    let h_harmonic = pair_hash(idx_a, idx_b, SALT_ARC_HARMONIC);
    let h_spectral = pair_hash(idx_a, idx_b, SALT_ARC_SPECTRAL);

    ArcProperties {
        curve_warp:      0.2 + to_float(h_curve) * 0.6,        // [0.2, 0.8]
        harmonic_weight: to_float(h_harmonic) * 0.3,           // [0.0, 0.3]
        spectral_skew:   to_float(h_spectral) * 0.30 - 0.15,   // [-0.15, +0.15]
        kinship:         compute_kinship(voice_table, idx_a, idx_b),
    }
}

/// Precompute all 325 arc property sets at startup.
/// Cost: 325 pair_hash calls x 3 salts + 325 kinship dot products.
/// Total: < 100 us on modern hardware. Memory: 26x26x4x4 = 10.8 KB.
pub fn build_arc_table(voice_table: &VoiceTable) -> Vec<Vec<ArcProperties>> {
    let n = voice_table.len(); // 26
    let mut table: Vec<Vec<ArcProperties>> = Vec::with_capacity(n);
    for a in 0..n {
        let mut row = Vec::with_capacity(n);
        for b in 0..n {
            row.push(if a == b {
                // Degenerate self-arc: identity properties (no warping, no blend)
                ArcProperties {
                    curve_warp: 0.5,
                    harmonic_weight: 0.0,
                    spectral_skew: 0.0,
                    kinship: 1.0,
                }
            } else {
                arc_properties(a, b, voice_table)
            });
        }
        table.push(row);
    }
    eprintln!("[arc_table] built {}x{} arc properties", n, n);
    table
}
```

---

### Step 7 — Rust: slerp.rs

Voice style blending module. `VoiceTable` is `Vec<Vec<Vec<f32>>>` (26 voices,
each with N rows of 256 floats). No normalisation, no pooling — raw per-token-count
style rows from the NPZ. `resolve_style` selects the row matching the token count
then lerps between voice A and voice B. `resolve_style_quadratic` applies
Zero-Quadratic curve warp, spectral skew, and harmonic blend before the standard
lerp. `lerp_vec` is now `pub` for use by the arc-aware path.

#### `src-tauri/src/slerp.rs`

```rust
use anyhow::{Context, Result};
use std::collections::HashMap;
use crate::zerovoice::{KOKORO_VOICES, VoiceSpec};
use crate::arc_properties::ArcProperties;

/// Each voice is a 2D array: rows indexed by token count, each row is 256 floats.
/// Shape in the NPZ is (N, 1, 256) where N = 511 (max token length + 1).
pub type VoiceTable = Vec<Vec<Vec<f32>>>;

const STYLE_DIM: usize = 256;

/// Load all 26 voice style vectors from Kokoro's voices-v1.0.bin (NPZ format).
/// Each voice has shape (N, 1, 256) float32 — we store as Vec<Vec<f32>> (N rows of 256).
pub fn load_voice_table(bin_path: &str) -> Result<VoiceTable> {
    let data = std::fs::read(bin_path)
        .with_context(|| format!("cannot read voice bin: {bin_path}"))?;

    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(&data))
        .context("voices-v1.0.bin is not a valid ZIP/NPZ archive")?;

    let mut raw: HashMap<String, Vec<f32>> = HashMap::new();
    for i in 0..zip.len() {
        let mut file = zip.by_index(i)?;
        let name = file.name().trim_end_matches(".npy").to_string();
        let npy = npyz::NpyFile::new(&mut file)?;
        let flat: Vec<f32> = npy.into_vec()?;
        raw.insert(name, flat);
    }

    let mut table: VoiceTable = Vec::with_capacity(KOKORO_VOICES.len());
    for &voice_name in &KOKORO_VOICES {
        let flat = raw.get(voice_name)
            .with_context(|| format!("voice '{voice_name}' missing from voices-v1.0.bin"))?;
        assert!(flat.len() % STYLE_DIM == 0, "unexpected shape for {voice_name}");
        let n_rows = flat.len() / STYLE_DIM;

        // Store each row as a separate 256-dim vector (no normalization, no pooling)
        let rows: Vec<Vec<f32>> = (0..n_rows)
            .map(|r| flat[r * STYLE_DIM..(r + 1) * STYLE_DIM].to_vec())
            .collect();

        eprintln!("[voice_table] {voice_name}: {n_rows} style rows × {STYLE_DIM}");
        table.push(rows);
    }

    Ok(table)
}

/// Linear interpolation between two vectors (preserves magnitude).
pub fn lerp_vec(a: &[f32], b: &[f32], t: f32) -> Vec<f32> {
    a.iter().zip(b).map(|(x, y)| x * (1.0 - t) + y * t).collect()
}

/// Resolve the final 256-dim style vector for a VoiceSpec (non-quadratic fallback).
/// Selects the style row matching the token count, then lerps between voice A and B.
#[allow(dead_code)]
pub fn resolve_style(table: &VoiceTable, spec: &VoiceSpec, token_count: usize) -> Vec<f32> {
    let rows_a = &table[spec.voice_a];
    let rows_b = &table[spec.voice_b];

    // Clamp token count to available rows
    let idx = token_count.min(rows_a.len() - 1).min(rows_b.len() - 1);

    lerp_vec(&rows_a[idx], &rows_b[idx], spec.t)
}

/// Arc-aware style resolution — applies Zero-Quadratic curve warp,
/// spectral skew, and harmonic blend before the standard lerp.
pub fn resolve_style_quadratic(
    table: &VoiceTable,
    arc_props: &ArcProperties,
    spec: &VoiceSpec,
    token_count: usize,
) -> Vec<f32> {
    let rows_a = &table[spec.voice_a];
    let rows_b = &table[spec.voice_b];
    let idx = token_count.min(rows_a.len() - 1).min(rows_b.len() - 1);

    // 1. Warp t through a power curve biased by arc.curve_warp
    let warped_t = {
        let k = arc_props.curve_warp * 2.0;
        let t = spec.t.clamp(1e-6, 1.0 - 1e-6);
        t.powf(k) / (t.powf(k) + (1.0 - t).powf(k))
    };

    // 2. Apply spectral skew
    let skewed_t = (warped_t + arc_props.spectral_skew).clamp(0.0, 1.0);

    // 3. Primary lerp on the skewed position
    let primary = lerp_vec(&rows_a[idx], &rows_b[idx], skewed_t);

    // 4. Harmonic blend toward the mean of A and B
    if arc_props.harmonic_weight < 1e-4 {
        return primary;
    }
    let mean: Vec<f32> = rows_a[idx].iter()
        .zip(&rows_b[idx])
        .map(|(a, b)| (a + b) * 0.5)
        .collect();
    lerp_vec(&primary, &mean, arc_props.harmonic_weight)
}
```

---

### Step 8 — Rust: phonemize.rs

Phonemisation module. Contains the `KOKORO_SYMBOLS` constant with the complete
Kokoro vocabulary (pad, punctuation including curly quotes, uppercase, lowercase,
and IPA characters). Uses espeak-ng as a command-line argument (not stdin) to
avoid buffering issues. Maps IPA output to token IDs with pad tokens at start/end.

#### `src-tauri/src/phonemize.rs`

```rust
use anyhow::{Context, Result};
use std::collections::HashMap;

/// Kokoro's symbol vocabulary — token ID = index in this list.
/// Source: Kokoro model's text/symbols.py
/// [0] = pad ($), [1..16] = punctuation, [17..68] = letters, [69+] = IPA
const KOKORO_SYMBOLS: &str = concat!(
    "$",                                           // 0: pad
    ";:,.!?\u{00a1}\u{00bf}\u{2014}\u{2026}\"\u{00ab}\u{00bb}\u{201c}\u{201d} ",            // 1-16: punctuation (including curly quotes + space)
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",                  // 17-42: uppercase
    "abcdefghijklmnopqrstuvwxyz",                  // 43-68: lowercase
    "\u{0251}\u{0250}\u{0252}\u{00e6}\u{0253}\u{0299}\u{03b2}\u{0254}\u{0255}\u{00e7}\u{0257}\u{0256}\u{00f0}\u{02a4}\u{0259}\u{0258}\u{025a}\u{025b}\u{025c}\u{025d}\u{025e}\u{025f}\u{0284}\u{0261}\u{0260}\u{0262}\u{029b}\u{0266}\u{0267}\u{0127}\u{0265}\u{029c}\u{0268}\u{026a}\u{029d}\u{026d}\u{026c}\u{026b}\u{026e}\u{029f}\u{0271}\u{026f}\u{0270}\u{014b}\u{0273}\u{0272}\u{0274}\u{00f8}\u{0275}\u{0278}\u{03b8}\u{0153}\u{0276}\u{0298}\u{0279}\u{027a}\u{027e}\u{027b}\u{0280}\u{0281}\u{027d}\u{0282}\u{0283}\u{0288}\u{02a7}\u{0289}\u{028a}\u{028b}\u{2c71}\u{028c}\u{0263}\u{0264}\u{028d}\u{03c7}\u{028e}\u{028f}\u{0291}\u{0290}\u{0292}\u{0294}\u{02a1}\u{0295}\u{02a2}\u{01c0}\u{01c1}\u{01c2}\u{01c3}\u{02c8}\u{02cc}\u{02d0}\u{02d1}\u{02bc}\u{02b4}\u{02b0}\u{02b1}\u{02b2}\u{02b7}\u{02e0}\u{02e4}\u{02de}",  // 69+: IPA
);

/// Build the character → token ID lookup table (lazy, built once).
fn symbol_map() -> &'static HashMap<char, i64> {
    static MAP: std::sync::OnceLock<HashMap<char, i64>> = std::sync::OnceLock::new();
    MAP.get_or_init(|| {
        let map: HashMap<char, i64> = KOKORO_SYMBOLS
            .chars()
            .enumerate()
            .map(|(i, c)| (c, i as i64))
            .collect();
        eprintln!("[phonemize] symbol table built: {} entries", map.len());
        map
    })
}

/// Run espeak-ng as a subprocess to convert raw text to IPA phonemes,
/// then map each IPA character to Kokoro's token vocabulary.
pub fn phonemize(text: &str, espeak_path: &str, data_dir: &str) -> Result<Vec<i64>> {
    // Pass text as argument, not via stdin — avoids buffering/flush issues
    let result = std::process::Command::new(espeak_path)
        .args([
            "-q",           // quiet — no audio
            "--ipa",        // output IPA
            "-v", "en-us",  // American English
            text,
        ])
        .env("ESPEAK_DATA_PATH", data_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output()
        .context("failed to run espeak-ng")?;

    let ipa = String::from_utf8_lossy(&result.stdout).trim().to_string();
    eprintln!("[phonemize] espeak IPA: {:?}", &ipa);

    ipa_to_tokens(&ipa)
}

/// Map IPA string to Kokoro token IDs.
/// Each character is looked up in the symbol table; unknown chars are skipped.
fn ipa_to_tokens(ipa: &str) -> Result<Vec<i64>> {
    let map = symbol_map();

    let mut tokens: Vec<i64> = Vec::new();
    let mut skipped: Vec<char> = Vec::new();

    for ch in ipa.chars() {
        if let Some(&id) = map.get(&ch) {
            tokens.push(id);
        } else if !ch.is_whitespace() || ch == ' ' {
            // Space (index 16) should be in the map; skip other whitespace/newlines
            skipped.push(ch);
        }
    }

    if !skipped.is_empty() {
        eprintln!("[phonemize] skipped {} unmapped chars: {:?}", skipped.len(),
            skipped.iter().take(20).collect::<String>());
    }

    eprintln!("[phonemize] {} IPA chars → {} tokens", ipa.chars().count(), tokens.len());

    // Kokoro requires pad token 0 at start and end; max context 510 tokens
    tokens.truncate(510);
    let mut padded = vec![0_i64];
    padded.extend(tokens);
    padded.push(0);

    Ok(padded)
}
```

---

### Step 9 — Rust: kokoro_tts.rs

The ONNX inference wrapper. Uses `ort::session::Session`,
`ort::session::builder::SessionBuilder`, and `ort::value::Tensor`.
The `synthesize` method takes `&mut self` (required by ort's `session.run()`).
Speed is always `1.0`. Output tensor name is read from `session.outputs()[0].name()`.
Now includes `arc_table` field, `build_arc_table` call during init,
`resolve_style_quadratic` for arc-aware synthesis, and `arc_table()` accessor.

#### `src-tauri/src/kokoro_tts.rs`

```rust
use anyhow::Result;
use ort::session::Session;
use ort::session::builder::SessionBuilder;
use ort::value::Tensor;
use crate::slerp::{VoiceTable, load_voice_table, resolve_style_quadratic};
use crate::arc_properties::{ArcProperties, build_arc_table};
use crate::zerovoice::VoiceSpec;

pub struct KokoroSession {
    session:     Session,
    voice_table: VoiceTable,
    arc_table:   Vec<Vec<ArcProperties>>,
}

impl KokoroSession {
    /// Initialise the ONNX session and load the voice style table.
    /// Call once at app startup; store in Tauri managed state.
    pub fn new(model_path: &str, voices_path: &str) -> Result<Self> {
        eprintln!("[KokoroSession] creating SessionBuilder...");
        let t0 = std::time::Instant::now();

        let builder = SessionBuilder::new()
            .map_err(|e| anyhow::anyhow!("failed to create ORT SessionBuilder: {e}"))?;
        eprintln!("[KokoroSession] SessionBuilder created in {:.1}s", t0.elapsed().as_secs_f32());

        let mut builder = builder.with_intra_threads(2)
            .map_err(|e| anyhow::anyhow!("failed to set intra_threads: {e}"))?;

        eprintln!("[KokoroSession] loading ONNX model from: {model_path}");
        let t1 = std::time::Instant::now();
        let session = builder.commit_from_file(model_path)
            .map_err(|e| anyhow::anyhow!("failed to load ONNX model {model_path}: {e}"))?;
        eprintln!("[KokoroSession] ONNX model loaded in {:.1}s", t1.elapsed().as_secs_f32());

        eprintln!("[KokoroSession] loading voice table from: {voices_path}");
        let t2 = std::time::Instant::now();
        let voice_table = load_voice_table(voices_path)?;
        eprintln!("[KokoroSession] voice table loaded in {:.1}s ({} voices)", t2.elapsed().as_secs_f32(), voice_table.len());

        // Log model input/output names for debugging
        let t3 = std::time::Instant::now();
        let arc_table = build_arc_table(&voice_table);
        eprintln!("[KokoroSession] arc table built in {:.1}ms", t3.elapsed().as_secs_f64() * 1000.0);

        eprintln!("[KokoroSession] inputs:  {:?}", session.inputs().iter().map(|i| i.name().to_string()).collect::<Vec<_>>());
        eprintln!("[KokoroSession] outputs: {:?}", session.outputs().iter().map(|o| o.name().to_string()).collect::<Vec<_>>());

        eprintln!("[KokoroSession] total init: {:.1}s", t0.elapsed().as_secs_f32());
        Ok(Self { session, voice_table, arc_table })
    }

    /// Synthesise speech from token IDs and a VoiceSpec (with optional overrides).
    /// Returns raw float32 PCM samples at 24 kHz, mono.
    pub fn synthesize(
        &mut self,
        tokens:    &[i64],
        spec:      &VoiceSpec,
        override_t:      Option<f32>,
        override_pitch:  Option<f32>,
        override_energy: Option<f32>,
    ) -> Result<Vec<f32>> {
        // Apply overrides
        let working = VoiceSpec {
            voice_a:      spec.voice_a,
            voice_b:      spec.voice_b,
            t:            override_t.unwrap_or(spec.t),
            pitch_scale:  override_pitch.unwrap_or(spec.pitch_scale),
            energy_scale: override_energy.unwrap_or(spec.energy_scale),
        };

        // Zero-Quadratic: resolve style with arc-aware warping
        let arc_props = &self.arc_table[working.voice_a][working.voice_b];
        let style_vec = resolve_style_quadratic(
            &self.voice_table, arc_props, &working, tokens.len()
        );

        // Build input tensors using ort v2 rc12 Tensor API
        // Kokoro expects: tokens [1, N], style [1, 256], speed [1] (1.0 = normal)
        let n = tokens.len();
        let tokens_tensor = Tensor::<i64>::from_array(([1, n], tokens.to_vec()))
            .map_err(|e| anyhow::anyhow!("failed to build tokens tensor: {e}"))?;
        let style_tensor = Tensor::<f32>::from_array(([1_usize, 256], style_vec))
            .map_err(|e| anyhow::anyhow!("failed to build style tensor: {e}"))?;
        // Speed controls speaking rate — 1.0 = normal, not pitch_scale
        let speed_tensor = Tensor::<f32>::from_array(([1_usize], vec![1.0_f32]))
            .map_err(|e| anyhow::anyhow!("failed to build speed tensor: {e}"))?;

        let inputs = ort::inputs![
            "tokens" => tokens_tensor,
            "style"  => style_tensor,
            "speed"  => speed_tensor,
        ];

        // Cache output name before run() borrows session mutably
        let output_name = self.session.outputs()[0].name().to_string();

        let outputs = self.session.run(inputs)
            .map_err(|e| anyhow::anyhow!("ONNX inference failed: {e}"))?;

        let (_shape, data) = outputs[output_name.as_str()]
            .try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("failed to extract output tensor '{output_name}': {e}"))?;

        Ok(data.to_vec())
    }

    /// Expose arc table for spec_to_dto arc property display
    pub fn arc_table(&self) -> &Vec<Vec<ArcProperties>> {
        &self.arc_table
    }
}
```

---

### Step 10 — Rust: setup.rs

Asset download and extraction module. `download_file` streams with progress events
(throttled to ~64 KB). `download_all` handles model, voices, and espeak-ng.
`extract_espeak_msi` uses `msiexec /a` for silent extraction. `find_file` and
`copy_dir_all` are recursive helpers. There is NO ort DLL download — `ort-sys`
provides it via the `download-binaries` feature at build time.

#### `src-tauri/src/setup.rs`

```rust
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

#[derive(serde::Serialize, Clone)]
pub struct DownloadProgress {
    pub asset: String,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub step: usize,
    pub total_steps: usize,
}

#[derive(serde::Serialize, Clone)]
pub struct AssetStatus {
    pub model: bool,
    pub voices: bool,
    pub espeak: bool,
    pub ort_dll: bool, // kept for API compat but always true (ort-sys provides DLL)
    pub all_ready: bool,
}

const MODEL_URL: &str =
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx";
const VOICES_URL: &str =
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin";
const ESPEAK_MSI_URL: &str =
    "https://github.com/espeak-ng/espeak-ng/releases/download/1.51/espeak-ng-X64.msi";

/// Resolve the app-data resources directory (writable, persists across runs).
pub fn resources_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .context("failed to resolve app data dir")?
        .join("resources");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Check which assets are present on disk.
pub fn check_assets(res: &Path) -> AssetStatus {
    let model = res.join("kokoro-v1.0.int8.onnx").exists();
    let voices = res.join("voices-v1.0.bin").exists();
    let espeak = res.join("espeak-ng.exe").exists() && res.join("espeak-ng-data").is_dir();
    AssetStatus {
        model,
        voices,
        espeak,
        ort_dll: true, // ort-sys provides the DLL via download-binaries
        all_ready: model && voices && espeak,
    }
}

/// Download a single file with streaming progress events.
async fn download_file(
    url: &str,
    dest: &Path,
    asset_name: &str,
    step: usize,
    total_steps: usize,
    app: &AppHandle,
) -> Result<()> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()?;

    let resp = client
        .get(url)
        .send()
        .await
        .with_context(|| format!("HTTP request failed for {asset_name}"))?
        .error_for_status()
        .with_context(|| format!("bad status downloading {asset_name}"))?;

    let total = resp.content_length().unwrap_or(0);
    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(dest)
        .await
        .with_context(|| format!("cannot create {}", dest.display()))?;

    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.context("stream error")?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;

        // Throttle events to ~every 64 KB
        if downloaded - last_emit > 65_536 || downloaded == total {
            let _ = app.emit(
                "download-progress",
                DownloadProgress {
                    asset: asset_name.to_string(),
                    bytes_downloaded: downloaded,
                    total_bytes: total,
                    step,
                    total_steps,
                },
            );
            last_emit = downloaded;
        }
    }

    file.flush().await?;
    Ok(())
}

/// Download every missing asset, then extract archives.
pub async fn download_all(app: &AppHandle) -> Result<()> {
    let res = resources_dir(app)?;
    let status = check_assets(&res);

    let total = [!status.model, !status.voices, !status.espeak]
        .iter()
        .filter(|&&m| m)
        .count();
    let mut step: usize = 0;

    // ── 1. Kokoro ONNX model ────────────────────────────────────────
    if !status.model {
        step += 1;
        download_file(
            MODEL_URL,
            &res.join("kokoro-v1.0.int8.onnx"),
            "KokoroTTS ONNX Model (~88 MB)",
            step,
            total,
            app,
        )
        .await?;
    }

    // ── 2. Voice style vectors ──────────────────────────────────────
    if !status.voices {
        step += 1;
        download_file(
            VOICES_URL,
            &res.join("voices-v1.0.bin"),
            "Voice Style Vectors (~3 MB)",
            step,
            total,
            app,
        )
        .await?;
    }

    // ORT DLL is provided by ort-sys at build time — no download needed.

    // ── 3. eSpeak-NG (from MSI via msiexec) ────────────────────────
    if !status.espeak {
        step += 1;
        let msi_path = res.join("_espeak_temp.msi");
        download_file(
            ESPEAK_MSI_URL,
            &msi_path,
            "eSpeak-NG Phonemizer (~15 MB)",
            step,
            total,
            app,
        )
        .await?;
        extract_espeak_msi(&msi_path, &res)?;
        let _ = std::fs::remove_file(&msi_path);
    }

    Ok(())
}

// ── zip helpers ─────────────────────────────────────────────────────

// ── espeak-ng MSI extraction ────────────────────────────────────────

fn extract_espeak_msi(msi_path: &Path, dest: &Path) -> Result<()> {
    let temp = dest.join("_espeak_extract");
    std::fs::create_dir_all(&temp)?;

    // msiexec /a performs an "administrative install" — a silent extraction.
    let status = std::process::Command::new("msiexec")
        .args([
            "/a",
            msi_path.to_str().unwrap(),
            "/qn",
            &format!("TARGETDIR={}", temp.to_str().unwrap()),
        ])
        .status()
        .context("failed to launch msiexec")?;

    if !status.success() {
        let _ = std::fs::remove_dir_all(&temp);
        anyhow::bail!("msiexec exited with {status}");
    }

    // Find espeak-ng.exe in the extracted tree
    let exe = find_file(&temp, "espeak-ng.exe")
        .context("espeak-ng.exe not found in extracted MSI")?;
    let espeak_root = exe.parent().unwrap();

    // Copy executable
    std::fs::copy(&exe, dest.join("espeak-ng.exe"))?;

    // Copy espeak-ng-data directory
    let data_src = espeak_root.join("espeak-ng-data");
    if data_src.is_dir() {
        copy_dir_all(&data_src, &dest.join("espeak-ng-data"))?;
    }

    // Cleanup
    let _ = std::fs::remove_dir_all(&temp);
    Ok(())
}

/// Recursively search for a file by name under `root`.
fn find_file(root: &Path, name: &str) -> Option<PathBuf> {
    for entry in std::fs::read_dir(root).ok()?.flatten() {
        let p = entry.path();
        if p.is_file() && p.file_name().map(|n| n == name).unwrap_or(false) {
            return Some(p);
        }
        if p.is_dir() {
            if let Some(found) = find_file(&p, name) {
                return Some(found);
            }
        }
    }
    None
}

/// Recursively copy a directory tree.
fn copy_dir_all(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let s = entry.path();
        let d = dst.join(entry.file_name());
        if s.is_dir() {
            copy_dir_all(&s, &d)?;
        } else {
            std::fs::copy(&s, &d)?;
        }
    }
    Ok(())
}
```

---

### Step 11 — Rust: commands/mod.rs, commands/voice.rs, commands/setup.rs

The Tauri command layer. `voice.rs` takes a `gender_filter` param and uses
`unwrap_or_else` for mutex poison recovery. `preview_voice_spec` now takes
`State<SessionState>`, returns `Result<VoiceSpecDto, String>`, and fetches
arc properties from the session's precomputed arc table. `setup.rs` has an
idempotent `init_session` that uses `spawn_blocking` for the heavy model load.

#### `src-tauri/src/commands/mod.rs`

```rust
pub mod voice;
pub mod setup;
```

#### `src-tauri/src/commands/voice.rs`

```rust
use tauri::State;
use crate::setup;
use crate::zerovoice::{voice_from_spawn, voice_from_spawn_biased, spec_to_dto, VoiceSpecDto, GenderFilter};
use crate::phonemize::phonemize;
use crate::SessionState;

/// Main synthesis command. Called by the frontend Synthesise button.
#[tauri::command]
pub async fn synthesize_npc_speech(
    state:           State<'_, SessionState>,
    app:             tauri::AppHandle,
    spawn_x:         i32,
    spawn_y:         i32,
    spawn_z:         i32,
    text:            String,
    use_region_bias: bool,
    gender_filter:   GenderFilter,
    override_t:      Option<f32>,
    override_pitch:  Option<f32>,
    override_energy: Option<f32>,
    override_voice_a: Option<usize>,
    override_voice_b: Option<usize>,
) -> Result<Vec<f32>, String> {
    let res_dir = setup::resources_dir(&app).map_err(|e| e.to_string())?;
    let espeak_exe = res_dir.join("espeak-ng.exe");
    let espeak_data = res_dir.join("espeak-ng-data");

    let mut spec = if use_region_bias {
        voice_from_spawn_biased(spawn_x, spawn_y, spawn_z, gender_filter)
    } else {
        voice_from_spawn(spawn_x, spawn_y, spawn_z, gender_filter)
    };

    if let Some(a) = override_voice_a { spec.voice_a = a; }
    if let Some(b) = override_voice_b { spec.voice_b = b; }

    let tokens = phonemize(
        &text,
        espeak_exe.to_str().unwrap(),
        espeak_data.to_str().unwrap(),
    ).map_err(|e| e.to_string())?;

    let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let session = guard
        .as_mut()
        .ok_or_else(|| "TTS session not initialised — run setup first".to_string())?;

    session
        .synthesize(&tokens, &spec, override_t, override_pitch, override_energy)
        .map_err(|e| e.to_string())
}

/// Lightweight preview command — derives VoiceSpec and returns DTO without synthesis.
/// Includes Zero-Quadratic arc properties from the session's precomputed arc table.
#[tauri::command]
pub fn preview_voice_spec(
    state:           State<'_, SessionState>,
    spawn_x:         i32,
    spawn_y:         i32,
    spawn_z:         i32,
    use_region_bias: bool,
    gender_filter:   GenderFilter,
) -> Result<VoiceSpecDto, String> {
    let spec = if use_region_bias {
        voice_from_spawn_biased(spawn_x, spawn_y, spawn_z, gender_filter)
    } else {
        voice_from_spawn(spawn_x, spawn_y, spawn_z, gender_filter)
    };

    // Get arc properties from session state (if loaded)
    let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let arc = if let Some(session) = guard.as_ref() {
        session.arc_table()[spec.voice_a][spec.voice_b].clone()
    } else {
        crate::arc_properties::ArcProperties {
            curve_warp: 0.5,
            harmonic_weight: 0.0,
            spectral_skew: 0.0,
            kinship: 0.0,
        }
    };

    Ok(spec_to_dto(spawn_x, spawn_y, spawn_z, &spec, &arc))
}
```

#### `src-tauri/src/commands/setup.rs`

```rust
use tauri::State;
use crate::setup::{self, AssetStatus};
use crate::kokoro_tts::KokoroSession;
use crate::SessionState;

/// Check whether all required assets are present on disk.
#[tauri::command]
pub fn check_setup(app: tauri::AppHandle) -> Result<AssetStatus, String> {
    let res = setup::resources_dir(&app).map_err(|e| e.to_string())?;
    Ok(setup::check_assets(&res))
}

/// Download every missing asset. Emits `download-progress` events as it goes.
#[tauri::command]
pub async fn run_setup(app: tauri::AppHandle) -> Result<(), String> {
    setup::download_all(&app).await.map_err(|e| e.to_string())
}

/// Initialise the ONNX session after assets are confirmed present.
/// Idempotent — returns Ok immediately if session is already loaded.
/// Runs the heavy model load on a blocking thread so the UI stays responsive.
#[tauri::command]
pub async fn init_session(
    app: tauri::AppHandle,
    state: State<'_, SessionState>,
) -> Result<(), String> {
    eprintln!("[init_session] command invoked");

    // Check if already initialised (idempotent — safe under React StrictMode double-invoke)
    {
        let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
        if guard.is_some() {
            eprintln!("[init_session] session already loaded, skipping");
            return Ok(());
        }
    }

    let res = setup::resources_dir(&app).map_err(|e| e.to_string())?;

    let model_path = res.join("kokoro-v1.0.int8.onnx");
    let voices_path = res.join("voices-v1.0.bin");
    eprintln!("[init_session] model: {} ({})", model_path.display(), model_path.exists());
    eprintln!("[init_session] voices: {} ({})", voices_path.display(), voices_path.exists());

    let mp = model_path.to_str().unwrap().to_string();
    let vp = voices_path.to_str().unwrap().to_string();

    eprintln!("[init_session] spawning blocking thread for model load...");
    let session = tokio::task::spawn_blocking(move || {
        eprintln!("[init_session] blocking thread started");
        KokoroSession::new(&mp, &vp)
    })
    .await
    .map_err(|e| format!("spawn_blocking join error: {e}"))?
    .map_err(|e| e.to_string())?;

    eprintln!("[ZeroVoice] ONNX session ready");

    let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    *guard = Some(session);

    Ok(())
}
```

---

### Step 12 — Rust: lib.rs and main.rs

Application entry points. `SessionState` wraps `Mutex<Option<KokoroSession>>` --
`None` until assets are downloaded and `init_session` is called. The `setup` closure
logs the app-data directory. ORT DLL is handled by the `download-binaries` feature.
Now includes `mod arc_properties`.

#### `src-tauri/src/lib.rs`

```rust
mod zerovoice;
mod slerp;
mod arc_properties;
mod kokoro_tts;
mod phonemize;
mod setup;
pub mod commands;

use std::sync::Mutex;
use tauri::Manager;
use kokoro_tts::KokoroSession;

/// Lazy session state — None until assets are downloaded and init_session is called.
pub struct SessionState(pub Mutex<Option<KokoroSession>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            eprintln!("[ZeroVoice] setup() started");
            app.manage(SessionState(Mutex::new(None)));

            // ORT DLL is provided by ort-sys via download-binaries feature.
            // No manual DLL loading needed.
            let data_dir = app.path().app_data_dir()
                .expect("failed to get app data dir");
            eprintln!("[ZeroVoice] app_data_dir: {}", data_dir.display());

            eprintln!("[ZeroVoice] setup() complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::voice::synthesize_npc_speech,
            commands::voice::preview_voice_spec,
            commands::setup::check_setup,
            commands::setup::run_setup,
            commands::setup::init_session,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("[ZeroVoice] FATAL: {e}");
            std::process::exit(1);
        });
}
```

#### `src-tauri/src/main.rs`

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    eprintln!("[ZeroVoice] main() entered");
    zerov0ice_lib::run();
    eprintln!("[ZeroVoice] main() exiting normally");
}
```

---

## Step 13 — TypeScript Types (`src/lib/types.ts`)

Now includes the four Zero-Quadratic arc property fields on `VoiceSpec`.

```ts
export interface Coords {
  x: number;
  y: number;
  z: number;
}

export interface VoiceSpec {
  voiceA:      number;
  voiceB:      number;
  voiceAName:  string;
  voiceBName:  string;
  t:           number;
  pitchScale:  number;
  energyScale: number;
  hashHex:     string;
  arcIndex:    number;
  // Zero-Quadratic arc properties
  arcCurveWarp:      number;
  arcHarmonicWeight: number;
  arcSpectralSkew:   number;
  arcKinship:        number;
}

export interface Overrides {
  t:      { locked: boolean; value: number };
  pitch:  { locked: boolean; value: number };
  energy: { locked: boolean; value: number };
  voiceA: { locked: boolean; value: number };
  voiceB: { locked: boolean; value: number };
}

export interface HistoryEntry {
  id:        string;
  coords:    Coords;
  spec:      VoiceSpec;
  overrides: Overrides;
  text:      string;
  durationS: number;
  timestamp: number;
}

export interface PresetSlot {
  coords: Coords | null;
}

export type SynthesisState = "idle" | "synthesising" | "playing" | "error";

export type GenderFilter = "mixed" | "male" | "female";
```

---

## Step 14 — Browser-Side Hash Preview (`src/lib/zerovoice-preview.ts`)

Now returns default arc property values (computed Rust-side; browser preview uses
defaults of 0.5/0.0/0.0/0.0).

```ts
import createXXHash64 from "xxhash-wasm";
import type { VoiceSpec } from "./types";

export const KOKORO_VOICES: readonly string[] = [
  "af_alloy", "af_aoede", "af_bella",   "af_jessica", "af_kore",
  "af_nicole", "af_nova",  "af_river",   "af_sarah",   "af_sky",
  "am_adam",  "am_echo",  "am_eric",    "am_fenrir",  "am_liam",
  "am_michael","am_onyx", "am_puck",    "bf_alice",   "bf_emma",
  "bf_isabella","bf_lily","bm_daniel",  "bm_fable",   "bm_george",
  "bm_lewis",
] as const;

export const isFemale = (name: string): boolean => name[1] === "f";

const NUM_VOICES = BigInt(KOKORO_VOICES.length); // 26n
const WORLD_SEED = 0xDEADBEEFC0FFEn;

// Salts — must match Rust constants exactly
const SALT_VOICE_A = 0x0001n;
const SALT_VOICE_B = 0x0002n;
const SALT_SLERP_T = 0x0003n;
const SALT_PITCH   = 0x0004n;
const SALT_ENERGY  = 0x0005n;

let _xxh64: Awaited<ReturnType<typeof createXXHash64>> | null = null;

async function getHasher() {
  if (!_xxh64) _xxh64 = await createXXHash64();
  return _xxh64;
}

function hashCoords(
  xxh64: Awaited<ReturnType<typeof createXXHash64>>,
  sx: number, sy: number, sz: number,
  salt: bigint,
  worldSeed: bigint = WORLD_SEED
): bigint {
  const seed = worldSeed ^ salt;
  const buf = new ArrayBuffer(12);
  const view = new DataView(buf);
  view.setInt32(0, sx, true);
  view.setInt32(4, sy, true);
  view.setInt32(8, sz, true);
  const seedLo = Number(seed & 0xFFFFFFFFn);
  const seedHi = Number((seed >> 32n) & 0xFFFFFFFFn);
  const result = xxh64.h64Raw(new Uint8Array(buf), BigInt(seedLo) | (BigInt(seedHi) << 32n));
  return result;
}

function toFloat(h: bigint): number {
  return Number(h & 0xFFFFFFFFn) / 0x100000000;
}

function arcIndex(a: number, b: number): number {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return lo * (KOKORO_VOICES.length - 1) - Math.floor(lo * (lo - 1) / 2) + hi - lo - 1;
}

export async function deriveVoiceSpec(
  sx: number, sy: number, sz: number,
  worldSeedOverride?: bigint
): Promise<VoiceSpec> {
  const xxh64 = await getHasher();
  const ws = worldSeedOverride ?? WORLD_SEED;
  const h = (salt: bigint) => hashCoords(xxh64, sx, sy, sz, salt, ws);

  const hA = h(SALT_VOICE_A);
  const hB = h(SALT_VOICE_B);
  const hT = h(SALT_SLERP_T);
  const hP = h(SALT_PITCH);
  const hE = h(SALT_ENERGY);

  const idxA = Number(hA % NUM_VOICES);
  const idxB = (Number(hB % (NUM_VOICES - 1n)) + idxA + 1) % KOKORO_VOICES.length;

  return {
    voiceA:      idxA,
    voiceB:      idxB,
    voiceAName:  KOKORO_VOICES[idxA],
    voiceBName:  KOKORO_VOICES[idxB],
    t:           toFloat(hT),
    pitchScale:  0.85 + toFloat(hP) * 0.30,
    energyScale: 0.80 + toFloat(hE) * 0.40,
    hashHex:     hA.toString(16).padStart(16, "0"),
    arcIndex:    arcIndex(idxA, idxB),
    // Arc properties are computed Rust-side; browser preview uses defaults
    arcCurveWarp:      0.5,
    arcHarmonicWeight: 0.0,
    arcSpectralSkew:   0.0,
    arcKinship:        0.0,
  };
}
```

---

## Step 15 — Tauri Invoke Wrappers (`src/lib/voice.ts`)

```ts
import { invoke } from "@tauri-apps/api/core";
import type { Overrides, VoiceSpec, GenderFilter } from "./types";

export interface SynthesizeArgs {
  spawnX:        number;
  spawnY:        number;
  spawnZ:        number;
  text:          string;
  useRegionBias: boolean;
  genderFilter:  GenderFilter;
  overrideT:     number | null;
  overridePitch: number | null;
  overrideEnergy:number | null;
  overrideVoiceA:number | null;
  overrideVoiceB:number | null;
}

export async function synthesizeNpcSpeech(args: SynthesizeArgs): Promise<Float32Array> {
  const raw = await invoke<number[]>("synthesize_npc_speech", {
    spawnX:         args.spawnX,
    spawnY:         args.spawnY,
    spawnZ:         args.spawnZ,
    text:           args.text,
    useRegionBias:  args.useRegionBias,
    genderFilter:   args.genderFilter,
    overrideT:      args.overrideT,
    overridePitch:  args.overridePitch,
    overrideEnergy: args.overrideEnergy,
    overrideVoiceA: args.overrideVoiceA,
    overrideVoiceB: args.overrideVoiceB,
  });
  return new Float32Array(raw);
}

export async function previewVoiceSpec(
  x: number, y: number, z: number,
  useRegionBias: boolean,
  genderFilter: GenderFilter
): Promise<VoiceSpec> {
  return invoke<VoiceSpec>("preview_voice_spec", {
    spawnX: x, spawnY: y, spawnZ: z, useRegionBias, genderFilter,
  });
}

export function buildSynthArgs(
  x: number, y: number, z: number,
  text: string,
  overrides: Overrides,
  useRegionBias: boolean,
  genderFilter: GenderFilter
): SynthesizeArgs {
  return {
    spawnX: x, spawnY: y, spawnZ: z, text, useRegionBias, genderFilter,
    overrideT:      overrides.t.locked      ? overrides.t.value      : null,
    overridePitch:  overrides.pitch.locked  ? overrides.pitch.value  : null,
    overrideEnergy: overrides.energy.locked ? overrides.energy.value : null,
    overrideVoiceA: overrides.voiceA.locked ? overrides.voiceA.value : null,
    overrideVoiceB: overrides.voiceB.locked ? overrides.voiceB.value : null,
  };
}
```

---

## Step 16 — WAV Export (`src/lib/waveform.ts`)

```ts
export function encodePcmAsWav(pcm: Float32Array, sampleRate = 24000): Blob {
  const numSamples = pcm.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const str = (off: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(off + i, c.charCodeAt(0)));

  str(0,  "RIFF");
  view.setUint32( 4, 36 + numSamples * 2,  true);
  str(8,  "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16,               true); // subchunk size
  view.setUint16(20,  1,               true); // PCM
  view.setUint16(22,  1,               true); // mono
  view.setUint32(24, sampleRate,       true);
  view.setUint32(28, sampleRate * 2,   true); // byte rate
  view.setUint16(32,  2,               true); // block align
  view.setUint16(34, 16,               true); // bits per sample
  str(36, "data");
  view.setUint32(40, numSamples * 2,   true);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function downloadWav(pcm: Float32Array, filename = "zerovoice-output.wav"): void {
  const url = URL.createObjectURL(encodePcmAsWav(pcm));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
```

---

## Step 17 — History Utility (`src/lib/history.ts`)

```ts
import type { HistoryEntry } from "./types";

export function exportHistoryJson(history: HistoryEntry[]): void {
  const json = JSON.stringify(history, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: "zerovoice-history.json",
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function formatHistoryEntry(entry: HistoryEntry): string {
  const { coords, spec, text, durationS } = entry;
  const snippet = text.length > 40 ? text.slice(0, 37) + "..." : text;
  return `spawn(${coords.x},${coords.y},${coords.z}) · ${spec.voiceAName}→${spec.voiceBName} · t=${spec.t.toFixed(4)} · "${snippet}" · ${durationS.toFixed(2)}s`;
}
```

---

## Step 18 — CSS Design System (`src/styles/workbench.css`)

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@400;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg-void:        #0d0d0f;
  --bg-panel:       #111114;
  --bg-control:     #18181c;
  --bg-hover:       #1e1e24;
  --border-dim:     #2a2a32;
  --border-mid:     #3a3a46;
  --border-bright:  #505060;
  --amber:          #e8a020;
  --amber-dim:      #7a5010;
  --amber-glow:     #e8a02033;
  --slate:          #4a7fa5;
  --slate-dim:      #243d52;
  --text-primary:   #d4d0c8;
  --text-secondary: #7a7870;
  --text-amber:     #e8a020;
  --text-slate:     #6aafd4;
  --female-border:  #7a4a8a;
  --female-bg:      #2a1a35;
  --female-text:    #c49ad4;
  --green-ready:    #2a6040;
  --font-mono:      'IBM Plex Mono', monospace;
  --font-ui:        'IBM Plex Sans Condensed', sans-serif;
}

html, body, #root { height: 100%; overflow: hidden; }

body {
  background: var(--bg-void);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}

/* Scanline overlay — zero performance cost */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent 0px, transparent 2px,
    rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px
  );
  pointer-events: none;
  z-index: 9999;
}

.workbench {
  display: grid;
  grid-template-rows: 32px 1fr 28px 32px; /* header | columns | history | status */
  grid-template-columns: 220px 1fr 260px;
  height: 100vh;
  gap: 1px;
  background: var(--border-dim); /* 1px gap colour */
}

.workbench-header {
  grid-column: 1 / -1;
  background: var(--bg-panel);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 16px;
  border-bottom: 1px solid var(--border-dim);
}

.workbench-header .app-title {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--amber);
  letter-spacing: 0.12em;
}

.workbench-header .app-meta {
  font-size: 11px;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
}

.panel {
  background: var(--bg-panel);
  padding: 10px 12px;
  overflow-y: auto;
  overflow-x: hidden;
}

.panel-title {
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-dim);
  padding-bottom: 5px;
  margin-bottom: 10px;
}

.history-bar {
  grid-column: 1 / -1;
  background: var(--bg-panel);
  border-top: 1px solid var(--border-dim);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  overflow-x: auto;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-secondary);
}

.history-bar .history-label {
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--text-secondary);
  text-transform: uppercase;
  flex-shrink: 0;
}

.history-entry {
  cursor: pointer;
  padding: 2px 6px;
  border: 1px solid var(--border-dim);
  color: var(--text-secondary);
  transition: color 0.1s, border-color 0.1s;
  flex-shrink: 0;
}
.history-entry:hover { color: var(--text-primary); border-color: var(--border-mid); }
.history-entry.latest { color: var(--amber); border-color: var(--amber-dim); }

.status-bar {
  grid-column: 1 / -1;
  background: var(--bg-panel);
  border-top: 1px solid var(--border-dim);
  display: flex;
  align-items: center;
  padding: 0 14px;
  font-size: 10px;
  color: var(--text-secondary);
  gap: 16px;
}
```

---

## Step 19 — CSS Controls (`src/styles/controls.css`)

```css
/* Coordinate input */
.coord-input {
  font-family: var(--font-mono);
  font-size: 17px;
  font-weight: 500;
  color: var(--amber);
  background: var(--bg-control);
  border: 1px solid var(--border-mid);
  width: 88px;
  text-align: right;
  padding: 3px 6px;
  outline: none;
  caret-color: var(--amber);
  border-radius: 0;
}
.coord-input:focus { border-color: var(--amber); box-shadow: 0 0 0 1px var(--amber-glow); }
.coord-input.error  { border-color: #8a2020; }

/* Amber fill-track range slider */
input[type="range"].param-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 2px;
  background: linear-gradient(
    to right,
    var(--amber) 0%,
    var(--amber) var(--fill-pct, 0%),
    var(--border-mid) var(--fill-pct, 0%),
    var(--border-mid) 100%
  );
  outline: none;
  cursor: pointer;
}
input[type="range"].param-slider:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
input[type="range"].param-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 18px;
  background: var(--amber);
  cursor: pointer;
  border: none;
  border-radius: 0;
}
input[type="range"].param-slider:disabled::-webkit-slider-thumb {
  background: var(--amber-dim);
}

/* Buttons */
.btn-primary {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.06em;
  background: var(--amber);
  color: #0d0d0f;
  border: none;
  border-radius: 0;
  padding: 8px 16px;
  cursor: pointer;
  width: 100%;
  transition: opacity 0.1s;
}
.btn-primary:hover    { opacity: 0.85; }
.btn-primary:active   { opacity: 0.70; }
.btn-primary:disabled { background: var(--amber-dim); color: #4a3010; cursor: not-allowed; opacity: 1; }

.btn-secondary {
  font-family: var(--font-mono);
  font-size: 11px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-mid);
  border-radius: 0;
  padding: 5px 10px;
  cursor: pointer;
  transition: color 0.1s, border-color 0.1s;
}
.btn-secondary:hover { color: var(--text-primary); border-color: var(--border-bright); }

/* Voice badge */
.voice-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border: 1px solid;
  border-radius: 0;
}
.voice-badge.female { background: var(--female-bg); color: var(--female-text); border-color: var(--female-border); }
.voice-badge.male   { background: var(--slate-dim); color: var(--text-slate);   border-color: var(--slate); }

/* Hash display */
.hash-display {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}
.hash-display .hash-value { color: var(--text-amber); letter-spacing: 0.04em; }

/* Lock checkbox */
.lock-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  font-size: 10px;
  color: var(--text-secondary);
  user-select: none;
}
.lock-toggle input[type="checkbox"] {
  accent-color: var(--amber);
  width: 11px;
  height: 11px;
  cursor: pointer;
}
.lock-toggle.active { color: var(--amber); }

/* Voice selector dropdown */
.voice-selector {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-primary);
  background: var(--bg-control);
  border: 1px solid var(--border-mid);
  border-radius: 0;
  padding: 2px 4px;
  outline: none;
}
.voice-selector:focus { border-color: var(--amber); }

/* Textarea */
.synth-textarea {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg-control);
  border: 1px solid var(--border-mid);
  border-radius: 0;
  padding: 8px;
  width: 100%;
  resize: none;
  outline: none;
  caret-color: var(--amber);
}
.synth-textarea:focus { border-color: var(--amber); }
.synth-textarea:disabled { opacity: 0.5; }

/* Stepper button */
.stepper-btn {
  font-family: var(--font-mono);
  font-size: 7px;
  background: var(--bg-control);
  border: 1px solid var(--border-dim);
  color: var(--text-secondary);
  width: 16px;
  height: 11px;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  border-radius: 0;
}
.stepper-btn:hover { border-color: var(--border-mid); color: var(--text-primary); }

/* Preset button */
.preset-btn {
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--bg-control);
  border: 1px solid var(--border-dim);
  color: var(--text-secondary);
  padding: 3px 8px;
  cursor: pointer;
  border-radius: 0;
}
.preset-btn.filled { color: var(--amber); border-color: var(--amber-dim); }
.preset-btn:hover { border-color: var(--border-mid); }
```

---

## Step 20 — React Entry Point (`src/main.tsx`)

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/workbench.css";
import "./styles/controls.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
```

---

## Step 21 — App Shell (`src/App.tsx`)

Now imports `previewVoiceSpec` and enriches browser-side specs with Rust-side
arc properties when the session is loaded.

```tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { DebugConsole } from "./components/ui/DebugConsole";
import { WorkbenchShell } from "./components/workbench/WorkbenchShell";
import { SetupScreen } from "./components/workbench/SetupScreen";
import { deriveVoiceSpec } from "./lib/zerovoice-preview";
import type { Coords, VoiceSpec, Overrides, HistoryEntry, SynthesisState, PresetSlot, GenderFilter } from "./lib/types";
import { synthesizeNpcSpeech, buildSynthArgs, previewVoiceSpec } from "./lib/voice";
import { downloadWav } from "./lib/waveform";

const DEFAULT_COORDS: Coords  = { x: 0, y: 0, z: 0 };
const DEFAULT_OVERRIDES: Overrides = {
  t:      { locked: false, value: 0.5 },
  pitch:  { locked: false, value: 1.0 },
  energy: { locked: false, value: 1.0 },
  voiceA: { locked: false, value: 0   },
  voiceB: { locked: false, value: 1   },
};

function loadPresets(): PresetSlot[] {
  const slots: PresetSlot[] = [];
  for (let i = 0; i < 4; i++) {
    try {
      const raw = localStorage.getItem(`zv_preset_${i}`);
      slots.push(raw ? { coords: JSON.parse(raw) } : { coords: null });
    } catch { slots.push({ coords: null }); }
  }
  return slots;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [coords,         setCoords]        = useState<Coords>(DEFAULT_COORDS);
  const [spec,           setSpec]          = useState<VoiceSpec | null>(null);
  const [overrides,      setOverrides]     = useState<Overrides>(DEFAULT_OVERRIDES);
  const [useRegionBias,  setUseRegionBias] = useState(false);
  const [genderFilter,   setGenderFilter]  = useState<GenderFilter>("mixed");
  const [worldSeed,      setWorldSeed]     = useState<bigint>(0xDEADBEEFC0FFEn);
  const [text,           setText]          = useState("");
  const [synthState,     setSynthState]    = useState<SynthesisState>("idle");
  const [pcm,            setPcm]           = useState<Float32Array | null>(null);
  const [currentSample,  setCurrentSample] = useState(0);
  const [history,        setHistory]       = useState<HistoryEntry[]>([]);
  const [presets,        setPresets]       = useState<PresetSlot[]>(loadPresets);

  const audioCtxRef    = useRef<AudioContext | null>(null);
  const sourceRef      = useRef<AudioBufferSourceNode | null>(null);
  const rafRef         = useRef<number>(0);

  // Derive VoiceSpec whenever coords or worldSeed change, debounced 80ms
  // Browser-side hash gives instant voice A/B/t feedback, then Rust call enriches with arc properties
  useEffect(() => {
    const timer = setTimeout(() => {
      deriveVoiceSpec(coords.x, coords.y, coords.z, worldSeed).then(browserSpec => {
        setSpec(browserSpec);
        // If session is loaded, fetch real arc properties from Rust
        if (ready) {
          previewVoiceSpec(coords.x, coords.y, coords.z, useRegionBias, genderFilter)
            .then(rustSpec => setSpec(rustSpec))
            .catch(() => { /* session not ready yet — keep browser spec */ });
        }
      });
    }, 80);
    return () => clearTimeout(timer);
  }, [coords, worldSeed, ready, useRegionBias, genderFilter]);

  const stopPlayback = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setSynthState("idle");
    setCurrentSample(0);
  }, []);

  const handleSynthesise = useCallback(async () => {
    if (!spec || !text.trim()) return;
    setSynthState("synthesising");
    setPcm(null);
    setCurrentSample(0);

    try {
      const args = buildSynthArgs(
        coords.x, coords.y, coords.z,
        text, overrides, useRegionBias, genderFilter
      );
      const audio = await synthesizeNpcSpeech(args);
      setPcm(audio);
      setSynthState("playing");

      // Playback via Web Audio API
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const buffer = ctx.createBuffer(1, audio.length, 24000);
      buffer.getChannelData(0).set(audio);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      sourceRef.current = src;

      const startTime = ctx.currentTime;
      const tick = () => {
        const elapsed = ctx.currentTime - startTime;
        setCurrentSample(Math.min(Math.floor(elapsed * 24000), audio.length));
        if (elapsed < buffer.duration) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      src.onended = () => { setSynthState("idle"); setCurrentSample(0); };
      src.start();

      // Append to history
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        coords: { ...coords },
        spec: { ...spec },
        overrides: JSON.parse(JSON.stringify(overrides)),
        text,
        durationS: audio.length / 24000,
        timestamp: Date.now(),
      };
      setHistory(h => [entry, ...h].slice(0, 50));

    } catch (err) {
      console.error("Synthesis failed:", err);
      setSynthState("error");
    }
  }, [spec, text, coords, overrides, useRegionBias, genderFilter]);

  const savePreset = (idx: number) => {
    const updated = presets.map((p, i) => i === idx ? { coords: { ...coords } } : p);
    setPresets(updated);
    localStorage.setItem(`zv_preset_${idx}`, JSON.stringify({ ...coords }));
  };

  const loadPreset = (idx: number) => {
    const slot = presets[idx];
    if (slot.coords) setCoords({ ...slot.coords });
  };

  const clearPreset = (idx: number) => {
    const updated = presets.map((p, i) => i === idx ? { coords: null } : p);
    setPresets(updated);
    localStorage.removeItem(`zv_preset_${idx}`);
  };

  const restoreHistory = (entry: HistoryEntry) => {
    setCoords(entry.coords);
    setOverrides(entry.overrides);
    setText(entry.text);
  };

  const handleSetupReady = useCallback(() => setReady(true), []);

  if (!ready) {
    return <><SetupScreen onReady={handleSetupReady} /><DebugConsole /></>;
  }

  return (
    <>
    <WorkbenchShell
      coords={coords}           onCoordsChange={setCoords}
      spec={spec}
      overrides={overrides}     onOverridesChange={setOverrides}
      useRegionBias={useRegionBias} onRegionBiasChange={setUseRegionBias}
      genderFilter={genderFilter} onGenderFilterChange={setGenderFilter}
      worldSeed={worldSeed}     onWorldSeedChange={setWorldSeed}
      text={text}               onTextChange={setText}
      synthState={synthState}
      pcm={pcm}
      currentSample={currentSample}
      history={history}
      presets={presets}
      onSynthesise={handleSynthesise}
      onStop={stopPlayback}
      onExportWav={() => pcm && downloadWav(pcm)}
      onSavePreset={savePreset}
      onLoadPreset={loadPreset}
      onClearPreset={clearPreset}
      onRestoreHistory={restoreHistory}
      onClearHistory={() => setHistory([])}
    />
    <DebugConsole />
    </>
  );
}
```

---

## Step 22 — WorkbenchShell (`src/components/workbench/WorkbenchShell.tsx`)

Version label removed from header meta text.

```tsx
import type { Coords, VoiceSpec, Overrides, HistoryEntry, SynthesisState, PresetSlot, GenderFilter } from "../../lib/types";
import { CoordinatePanel } from "./CoordinatePanel";
import { VoiceSpecPanel } from "./VoiceSpecPanel";
import { SynthesisPanel } from "./SynthesisPanel";
import { HistoryBar } from "./HistoryBar";
import { StatusBar } from "../ui/StatusBar";

interface Props {
  coords:          Coords;
  onCoordsChange:  (c: Coords) => void;
  spec:            VoiceSpec | null;
  overrides:       Overrides;
  onOverridesChange: (o: Overrides) => void;
  useRegionBias:   boolean;
  onRegionBiasChange: (v: boolean) => void;
  genderFilter:    GenderFilter;
  onGenderFilterChange: (g: GenderFilter) => void;
  worldSeed:       bigint;
  onWorldSeedChange: (s: bigint) => void;
  text:            string;
  onTextChange:    (t: string) => void;
  synthState:      SynthesisState;
  pcm:             Float32Array | null;
  currentSample:   number;
  history:         HistoryEntry[];
  presets:         PresetSlot[];
  onSynthesise:    () => void;
  onStop:          () => void;
  onExportWav:     () => void;
  onSavePreset:    (idx: number) => void;
  onLoadPreset:    (idx: number) => void;
  onClearPreset:   (idx: number) => void;
  onRestoreHistory:(entry: HistoryEntry) => void;
  onClearHistory:  () => void;
}

export function WorkbenchShell(props: Props) {
  return (
    <div className="workbench">
      {/* Header */}
      <div className="workbench-header">
        <span className="app-title">ZER0VOICE WORKBENCH</span>
        <span className="app-meta">KokoroTTS ONNX int8 · 88 MB</span>
      </div>

      {/* Panel 1 — Coordinate Input */}
      <CoordinatePanel
        coords={props.coords}
        onCoordsChange={props.onCoordsChange}
        useRegionBias={props.useRegionBias}
        onRegionBiasChange={props.onRegionBiasChange}
        genderFilter={props.genderFilter}
        onGenderFilterChange={props.onGenderFilterChange}
        worldSeed={props.worldSeed}
        onWorldSeedChange={props.onWorldSeedChange}
        presets={props.presets}
        onSavePreset={props.onSavePreset}
        onLoadPreset={props.onLoadPreset}
        onClearPreset={props.onClearPreset}
      />

      {/* Panel 2 — Voice Spec */}
      <VoiceSpecPanel
        spec={props.spec}
        overrides={props.overrides}
        onOverridesChange={props.onOverridesChange}
      />

      {/* Panel 3 — Synthesis */}
      <SynthesisPanel
        spec={props.spec}
        text={props.text}
        onTextChange={props.onTextChange}
        synthState={props.synthState}
        pcm={props.pcm}
        currentSample={props.currentSample}
        onSynthesise={props.onSynthesise}
        onStop={props.onStop}
        onExportWav={props.onExportWav}
      />

      {/* History Bar */}
      <HistoryBar
        history={props.history}
        onRestore={props.onRestoreHistory}
        onClear={props.onClearHistory}
      />

      {/* Status Bar */}
      <StatusBar synthState={props.synthState} pcm={props.pcm} />
    </div>
  );
}
```

---

## Step 23 — CoordinatePanel (`src/components/workbench/CoordinatePanel.tsx`)

```tsx
import type { Coords, PresetSlot, GenderFilter } from "../../lib/types";
import { CoordInput } from "../controls/CoordInput";
import { RegionBiasMap } from "./RegionBiasMap";

interface Props {
  coords:          Coords;
  onCoordsChange:  (c: Coords) => void;
  useRegionBias:   boolean;
  onRegionBiasChange: (v: boolean) => void;
  genderFilter:    GenderFilter;
  onGenderFilterChange: (g: GenderFilter) => void;
  worldSeed:       bigint;
  onWorldSeedChange: (s: bigint) => void;
  presets:         PresetSlot[];
  onSavePreset:    (idx: number) => void;
  onLoadPreset:    (idx: number) => void;
  onClearPreset:   (idx: number) => void;
}

export function CoordinatePanel({
  coords, onCoordsChange, useRegionBias, onRegionBiasChange,
  genderFilter, onGenderFilterChange,
  worldSeed, onWorldSeedChange,
  presets, onSavePreset, onLoadPreset, onClearPreset,
}: Props) {
  const randomise = () => {
    const arr = new Int16Array(3);
    crypto.getRandomValues(arr);
    onCoordsChange({ x: arr[0], y: arr[1], z: arr[2] });
  };

  const copyHash = async () => {
    const { deriveVoiceSpec } = await import("../../lib/zerovoice-preview");
    const spec = await deriveVoiceSpec(coords.x, coords.y, coords.z);
    navigator.clipboard.writeText(spec.hashHex);
  };

  return (
    <div className="panel">
      <div className="panel-title">COORDINATE INPUT</div>

      <CoordInput axis="X" value={coords.x} onChange={x => onCoordsChange({ ...coords, x })} />
      <CoordInput axis="Y" value={coords.y} onChange={y => onCoordsChange({ ...coords, y })} />
      <CoordInput axis="Z" value={coords.z} onChange={z => onCoordsChange({ ...coords, z })} />

      <div style={{ display: "flex", gap: 6, marginTop: 8, marginBottom: 8 }}>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={randomise}>RANDOMISE</button>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={copyHash}>COPY HASH</button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
          World Seed
        </label>
        <input
          className="coord-input"
          type="text"
          defaultValue={`0x${worldSeed.toString(16).toUpperCase()}`}
          key={worldSeed.toString()}
          onBlur={e => {
            const raw = e.target.value.trim();
            try {
              const parsed = BigInt(raw.startsWith("0x") || raw.startsWith("0X") ? raw : `0x${raw}`);
              onWorldSeedChange(parsed);
            } catch { /* invalid hex — ignore */ }
          }}
          style={{ width: "100%", fontSize: 11, marginTop: 3 }}
        />
      </div>

      {/* Gender filter toggle */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)",
          letterSpacing: "0.1em", marginBottom: 4 }}>GENDER</div>
        <div style={{ display: "flex", gap: 0 }}>
          {(["mixed", "female", "male"] as const).map(g => (
            <button
              key={g}
              onClick={() => onGenderFilterChange(g)}
              style={{
                flex: 1,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                padding: "4px 0",
                cursor: "pointer",
                border: "1px solid",
                borderColor: genderFilter === g ? "var(--amber)" : "var(--border-mid)",
                background: genderFilter === g ? "var(--amber-glow)" : "var(--bg-control)",
                color: genderFilter === g ? "var(--amber)" : "var(--text-secondary)",
                borderRadius: 0,
                borderRight: g !== "male" ? "none" : undefined,
              }}
            >
              {g === "mixed" ? "MIX" : g === "female" ? "F" : "M"}
            </button>
          ))}
        </div>
      </div>

      <label className="lock-toggle" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={useRegionBias} onChange={e => onRegionBiasChange(e.target.checked)} />
        Region Bias
      </label>

      {useRegionBias && (
        <RegionBiasMap
          coords={coords}
          onCoordsChange={onCoordsChange}
        />
      )}

      <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
        {presets.map((slot, i) => (
          <button
            key={i}
            className={`preset-btn${slot.coords ? " filled" : ""}`}
            onClick={() => slot.coords ? onLoadPreset(i) : onSavePreset(i)}
            onContextMenu={e => { e.preventDefault(); onClearPreset(i); }}
            title={slot.coords
              ? `Load (${slot.coords.x},${slot.coords.y},${slot.coords.z}) — right-click to clear`
              : `Save current coords to P${i + 1}`}
          >
            P{i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

## Step 24 — VoiceSpecPanel (`src/components/workbench/VoiceSpecPanel.tsx`)

Now includes the ARC CHARACTER section displaying the four Zero-Quadratic
arc properties (curve warp, harmonic, spectral skew, kinship) as read-only values.

```tsx
import type { VoiceSpec, Overrides } from "../../lib/types";
import { VoiceSelector } from "../controls/VoiceSelector";
import { ParamSlider } from "../controls/ParamSlider";
import { HashDisplay } from "../controls/HashDisplay";
import { ArcVisualiser } from "../controls/ArcVisualiser";

interface Props {
  spec:             VoiceSpec | null;
  overrides:        Overrides;
  onOverridesChange:(o: Overrides) => void;
}

const DEFAULT_OVERRIDES: Overrides = {
  t:      { locked: false, value: 0.5 },
  pitch:  { locked: false, value: 1.0 },
  energy: { locked: false, value: 1.0 },
  voiceA: { locked: false, value: 0   },
  voiceB: { locked: false, value: 1   },
};

export function VoiceSpecPanel({ spec, overrides, onOverridesChange }: Props) {
  // Region bias toggle lives in CoordinatePanel per the plan spec
  if (!spec) return <div className="panel"><div className="panel-title">VOICE SPEC</div></div>;

  const anyLocked = overrides.t.locked || overrides.pitch.locked || overrides.energy.locked
    || overrides.voiceA.locked || overrides.voiceB.locked;

  const effectiveA = overrides.voiceA.locked ? overrides.voiceA.value : spec.voiceA;
  const effectiveB = overrides.voiceB.locked ? overrides.voiceB.value : spec.voiceB;
  const effectiveT = overrides.t.locked ? overrides.t.value : spec.t;
  const effectivePitch = overrides.pitch.locked ? overrides.pitch.value : spec.pitchScale;
  const effectiveEnergy = overrides.energy.locked ? overrides.energy.value : spec.energyScale;

  const update = (key: keyof Overrides, patch: Partial<Overrides[keyof Overrides]>) => {
    onOverridesChange({ ...overrides, [key]: { ...overrides[key], ...patch } });
  };

  return (
    <div className="panel">
      <div className="panel-title">
        VOICE SPEC {anyLocked && <span style={{ color: "var(--amber)", marginLeft: 8 }}>[OVERRIDE ACTIVE]</span>}
      </div>

      <VoiceSelector
        label="Voice A"
        value={effectiveA}
        locked={overrides.voiceA.locked}
        onLock={locked => update("voiceA", { locked, value: spec.voiceA })}
        onChange={value => update("voiceA", { value })}
      />

      <VoiceSelector
        label="Voice B"
        value={effectiveB}
        locked={overrides.voiceB.locked}
        onLock={locked => update("voiceB", { locked, value: spec.voiceB })}
        onChange={value => update("voiceB", { value })}
        excludeIdx={effectiveA}
      />

      <ArcVisualiser
        voiceAName={spec.voiceAName}
        voiceBName={spec.voiceBName}
        t={effectiveT}
        arcIndex={spec.arcIndex}
        onDragT={t => update("t", { locked: true, value: t })}
      />

      <ParamSlider
        label="Slerp t"
        value={effectiveT}
        min={0} max={1} step={0.0001} decimals={4}
        locked={overrides.t.locked}
        onLock={locked => update("t", { locked, value: spec.t })}
        onChange={value => update("t", { value })}
      />

      <ParamSlider
        label="Pitch"
        value={effectivePitch}
        min={0.85} max={1.15} step={0.001} decimals={3}
        locked={overrides.pitch.locked}
        onLock={locked => update("pitch", { locked, value: spec.pitchScale })}
        onChange={value => update("pitch", { value })}
      />

      <ParamSlider
        label="Energy"
        value={effectiveEnergy}
        min={0.80} max={1.20} step={0.001} decimals={3}
        locked={overrides.energy.locked}
        onLock={locked => update("energy", { locked, value: spec.energyScale })}
        onChange={value => update("energy", { value })}
      />

      <HashDisplay hashHex={spec.hashHex} />

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
        Arc <span style={{ color: "var(--text-primary)" }}>{spec.arcIndex} / 325</span>
      </div>

      {/* Zero-Quadratic arc properties — read-only */}
      <div style={{ fontFamily: "var(--font-ui)", fontSize: 9, fontWeight: 600,
        letterSpacing: "0.14em", color: "var(--text-secondary)",
        borderTop: "1px solid var(--border-dim)", paddingTop: 8, marginTop: 8, marginBottom: 6 }}>
        ARC CHARACTER
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 8 }}>
        <div>Curve Warp <span style={{ color: "var(--text-primary)", float: "right" }}>{spec.arcCurveWarp?.toFixed(3) ?? "—"}</span></div>
        <div>Harmonic <span style={{ color: "var(--text-primary)", float: "right" }}>{spec.arcHarmonicWeight?.toFixed(3) ?? "—"}</span></div>
        <div>Spectral Skew <span style={{ color: "var(--text-primary)", float: "right" }}>{spec.arcSpectralSkew != null ? `${spec.arcSpectralSkew >= 0 ? "+" : ""}${spec.arcSpectralSkew.toFixed(3)}` : "—"}</span></div>
        <div>Kinship <span style={{ color: (spec.arcKinship ?? 0) > 0.7 ? "var(--amber)" : "var(--text-primary)", float: "right" }}>{spec.arcKinship?.toFixed(3) ?? "—"}</span></div>
      </div>

      {anyLocked && (
        <button className="btn-secondary" style={{ width: "100%" }} onClick={() => onOverridesChange(DEFAULT_OVERRIDES)}>
          RESET OVERRIDES
        </button>
      )}
    </div>
  );
}
```

---

## Step 25 — SynthesisPanel (`src/components/workbench/SynthesisPanel.tsx`)

```tsx
import { useState, useEffect } from "react";
import type { VoiceSpec, SynthesisState } from "../../lib/types";
import { WaveformCanvas } from "../controls/WaveformCanvas";

interface Props {
  spec:          VoiceSpec | null;
  text:          string;
  onTextChange:  (t: string) => void;
  synthState:    SynthesisState;
  pcm:           Float32Array | null;
  currentSample: number;
  onSynthesise:  () => void;
  onStop:        () => void;
  onExportWav:   () => void;
}

const SPINNER_FRAMES = ["\u280B","\u2819","\u2839","\u2838","\u283C","\u2834","\u2826","\u2827","\u2807","\u280F"];

export function SynthesisPanel({
  spec, text, onTextChange, synthState, pcm, currentSample,
  onSynthesise, onStop, onExportWav,
}: Props) {
  const isSynthesising = synthState === "synthesising";
  const [spinnerIdx, setSpinnerIdx] = useState(0);

  useEffect(() => {
    if (!isSynthesising) return;
    const id = setInterval(() => {
      setSpinnerIdx(i => (i + 1) % SPINNER_FRAMES.length);
    }, 100);
    return () => clearInterval(id);
  }, [isSynthesising]);

  return (
    <div className="panel">
      <div className="panel-title">SYNTHESIS</div>

      <WaveformCanvas pcm={pcm} synthState={synthState} currentSample={currentSample} />

      <div style={{ position: "relative", marginTop: 8, marginBottom: 8 }}>
        <textarea
          className="synth-textarea"
          rows={3}
          maxLength={512}
          value={text}
          onChange={e => onTextChange(e.target.value)}
          placeholder="Enter NPC dialogue..."
          disabled={isSynthesising}
        />
        <span style={{
          position: "absolute", bottom: 4, right: 8,
          fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)",
        }}>
          {text.length} / 512
        </span>
      </div>

      <button
        className="btn-primary"
        disabled={isSynthesising || !text.trim() || !spec}
        onClick={onSynthesise}
        style={{ marginBottom: 6 }}
      >
        {isSynthesising ? `${SPINNER_FRAMES[spinnerIdx]} GENERATING...` : "\u25B6  SYNTHESISE"}
      </button>

      <button
        className="btn-secondary"
        style={{ width: "100%", marginBottom: 10 }}
        disabled={synthState !== "playing"}
        onClick={onStop}
      >
{"\u25A0"}  STOP
      </button>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
        <div>Duration: <span style={{ color: "var(--text-primary)" }}>{pcm ? (pcm.length / 24000).toFixed(2) : "0.00"} s</span></div>
        <div>Samples: <span style={{ color: "var(--text-primary)" }}>{pcm ? pcm.length.toLocaleString() : "0"}</span></div>
        <div>Rate: <span style={{ color: "var(--text-primary)" }}>24 kHz</span></div>
      </div>

      <button
        className="btn-secondary"
        style={{ width: "100%", marginTop: 10 }}
        disabled={!pcm}
        onClick={onExportWav}
      >
{"\u2193"} EXPORT WAV
      </button>
    </div>
  );
}
```

---

## Step 26 — HistoryBar (`src/components/workbench/HistoryBar.tsx`)

```tsx
import type { HistoryEntry } from "../../lib/types";
import { formatHistoryEntry, exportHistoryJson } from "../../lib/history";

interface Props {
  history:   HistoryEntry[];
  onRestore: (entry: HistoryEntry) => void;
  onClear:   () => void;
}

export function HistoryBar({ history, onRestore, onClear }: Props) {
  return (
    <div className="history-bar">
      <span className="history-label">HISTORY</span>
      {history.map((entry, i) => (
        <span
          key={entry.id}
          className={`history-entry${i === 0 ? " latest" : ""}`}
          onClick={() => onRestore(entry)}
          title={formatHistoryEntry(entry)}
        >
          {formatHistoryEntry(entry)}
        </span>
      ))}
      {history.length > 0 && (
        <>
          <button className="btn-secondary" style={{ padding: "1px 6px", fontSize: 9, flexShrink: 0 }} onClick={onClear}>
            Clear
          </button>
          <button className="btn-secondary" style={{ padding: "1px 6px", fontSize: 9, flexShrink: 0 }} onClick={() => exportHistoryJson(history)}>
            Export JSON
          </button>
        </>
      )}
    </div>
  );
}
```

---

## Step 27 — RegionBiasMap (`src/components/workbench/RegionBiasMap.tsx`)

```tsx
import { useRef, useEffect } from "react";
import type { Coords } from "../../lib/types";

interface Props {
  coords:         Coords;
  onCoordsChange: (c: Coords) => void;
}

export function RegionBiasMap({ coords, onCoordsChange }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;

    // Simple heatmap visualization of regional bias
    const imageData = ctx.createImageData(W, H);
    const freq = 0.005;

    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        // Map pixel to world coords centered on current position
        const wx = coords.x + (px - W / 2) * 2;
        const wz = coords.z + (py - H / 2) * 2;

        // Simple hash-based noise for visualization
        const x0 = Math.floor(wx * freq);
        const z0 = Math.floor(wz * freq);
        const noise = ((x0 * 2654435761 + z0 * 2246822519) >>> 0) / 0xFFFFFFFF;

        const r = noise < 0.33 ? 120 : noise < 0.66 ? 60 : 40;
        const g = noise < 0.33 ? 60 : noise < 0.66 ? 90 : 60;
        const b = noise < 0.33 ? 80 : noise < 0.66 ? 60 : 100;

        const i = (py * W + px) * 4;
        imageData.data[i] = r;
        imageData.data[i + 1] = g;
        imageData.data[i + 2] = b;
        imageData.data[i + 3] = 180;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Crosshair at center
    ctx.strokeStyle = "#e8a020";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 5, H / 2); ctx.lineTo(W / 2 + 5, H / 2);
    ctx.moveTo(W / 2, H / 2 - 5); ctx.lineTo(W / 2, H / 2 + 5);
    ctx.stroke();
  }, [coords]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const W = ref.current.width, H = ref.current.height;
    const x = Math.round(coords.x + (px - W / 2) * 2);
    const z = Math.round(coords.z + (py - H / 2) * 2);
    onCoordsChange({ ...coords, x, z });
  };

  return (
    <canvas
      ref={ref}
      width={180}
      height={100}
      style={{ width: "100%", height: 100, cursor: "crosshair",
        border: "1px solid var(--border-dim)", display: "block", marginBottom: 8 }}
      onClick={handleClick}
    />
  );
}
```

---

## Step 28 — SetupScreen (`src/components/workbench/SetupScreen.tsx`)

```tsx
import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface DownloadProgress {
  asset: string;
  bytes_downloaded: number;
  total_bytes: number;
  step: number;
  total_steps: number;
}

interface AssetStatus {
  model: boolean;
  voices: boolean;
  espeak: boolean;
  ort_dll: boolean;
  all_ready: boolean;
}

interface Props {
  onReady: () => void;
}

type Phase = "checking" | "downloading" | "initialising" | "error";

export function SetupScreen({ onReady }: Props) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AssetStatus | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Elapsed timer — ticks every second while downloading or initialising
  useEffect(() => {
    if (phase !== "downloading" && phase !== "initialising") return;
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        console.log("[SetupScreen] checking assets...");
        // 1. Check what's already on disk
        const st = await invoke<AssetStatus>("check_setup");
        console.log("[SetupScreen] asset status:", st);
        if (cancelled) return;
        setStatus(st);

        if (st.all_ready) {
          // Assets present — go straight to session init
          console.log("[SetupScreen] all assets present, initialising session...");
          setPhase("initialising");
          const t0 = performance.now();
          await invoke("init_session");
          console.log(`[SetupScreen] init_session completed in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
          if (!cancelled) onReady();
          return;
        }

        // 2. Download missing assets
        console.log("[SetupScreen] downloading missing assets...");
        setPhase("downloading");
        await invoke("run_setup");
        console.log("[SetupScreen] downloads complete");
        if (cancelled) return;

        // 3. Init ONNX session
        console.log("[SetupScreen] initialising ONNX session...");
        setPhase("initialising");
        const t0 = performance.now();
        await invoke("init_session");
        console.log(`[SetupScreen] init_session completed in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
        if (!cancelled) onReady();
      } catch (err) {
        console.error("[SetupScreen] error:", err);
        if (!cancelled) {
          setPhase("error");
          setError(String(err));
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [onReady]);

  // Listen for download progress events
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    console.log("[SetupScreen] registering download-progress listener");
    listen<DownloadProgress>("download-progress", (e) => {
      console.log("[SetupScreen] progress event:", e.payload.asset, e.payload.bytes_downloaded, "/", e.payload.total_bytes);
      setProgress(e.payload);
    }).then((fn) => {
      console.log("[SetupScreen] listener registered");
      cleanup = fn;
    }).catch((err) => {
      console.error("[SetupScreen] listen error:", err);
    });
    return () => { cleanup?.(); };
  }, []);

  const pct =
    progress && progress.total_bytes > 0
      ? Math.round((progress.bytes_downloaded / progress.total_bytes) * 100)
      : 0;

  const formatMB = (bytes: number) => (bytes / 1_048_576).toFixed(1);

  return (
    <div
      style={{
        height: "100vh",
        background: "var(--bg-void)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        color: "var(--text-primary)",
        gap: 20,
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "var(--amber)",
          letterSpacing: "0.12em",
        }}
      >
        ZER0VOICE WORKBENCH
      </span>

      {phase === "checking" && (
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Checking assets...
        </span>
      )}

      {phase === "downloading" && (
        <div style={{ width: 420, textAlign: "center" }}>
          {/* Asset name */}
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>
            {progress
              ? `Downloading ${progress.asset} (${progress.step}/${progress.total_steps})`
              : "Preparing downloads..."}
          </div>

          {/* Progress bar */}
          <div
            style={{
              width: "100%",
              height: 4,
              background: "var(--border-dim)",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: "var(--amber)",
                transition: "width 0.15s",
              }}
            />
          </div>

          {/* Bytes readout + elapsed timer */}
          <div style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
            <span>
              {progress
                ? `${formatMB(progress.bytes_downloaded)} / ${formatMB(progress.total_bytes)} MB`
                : "Connecting..."}
            </span>
            <span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
          </div>

          {/* Asset checklist */}
          {status && (
            <div
              style={{
                marginTop: 16,
                fontSize: 11,
                color: "var(--text-secondary)",
                textAlign: "left",
                display: "inline-block",
              }}
            >
              <AssetRow label="KokoroTTS ONNX Model" done={status.model} active={progress?.asset.includes("ONNX Model")} />
              <AssetRow label="Voice Style Vectors" done={status.voices} active={progress?.asset.includes("Voice Style")} />
              <AssetRow label="ONNX Runtime" done={status.ort_dll} active={progress?.asset.includes("ONNX Runtime")} />
              <AssetRow label="eSpeak-NG Phonemizer" done={status.espeak} active={progress?.asset.includes("eSpeak")} />
            </div>
          )}
        </div>
      )}

      {phase === "initialising" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Initialising ONNX session...
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
            {elapsed}s
          </div>
        </div>
      )}

      {phase === "error" && (
        <div style={{ textAlign: "center", maxWidth: 500 }}>
          <div style={{ fontSize: 12, color: "#c04040", marginBottom: 10 }}>
            Setup failed
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              background: "var(--bg-panel)",
              border: "1px solid var(--border-dim)",
              padding: 10,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {error}
          </div>
          <button
            className="btn-primary"
            style={{ marginTop: 16, width: "auto", padding: "8px 24px" }}
            onClick={() => window.location.reload()}
          >
            RETRY
          </button>
        </div>
      )}
    </div>
  );
}

function AssetRow({ label, done, active }: { label: string; done: boolean; active?: boolean }) {
  const color = done
    ? "var(--green-ready)"
    : active
      ? "var(--amber)"
      : "var(--text-secondary)";
  const icon = done ? "\u2713" : active ? "\u25B6" : "\u2022";

  return (
    <div style={{ color, marginBottom: 3 }}>
      <span style={{ width: 16, display: "inline-block" }}>{icon}</span>
      {label}
    </div>
  );
}
```

---

## Step 29 — CoordInput (`src/components/controls/CoordInput.tsx`)

```tsx
import { useRef, KeyboardEvent } from "react";

interface Props {
  axis:     "X" | "Y" | "Z";
  value:    number;
  onChange: (v: number) => void;
}

const clamp = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v)));

export function CoordInput({ axis, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const step = e.ctrlKey ? 100 : e.shiftKey ? 10 : 1;
    onChange(clamp(value + (e.key === "ArrowUp" ? step : -step)));
  };

  const onBlur = (s: string) => {
    const n = parseInt(s, 10);
    onChange(isNaN(n) ? 0 : clamp(n));
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", width: 10 }}>{axis}</span>
      <input
        ref={inputRef}
        className="coord-input"
        type="text"
        inputMode="numeric"
        defaultValue={value}
        key={value}
        onKeyDown={onKey}
        onBlur={e => onBlur(e.target.value)}
        onFocus={e => e.target.select()}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <button className="stepper-btn" onClick={() => onChange(clamp(value + 1))}>&#9650;</button>
        <button className="stepper-btn" onClick={() => onChange(clamp(value - 1))}>&#9660;</button>
      </div>
    </div>
  );
}
```

---

## Step 30 — ParamSlider (`src/components/controls/ParamSlider.tsx`)

```tsx
interface Props {
  label:    string;
  value:    number;
  min:      number;
  max:      number;
  step:     number;
  decimals?: number;
  locked:   boolean;
  onLock:   (locked: boolean) => void;
  onChange: (v: number) => void;
}

export function ParamSlider({ label, value, min, max, step, decimals = 3, locked, onLock, onChange }: Props) {
  const fillPct = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13,
            color: locked ? "var(--amber)" : "var(--text-primary)", minWidth: 54, textAlign: "right" }}>
            {value.toFixed(decimals)}
          </span>
          <label className={`lock-toggle${locked ? " active" : ""}`}>
            <input type="checkbox" checked={locked} onChange={e => onLock(e.target.checked)} />
            LOCK
          </label>
        </div>
      </div>
      <input type="range" className="param-slider"
        min={min} max={max} step={step} value={value}
        disabled={!locked}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ "--fill-pct": fillPct } as React.CSSProperties}
      />
    </div>
  );
}
```

---

## Step 31 — VoiceSelector (`src/components/controls/VoiceSelector.tsx`)

```tsx
import { KOKORO_VOICES, isFemale } from "../../lib/zerovoice-preview";

interface Props {
  label:      string;
  value:      number;
  locked:     boolean;
  onLock:     (locked: boolean) => void;
  onChange:   (idx: number) => void;
  excludeIdx?: number;
}

export function VoiceSelector({ label, value, locked, onLock, onChange, excludeIdx }: Props) {
  const name = KOKORO_VOICES[value];
  const female = isFemale(name);

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>{label}</span>
        <label className={`lock-toggle${locked ? " active" : ""}`}>
          <input type="checkbox" checked={locked} onChange={e => onLock(e.target.checked)} />
          LOCK
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`voice-badge ${female ? "female" : "male"}`}>
          {female ? "\u25CF" : "\u25CB"} {name}
        </span>
        {locked && (
          <select
            className="voice-selector"
            value={value}
            onChange={e => onChange(parseInt(e.target.value, 10))}
          >
            {KOKORO_VOICES.map((v, i) => (
              i !== excludeIdx && <option key={v} value={i}>{v}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
```

---

## Step 32 — WaveformCanvas (`src/components/controls/WaveformCanvas.tsx`)

```tsx
import { useRef, useEffect } from "react";
import type { SynthesisState } from "../../lib/types";

interface Props {
  pcm:           Float32Array | null;
  synthState:    SynthesisState;
  currentSample: number;
}

export function WaveformCanvas({ pcm, synthState, currentSample }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height, mid = H / 2;

    const draw = () => {
      ctx.fillStyle = "#0d0d0f";
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = "#1e1e24";
      ctx.lineWidth = 0.5;
      [0.25, 0.5, 0.75].forEach(r => {
        ctx.beginPath(); ctx.moveTo(0, H * r); ctx.lineTo(W, H * r); ctx.stroke();
      });

      if (synthState === "synthesising") {
        const bar = (Date.now() % 1400) / 1400 * W;
        ctx.strokeStyle = "#e8a02055";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(bar, 0); ctx.lineTo(bar, H); ctx.stroke();
        ctx.strokeStyle = "#e8a020";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(bar, mid); ctx.stroke();
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      if (!pcm || pcm.length === 0) {
        ctx.strokeStyle = "#2a6040";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
        return;
      }

      const spp = pcm.length / W;
      ctx.strokeStyle = "#e8a020";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let px = 0; px < W; px++) {
        const s = pcm[Math.floor(px * spp)] ?? 0;
        const y = mid - s * mid * 0.88;
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.stroke();

      if (synthState === "playing" && pcm.length > 0) {
        const px = (currentSample / pcm.length) * W;
        ctx.strokeStyle = "#ffffff44";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
      }
    };

    cancelAnimationFrame(rafRef.current);
    draw();

    return () => cancelAnimationFrame(rafRef.current);
  }, [pcm, synthState, currentSample]);

  return (
    <canvas ref={ref} width={460} height={80}
      style={{ width: "100%", height: 80, display: "block", imageRendering: "pixelated",
        border: "1px solid var(--border-dim)" }} />
  );
}
```

---

## Step 33 — HashDisplay (`src/components/controls/HashDisplay.tsx`)

```tsx
interface Props {
  hashHex: string;
}

export function HashDisplay({ hashHex }: Props) {
  const copy = () => {
    navigator.clipboard.writeText(hashHex);
  };

  return (
    <div className="hash-display" style={{ marginBottom: 6 }}>
      <span style={{ color: "var(--text-secondary)" }}>Hash</span>
      <span className="hash-value">{hashHex.slice(0, 12)}...</span>
      <button
        className="btn-secondary"
        style={{ padding: "1px 5px", fontSize: 9 }}
        onClick={copy}
        title="Copy full hash"
      >
        COPY
      </button>
    </div>
  );
}
```

---

## Step 34 — ArcVisualiser (`src/components/controls/ArcVisualiser.tsx`)

```tsx
import { useRef, useEffect } from "react";

interface Props {
  voiceAName: string;
  voiceBName: string;
  t:          number;
  arcIndex:   number;
  onDragT?:   (t: number) => void;
}

export function ArcVisualiser({ voiceAName, voiceBName, t, arcIndex, onDragT }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = "#0d0d0f";
    ctx.fillRect(0, 0, W, H);

    // Draw arc
    const cx = W / 2, cy = H - 4, rx = W / 2 - 30, ry = H - 10;
    ctx.strokeStyle = "#3a3a46";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0);
    ctx.stroke();

    // Dot at position t
    const angle = Math.PI - t * Math.PI;
    const dx = cx + rx * Math.cos(angle);
    const dy = cy - ry * Math.sin(angle);
    ctx.fillStyle = "#e8a020";
    ctx.beginPath();
    ctx.arc(dx, dy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Labels
    ctx.font = "8px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "#7a7870";
    ctx.textAlign = "left";
    ctx.fillText(voiceAName, 2, H - 2);
    ctx.textAlign = "right";
    ctx.fillText(voiceBName, W - 2, H - 2);

    // Arc index
    ctx.textAlign = "center";
    ctx.fillStyle = "#4a4a50";
    ctx.fillText(`${arcIndex} / 325`, cx, 10);
  }, [voiceAName, voiceBName, t, arcIndex]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onDragT || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newT = Math.max(0, Math.min(1, x / rect.width));
    onDragT(newT);
  };

  return (
    <canvas
      ref={ref}
      width={280}
      height={32}
      style={{ width: "100%", height: 32, cursor: onDragT ? "pointer" : "default",
        border: "1px solid var(--border-dim)", display: "block", marginBottom: 8 }}
      onClick={handleClick}
    />
  );
}
```

---

## Step 35 — SegmentNumber (`src/components/ui/SegmentNumber.tsx`)

```tsx
interface Props {
  value: string;
  color?: string;
  size?: number;
}

export function SegmentNumber({ value, color = "var(--amber)", size = 17 }: Props) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)",
      fontSize: size,
      fontWeight: 500,
      color,
      letterSpacing: "0.04em",
    }}>
      {value}
    </span>
  );
}
```

---

## Step 36 — StatusBar (`src/components/ui/StatusBar.tsx`)

```tsx
import type { SynthesisState } from "../../lib/types";

interface Props {
  synthState: SynthesisState;
  pcm:        Float32Array | null;
}

export function StatusBar({ synthState, pcm }: Props) {
  const stateLabel = {
    idle: "READY",
    synthesising: "SYNTHESISING...",
    playing: "PLAYING",
    error: "ERROR",
  }[synthState];

  const stateColor = {
    idle: "var(--green-ready)",
    synthesising: "var(--amber)",
    playing: "var(--amber)",
    error: "#8a2020",
  }[synthState];

  return (
    <div className="status-bar">
      <span style={{ color: stateColor, fontWeight: 500 }}>{stateLabel}</span>
      {pcm && (
        <span>
          {pcm.length.toLocaleString()} samples · {(pcm.length / 24000).toFixed(2)}s · 24 kHz mono
        </span>
      )}
    </div>
  );
}
```

---

## Step 37 — DebugConsole (`src/components/ui/DebugConsole.tsx`)

```tsx
import { useState, useEffect, useRef, useCallback } from "react";

interface LogEntry {
  ts: number;
  level: "log" | "warn" | "error" | "info";
  msg: string;
}

const MAX_ENTRIES = 500;
let _entries: LogEntry[] = [];
let _listeners: Set<() => void> = new Set();

function pushEntry(level: LogEntry["level"], args: unknown[]) {
  const msg = args.map(a => {
    if (typeof a === "string") return a;
    try { return JSON.stringify(a, null, 2); } catch { return String(a); }
  }).join(" ");
  _entries.push({ ts: Date.now(), level, msg });
  if (_entries.length > MAX_ENTRIES) _entries = _entries.slice(-MAX_ENTRIES);
  _listeners.forEach(fn => fn());
}

// Monkey-patch console once on import
const _origLog = console.log;
const _origWarn = console.warn;
const _origError = console.error;
const _origInfo = console.info;
console.log   = (...args) => { _origLog(...args);   pushEntry("log", args); };
console.warn  = (...args) => { _origWarn(...args);  pushEntry("warn", args); };
console.error = (...args) => { _origError(...args); pushEntry("error", args); };
console.info  = (...args) => { _origInfo(...args);  pushEntry("info", args); };

// Also capture unhandled errors
window.addEventListener("error", (e) => pushEntry("error", [`[unhandled] ${e.message} at ${e.filename}:${e.lineno}`]));
window.addEventListener("unhandledrejection", (e) => pushEntry("error", [`[unhandled promise] ${e.reason}`]));

export function DebugConsole() {
  const [visible, setVisible] = useState(false);
  const [, setTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Subscribe to new log entries
  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  // Toggle with Ctrl+F9
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F9" && e.ctrlKey) {
        e.preventDefault();
        setVisible(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (visible) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible, _entries.length]);

  const copyAll = useCallback(() => {
    const text = _entries.map(e => {
      const t = new Date(e.ts).toISOString().slice(11, 23);
      return `[${t}] [${e.level.toUpperCase()}] ${e.msg}`;
    }).join("\n");
    navigator.clipboard.writeText(text);
  }, []);

  if (!visible) return null;

  const levelColor: Record<string, string> = {
    log: "var(--text-secondary)",
    info: "var(--text-slate)",
    warn: "#c8a020",
    error: "#c04040",
  };

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      height: 220, zIndex: 10000,
      background: "#0a0a0c", borderTop: "1px solid var(--amber-dim)",
      display: "flex", flexDirection: "column",
      fontFamily: "var(--font-mono)", fontSize: 11,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "3px 10px", background: "#111114", borderBottom: "1px solid #2a2a32",
        flexShrink: 0,
      }}>
        <span style={{ color: "var(--amber)", fontSize: 9, letterSpacing: "0.12em" }}>
          DEBUG CONSOLE (Ctrl+F9)
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={copyAll} style={{
            fontFamily: "var(--font-mono)", fontSize: 9, background: "transparent",
            color: "var(--text-secondary)", border: "1px solid var(--border-mid)",
            padding: "1px 8px", cursor: "pointer",
          }}>COPY ALL</button>
          <button onClick={() => { _entries = []; setTick(t => t + 1); }} style={{
            fontFamily: "var(--font-mono)", fontSize: 9, background: "transparent",
            color: "var(--text-secondary)", border: "1px solid var(--border-mid)",
            padding: "1px 8px", cursor: "pointer",
          }}>CLEAR</button>
          <button onClick={() => setVisible(false)} style={{
            fontFamily: "var(--font-mono)", fontSize: 9, background: "transparent",
            color: "var(--text-secondary)", border: "1px solid var(--border-mid)",
            padding: "1px 8px", cursor: "pointer",
          }}>CLOSE</button>
        </div>
      </div>

      {/* Log entries */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 10px" }}>
        {_entries.map((e, i) => (
          <div key={i} style={{ color: levelColor[e.level] ?? "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
            <span style={{ color: "#4a4a50" }}>{new Date(e.ts).toISOString().slice(11, 23)}</span>
            {" "}
            {e.msg}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

---

## Step 38 — Custom Hooks

### `src/hooks/useVoiceSpec.ts`

```ts
import { useState, useEffect } from "react";
import { deriveVoiceSpec } from "../lib/zerovoice-preview";
import type { Coords, VoiceSpec } from "../lib/types";

export function useVoiceSpec(coords: Coords) {
  const [spec, setSpec] = useState<VoiceSpec | null>(null);

  useEffect(() => {
    let cancelled = false;
    deriveVoiceSpec(coords.x, coords.y, coords.z).then(s => {
      if (!cancelled) setSpec(s);
    });
    return () => { cancelled = true; };
  }, [coords.x, coords.y, coords.z]);

  return spec;
}
```

### `src/hooks/useSynthesis.ts`

```ts
import { useState, useCallback, useRef } from "react";
import type { SynthesisState } from "../lib/types";

export function useSynthesis() {
  const [synthState, setSynthState] = useState<SynthesisState>("idle");
  const [pcm, setPcm] = useState<Float32Array | null>(null);
  const [currentSample, setCurrentSample] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number>(0);

  const playPcm = useCallback((audio: Float32Array) => {
    setPcm(audio);
    setSynthState("playing");

    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    const buffer = ctx.createBuffer(1, audio.length, 24000);
    buffer.getChannelData(0).set(audio);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    sourceRef.current = src;

    const startTime = ctx.currentTime;
    const tick = () => {
      const elapsed = ctx.currentTime - startTime;
      setCurrentSample(Math.min(Math.floor(elapsed * 24000), audio.length));
      if (elapsed < buffer.duration) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    src.onended = () => { setSynthState("idle"); setCurrentSample(0); };
    src.start();
  }, []);

  const stop = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setSynthState("idle");
    setCurrentSample(0);
  }, []);

  return {
    synthState, setSynthState,
    pcm, setPcm,
    currentSample, setCurrentSample,
    playPcm, stop,
  };
}
```

### `src/hooks/useRegionBias.ts`

```ts
import { useState, useCallback } from "react";

export function useRegionBias() {
  const [enabled, setEnabled] = useState(false);

  const toggle = useCallback(() => {
    setEnabled(prev => !prev);
  }, []);

  return { enabled, setEnabled, toggle };
}
```

---

## Step 39 — Web Worker (`src/workers/regionBias.worker.ts`)

```ts
// Region Bias Map Web Worker
// Offloads the 2D heatmap computation to avoid blocking the UI thread.

interface RegionBiasRequest {
  centerX: number;
  centerZ: number;
  width: number;
  height: number;
  scale: number;
}

function smoothStep(t: number): number {
  return t * t * (3.0 - 2.0 * t);
}

function hashToFloat(x0: number, z0: number): number {
  // Simple integer hash for visualization — matches Rust regional_voice_bias concept
  const h = ((x0 * 2654435761 + z0 * 2246822519) >>> 0);
  return h / 0xFFFFFFFF;
}

function regionalBias(wx: number, wz: number): number {
  const freq = 0.005;
  const x0 = Math.floor(wx * freq);
  const z0 = Math.floor(wz * freq);
  const sxF = smoothStep((wx * freq) % 1);
  const szF = smoothStep((wz * freq) % 1);

  const n00 = hashToFloat(x0, z0);
  const n10 = hashToFloat(x0 + 1, z0);
  const n01 = hashToFloat(x0, z0 + 1);
  const n11 = hashToFloat(x0 + 1, z0 + 1);

  const nx0 = n00 + (n10 - n00) * sxF;
  const nx1 = n01 + (n11 - n01) * sxF;
  return nx0 + (nx1 - nx0) * szF;
}

self.onmessage = (e: MessageEvent<RegionBiasRequest>) => {
  const { centerX, centerZ, width, height, scale } = e.data;
  const buffer = new Uint8ClampedArray(width * height * 4);

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const wx = centerX + (px - width / 2) * scale;
      const wz = centerZ + (py - height / 2) * scale;
      const bias = regionalBias(wx, wz);

      // Color by bias region
      let r: number, g: number, b: number;
      if (bias < 0.33) {
        r = 120; g = 60; b = 80; // American female
      } else if (bias < 0.66) {
        r = 60; g = 90; b = 60; // American male
      } else {
        r = 40; g = 60; b = 100; // British
      }

      const i = (py * width + px) * 4;
      buffer[i] = r;
      buffer[i + 1] = g;
      buffer[i + 2] = b;
      buffer[i + 3] = 180;
    }
  }

  (self as unknown as Worker).postMessage({ buffer, width, height }, { transfer: [buffer.buffer] });
};
```

---

## Step 40 — Generate Icons

Create a Node.js script at `scripts/generate-icons.js` that produces multi-resolution icons for the Tauri application:

```js
// scripts/generate-icons.js
// Run: node scripts/generate-icons.js
// Requires: npm install sharp png-to-ico --save-dev
//
// Generates:
//   src-tauri/icons/icon.ico          (multi-res 256/48/32/16)
//   src-tauri/icons/32x32.png
//   src-tauri/icons/128x128.png
//   src-tauri/icons/128x128@2x.png   (256x256)
//   src-tauri/icons/icon.png          (512x512)

const sharp = require("sharp");
const pngToIco = require("png-to-ico");
const fs = require("fs");
const path = require("path");

const ICON_DIR = path.join(__dirname, "..", "src-tauri", "icons");

async function generateSvg(size) {
  // Programmatic amber "Z0" icon on dark background
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#0d0d0f" rx="${Math.round(size * 0.1)}"/>
      <text x="50%" y="54%" dominant-baseline="central" text-anchor="middle"
            font-family="monospace" font-weight="bold" font-size="${Math.round(size * 0.48)}"
            fill="#e8a020">Z0</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  fs.mkdirSync(ICON_DIR, { recursive: true });

  const sizes = [16, 32, 48, 128, 256, 512];
  const buffers = {};

  for (const s of sizes) {
    buffers[s] = await generateSvg(s);
  }

  // Write PNGs
  fs.writeFileSync(path.join(ICON_DIR, "32x32.png"),      buffers[32]);
  fs.writeFileSync(path.join(ICON_DIR, "128x128.png"),     buffers[128]);
  fs.writeFileSync(path.join(ICON_DIR, "128x128@2x.png"),  buffers[256]);
  fs.writeFileSync(path.join(ICON_DIR, "icon.png"),         buffers[512]);

  // Write ICO (multi-resolution)
  const icoSizes = [256, 48, 32, 16];
  const icoPngs = icoSizes.map(s => buffers[s]);
  const ico = await pngToIco(icoPngs);
  fs.writeFileSync(path.join(ICON_DIR, "icon.ico"), ico);

  console.log("Icons generated in", ICON_DIR);
}

main().catch(console.error);
```

---

## Step 41 — Install, Build and Run

### Development

```bash
npm install
npx tauri dev
```

This launches the Rust backend and Vite dev server together. On first run the SetupScreen will download model assets (~88 MB total). Version 0.8.0 includes Zero-Quadratic arc property computation during session initialisation.

### Production Build

```bash
npx tauri build
```

Produces both MSI and NSIS installers in `src-tauri/target/release/bundle/`.

---

## First Run Behavior

When ZeroVoice Workbench launches for the first time, the `SetupScreen` component takes over the entire window and orchestrates a multi-step asset download:

1. **Asset Check** -- The frontend invokes `check_setup` via Tauri IPC. The Rust backend scans `%APPDATA%/dev.zerovoice.workbench/models/` for the required files and returns an `AssetStatus` struct indicating which are present.

2. **Download Phase** -- If any assets are missing, the frontend invokes `run_setup`. The backend downloads each missing file from Hugging Face, streaming progress events (`download-progress`) back to the frontend via Tauri's event system. The SetupScreen displays a progress bar, byte counter, elapsed timer, and a checklist of assets:
   - KokoroTTS ONNX Model (int8-quantised, ~73 MB)
   - Voice Style Vectors (~1 MB)
   - ONNX Runtime DLL (~15 MB)
   - eSpeak-NG Phonemizer data (~3 MB)

3. **Session Initialisation** -- Once all assets are on disk, the frontend invokes `init_session`. The Rust backend loads the ONNX model into an `ort::Session`, loads the voice table, and precomputes the 26x26 Zero-Quadratic arc property table. This typically takes 2-4 seconds on a modern CPU.

4. **Workbench Ready** -- The `onReady` callback fires, `App` sets `ready = true`, and the full workbench UI appears. Arc properties are immediately available for preview display and synthesis.

All downloads are resumable. If the user closes the app mid-download the next launch will detect the incomplete file and re-download only what is needed.

---

## ZeroBytes Laws Compliance

| Law | Description | How ZeroVoice Complies |
|-----|-------------|----------------------|
| Law 1 | Deterministic voice from coordinates | xxHash64 with world seed produces identical VoiceSpec for identical (x,y,z) inputs |
| Law 2 | 26-voice palette, dual-voice blend | All 26 Kokoro voices indexed; every NPC blends exactly two via lerp |
| Law 3 | Continuous parameter space | Pitch (0.85-1.15), energy (0.80-1.20), slerp t (0.0-1.0) are all continuous |
| Law 4 | World seed support | `WORLD_SEED` constant XOR'd into every hash; UI allows editing |
| Law 5 | Gender filtering | `GenderFilter` type ("mixed"/"male"/"female") filters voice pool before selection |
| Law 6 | Regional bias | Optional `use_region_bias` flag activates coordinate-based accent clustering |
| Law 7 | Override capability | Every derived parameter can be locked and manually set via the Overrides system |
| Law 8 | Reproducibility | Same coordinates + same world seed + same overrides = bit-identical audio output |

---

## Zero-Quadratic Laws Compliance

| Law | Description | How ZeroVoice Complies |
|-----|-------------|----------------------|
| QLaw 1 | Per-arc deterministic properties | `pair_hash(a, b, salt)` with WORLD_SEED produces identical arc properties for identical voice pairs |
| QLaw 2 | Symmetry | `pair_hash` sorts indices before hashing — `arc(A,B) == arc(B,A)` guaranteed |
| Qlaw 3 | Curve warp modulates blend path | `resolve_style_quadratic` applies power-curve warp to t before lerp |
| QLaw 4 | Harmonic blend enriches timbre | Mean-blend toward (A+B)/2 weighted by `harmonic_weight` adds tonal richness |
| QLaw 5 | Spectral skew introduces asymmetry | Additive skew on warped t tilts the blend even at t=0.5 |
| QLaw 6 | Kinship from geometry | Cosine similarity of row-0 style vectors, not hashed — reflects actual voice similarity |
| QLaw 7 | Precomputed at startup | `build_arc_table` runs once during `KokoroSession::new`, < 100 us cost |
| QLaw 8 | No per-NPC state | Arc properties depend only on the voice pair, not on spawn coordinates |

---

## Known Working Versions

| Dependency | Version | Notes |
|-----------|---------|-------|
| ZeroVoice Workbench | 0.8.0 | With Zero-Quadratic arc properties |
| ort (ONNX Runtime Rust) | 2.0.0-rc.12 | Must use `download-binaries` feature for first-run DLL fetch |
| Tauri | 2.10.x | Tauri v2 with IPC v2 protocol |
| React | 18.x | Concurrent mode compatible |
| Vite | 6.x | With `@vitejs/plugin-react` |
| xxhash-wasm | 1.1.x | Default import (`createXXHash64`) for browser-side hashing |
| TypeScript | 5.x | Strict mode enabled |
| Node.js | 20+ | Required for build tooling |
| Rust | 1.82+ | Edition 2021 |

---

--- END OF DOCUMENT ---
