# ZeroResponse NPC Speech System — Adaptation Plan

A headless, deterministic NPC speech generation system adapted from the ZeroResponse engine for embedding into a React-based dungeon game. Creature-class profiles (Beast, Boss, Demon, Elemental, Ghost, Goblin, Skeleton) drive procedural dialogue using enemy grid position `(x, y)` as the generation seed. Zero storage, zero network, zero randomness at runtime — same position and encounter index always produce the same line of dialogue.

---

## Description

The existing ZeroResponse application (`response-gen-dev`) is a standalone React SPA that generates deterministic text from JSON profiles using the ZeroBytes xxhash32 position-is-seed engine. It includes UI components (dropdown, typewriter animation, seed input, generate button) that are not needed in the target game context.

This plan extracts the **engine core** (`src/engine/zerobytes.ts`), the **type system** (`src/types/profile.ts`), and the **seven Dungeon-Speech JSON profiles** (`zerogen/Dungeon-Speech-*.json`) into a self-contained, importable module. The game calls one function — `generateSpeech(x, y, creatureClass, encounterIndex)` — and receives a fully-formed line of NPC dialogue. No React dependency. No DOM. No UI.

### What Gets Extracted (Keep)

| Source File | Purpose | Adaptation |
|---|---|---|
| `src/engine/zerobytes.ts` | xxhash32 + `generateResponse` + `calculateCombinations` | Copied verbatim — zero changes to hash logic |
| `src/types/profile.ts` | `ResponseProfile` interface | Extended with `CreatureClass` enum |
| `zerogen/Dungeon-Speech-Beast.json` | Beast profile (10 templates, 24 pools) | Imported as static JSON |
| `zerogen/Dungeon-Speech-Boss.json` | Boss profile (13 templates, 31 pools) | Imported as static JSON |
| `zerogen/Dungeon-Speech-Demon.json` | Demon profile (10 templates, 20 pools) | Imported as static JSON |
| `zerogen/Dungeon-Speech-Elemental.json` | Elemental profile (10 templates, 29 pools) | Imported as static JSON |
| `zerogen/Dungeon-Speech-Ghost.json` | Ghost profile (10 templates, 22 pools) | Imported as static JSON |
| `zerogen/Dungeon-Speech-Goblin.json` | Goblin profile (10 templates, 20 pools) | Imported as static JSON |
| `zerogen/Dungeon-Speech-Skeleton.json` | Skeleton profile (10 templates, 20 pools) | Imported as static JSON |

### What Gets Dropped (Remove)

| Source File | Reason |
|---|---|
| `src/App.tsx` | UI shell — replaced by API function |
| `src/main.tsx` | React mount — not needed |
| `src/components/*` | All 5 UI components — not needed |
| `src/hooks/useTypewriter.ts` | Animation hook — not needed |
| `src/profiles/index.ts` | UI-oriented profile registry — replaced by `CreatureClass` map |
| `src/App.css`, `src/index.css` | Styles — not needed |
| `zerogen/pm_response_profile.json` | Political speech — not a dungeon creature |
| `index.html` | SPA shell — not needed |
| `vite.config.ts` | Build config — target game has its own |

---

## Functionality

### Core Feature: `generateSpeech(x, y, creatureClass, encounterIndex)`

The single public API. Given an enemy's grid coordinates, creature class, and encounter index, returns a deterministic line of dialogue.

**Behaviour:**

1. The enemy position `(x, y)` is combined into a single 32-bit seed using xxhash32: `seed = xxhash32([x, y], 0)`. This means an enemy at position `(10, 25)` always produces the same speech universe — every time the game loads, every time the player revisits that tile.

2. The `creatureClass` string (e.g. `"ghost"`, `"beast"`) selects the corresponding `Dungeon-Speech-*.json` profile from the registry map.

3. The `encounterIndex` (starting at 0) determines which line of dialogue is generated. The first encounter at this position produces line 0, the second produces line 1, etc. This allows NPCs to say different things on repeated interactions while remaining deterministic.

4. The engine calls `generateResponse(seed, encounterIndex, profile)` from the existing zerobytes engine, which:
   - Hashes `(seed, encounterIndex, 0)` to select a template from the profile's template array
   - Hashes `(seed, encounterIndex, poolIndex + 1)` for each vocabulary pool to select a word/phrase
   - Fills all `{placeholder}` tokens in the template with selected vocabulary
   - Returns the completed speech string

5. The output is a single string ready for display in a speech bubble, dialogue box, or floating text.

**Example calls and deterministic outputs:**

```typescript
// A ghost at position (10, 25), first encounter
generateSpeech(10, 25, "ghost", 0)
// → "You remind me of someone who came before. That changes how this goes."

// Same ghost, same position, second encounter
generateSpeech(10, 25, "ghost", 1)
// → "I died in this corridor. I have been here ever since. Please understand — I have had centuries but I cannot recall why."

// Same ghost, same position, first encounter AGAIN (deterministic — same output)
generateSpeech(10, 25, "ghost", 0)
// → "You remind me of someone who came before. That changes how this goes."

// A goblin at position (10, 25), first encounter (different class = different profile = different output)
generateSpeech(10, 25, "goblin", 0)
// → "Ha! Fresh one! You look confused. Good. Confused ones drop more things."

// A beast at position (44, 12)
generateSpeech(44, 12, "beast", 0)
// → "Warm. You are warm. I can smell it from here."
```

### Feature: Creature Class Registry

A `Map<CreatureClass, ResponseProfile>` that maps the seven creature class identifiers to their loaded JSON profiles. Constructed once at module load from static imports.

**Supported creature classes:**

| CreatureClass | JSON Source | Template Count | Pool Count | Tone |
|---|---|---|---|---|
| `"beast"` | `Dungeon-Speech-Beast.json` | 10 | 24 | Primal, predatory, hunting-focused |
| `"boss"` | `Dungeon-Speech-Boss.json` | 13 | 31 | Commanding, philosophical, patient |
| `"demon"` | `Dungeon-Speech-Demon.json` | 10 | 20 | Imperious, ancient, contemptuous |
| `"elemental"` | `Dungeon-Speech-Elemental.json` | 10 | 29 | Impersonal, absolute, force-of-nature |
| `"ghost"` | `Dungeon-Speech-Ghost.json` | 10 | 22 | Mournful, fractured, intimate |
| `"goblin"` | `Dungeon-Speech-Goblin.json` | 10 | 20 | Erratic, gleeful, crude |
| `"skeleton"` | `Dungeon-Speech-Skeleton.json` | 10 | 20 | Hollow, duty-bound, ancient |

### Feature: Seed Derivation from Position

The position-to-seed conversion is the critical bridge between the game world and the speech engine. The function `positionToSeed(x: number, y: number): number` hashes the coordinate pair into a 32-bit unsigned integer using xxhash32.

**Properties:**
- Deterministic: same `(x, y)` always produces the same seed
- Uniform distribution: nearby positions produce completely unrelated seeds (no spatial correlation)
- Fast: single xxhash32 call, no allocation beyond an 8-byte buffer
- 32-bit: full 4,294,967,296 seed space

**Why not just `x * width + y`?** Linear mapping creates sequential seeds for adjacent tiles, which causes adjacent NPCs to share near-identical template/pool selections. Hashing eliminates spatial correlation — two goblins one tile apart say completely different things.

### Feature: Combination Count Query

`getSpeechCombinations(creatureClass: CreatureClass): number` returns the total number of unique speech outputs for a given creature class. Useful for debug UI or game design validation.

**Example values:**
- Beast: `templates(10) * pool1(n) * pool2(n) * ...` = billions of unique combinations
- Boss: Even higher due to 13 templates and 31 pools

---

## Technical Implementation

### Target Architecture

```
game-project/
├── src/
│   ├── speech/                          ← NEW MODULE (self-contained)
│   │   ├── index.ts                     ← Public API: generateSpeech, getSpeechCombinations
│   │   ├── engine.ts                    ← xxhash32 + generateResponse (from zerobytes.ts)
│   │   ├── types.ts                     ← ResponseProfile, CreatureClass
│   │   ├── registry.ts                  ← CreatureClass → profile map
│   │   └── profiles/                    ← JSON profile data
│   │       ├── Dungeon-Speech-Beast.json
│   │       ├── Dungeon-Speech-Boss.json
│   │       ├── Dungeon-Speech-Demon.json
│   │       ├── Dungeon-Speech-Elemental.json
│   │       ├── Dungeon-Speech-Ghost.json
│   │       ├── Dungeon-Speech-Goblin.json
│   │       └── Dungeon-Speech-Skeleton.json
│   └── ... (rest of game)
```

### File: `src/speech/types.ts`

Defines the type system for the speech module.

```typescript
/**
 * ZeroResponse Speech System — Type Definitions
 */

export type CreatureClass =
  | "beast"
  | "boss"
  | "demon"
  | "elemental"
  | "ghost"
  | "goblin"
  | "skeleton";

export interface ResponseProfile {
  name: string;
  description: string;
  version: string;
  templates: string[];
  pools: Record<string, string[]>;
}
```

### File: `src/speech/engine.ts`

The xxhash32 engine copied verbatim from `response-gen-dev/src/engine/zerobytes.ts`. No modifications to the hash algorithm. This is the proven, working engine — do not alter.

```typescript
/**
 * ZeroBytes Engine — Position-is-Seed Procedural Generation
 * Adapted from ZeroEditInputGenerator.jsx for response generation.
 * Same (seed, index, profile) → same response, always, everywhere.
 */

const PRIME32_1 = 0x9E3779B1;
const PRIME32_2 = 0x85EBCA77;
const PRIME32_3 = 0xC2B2AE3D;
const PRIME32_4 = 0x27D4EB2F;
const PRIME32_5 = 0x165667B1;

function rotl32(x: number, r: number): number {
  return ((x << r) | (x >>> (32 - r))) >>> 0;
}

export function xxhash32(data: number[] | string | Uint8Array, seed: number = 0): number {
  let buffer: Uint8Array;
  if (Array.isArray(data)) {
    buffer = new Uint8Array(data.length * 4);
    const view = new DataView(buffer.buffer);
    data.forEach((val, i) => view.setInt32(i * 4, val, true));
  } else if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data);
  } else {
    buffer = new Uint8Array(data);
  }

  const len = buffer.length;
  let h32: number;
  let index = 0;

  if (len >= 16) {
    let v1 = (seed + PRIME32_1 + PRIME32_2) >>> 0;
    let v2 = (seed + PRIME32_2) >>> 0;
    let v3 = seed >>> 0;
    let v4 = (seed - PRIME32_1) >>> 0;

    const limit = len - 16;
    while (index <= limit) {
      const view = new DataView(buffer.buffer, buffer.byteOffset + index, 16);
      v1 = Math.imul(rotl32((v1 + Math.imul(view.getUint32(0, true), PRIME32_2)) >>> 0, 13), PRIME32_1) >>> 0;
      v2 = Math.imul(rotl32((v2 + Math.imul(view.getUint32(4, true), PRIME32_2)) >>> 0, 13), PRIME32_1) >>> 0;
      v3 = Math.imul(rotl32((v3 + Math.imul(view.getUint32(8, true), PRIME32_2)) >>> 0, 13), PRIME32_1) >>> 0;
      v4 = Math.imul(rotl32((v4 + Math.imul(view.getUint32(12, true), PRIME32_2)) >>> 0, 13), PRIME32_1) >>> 0;
      index += 16;
    }
    h32 = (rotl32(v1, 1) + rotl32(v2, 7) + rotl32(v3, 12) + rotl32(v4, 18)) >>> 0;
  } else {
    h32 = (seed + PRIME32_5) >>> 0;
  }

  h32 = (h32 + len) >>> 0;

  while (index <= len - 4) {
    const view = new DataView(buffer.buffer, buffer.byteOffset + index, 4);
    h32 = Math.imul(rotl32((h32 + Math.imul(view.getUint32(0, true), PRIME32_3)) >>> 0, 17), PRIME32_4) >>> 0;
    index += 4;
  }

  while (index < len) {
    h32 = Math.imul(rotl32((h32 + Math.imul(buffer[index], PRIME32_5)) >>> 0, 11), PRIME32_1) >>> 0;
    index++;
  }

  h32 ^= h32 >>> 15;
  h32 = Math.imul(h32, PRIME32_2) >>> 0;
  h32 ^= h32 >>> 13;
  h32 = Math.imul(h32, PRIME32_3) >>> 0;
  h32 ^= h32 >>> 16;

  return h32 >>> 0;
}

function editHash(seed: number, ...coords: number[]): number {
  return xxhash32(coords, seed & 0xFFFFFFFF);
}

function hashToIndex(h: number, poolSize: number): number {
  return h % poolSize;
}

export function generateResponse(
  seed: number,
  promptIdx: number,
  profile: { templates: string[]; pools: Record<string, string[]> }
): string {
  const { templates, pools } = profile;

  const templateHash = editHash(seed, promptIdx, 0);
  const template = templates[hashToIndex(templateHash, templates.length)];

  const components: Record<string, string> = {};
  Object.entries(pools).forEach(([key, pool], i) => {
    const componentHash = editHash(seed, promptIdx, i + 1);
    components[key] = pool[hashToIndex(componentHash, pool.length)];
  });

  let result = template;
  Object.entries(components).forEach(([key, value]) => {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  });

  return result;
}

export function calculateCombinations(profile: { templates: string[]; pools: Record<string, string[]> }): number {
  let total = profile.templates.length;
  Object.values(profile.pools).forEach(pool => {
    total *= pool.length;
  });
  return total;
}
```

### File: `src/speech/registry.ts`

Maps `CreatureClass` strings to their loaded JSON profiles. Static imports ensure the JSON is bundled at build time (tree-shaken by Vite/webpack).

```typescript
import type { CreatureClass, ResponseProfile } from "./types";

import dungeonBeast from "./profiles/Dungeon-Speech-Beast.json";
import dungeonBoss from "./profiles/Dungeon-Speech-Boss.json";
import dungeonDemon from "./profiles/Dungeon-Speech-Demon.json";
import dungeonElemental from "./profiles/Dungeon-Speech-Elemental.json";
import dungeonGhost from "./profiles/Dungeon-Speech-Ghost.json";
import dungeonGoblin from "./profiles/Dungeon-Speech-Goblin.json";
import dungeonSkeleton from "./profiles/Dungeon-Speech-Skeleton.json";

const CREATURE_PROFILES: Record<CreatureClass, ResponseProfile> = {
  beast: dungeonBeast as ResponseProfile,
  boss: dungeonBoss as ResponseProfile,
  demon: dungeonDemon as ResponseProfile,
  elemental: dungeonElemental as ResponseProfile,
  ghost: dungeonGhost as ResponseProfile,
  goblin: dungeonGoblin as ResponseProfile,
  skeleton: dungeonSkeleton as ResponseProfile,
};

export function getProfile(creatureClass: CreatureClass): ResponseProfile {
  return CREATURE_PROFILES[creatureClass];
}

export function isCreatureClass(value: string): value is CreatureClass {
  return value in CREATURE_PROFILES;
}
```

### File: `src/speech/index.ts`

The public API. This is the only file game code imports from.

```typescript
/**
 * ZeroResponse NPC Speech System
 *
 * Deterministic, procedural NPC dialogue generation.
 * Position-is-seed: same (x, y, class, index) → same speech, always.
 *
 * Usage:
 *   import { generateSpeech } from "./speech";
 *   const line = generateSpeech(enemy.x, enemy.y, enemy.creatureClass, encounterIndex);
 */

export type { CreatureClass, ResponseProfile } from "./types";

import type { CreatureClass } from "./types";
import { xxhash32, generateResponse, calculateCombinations } from "./engine";
import { getProfile, isCreatureClass } from "./registry";

/**
 * Convert a grid position (x, y) into a 32-bit deterministic seed.
 * Uses xxhash32 to eliminate spatial correlation between adjacent tiles.
 */
function positionToSeed(x: number, y: number): number {
  return xxhash32([x, y], 0);
}

/**
 * Generate a deterministic line of NPC dialogue.
 *
 * @param x - Enemy grid X coordinate
 * @param y - Enemy grid Y coordinate
 * @param creatureClass - One of: "beast", "boss", "demon", "elemental", "ghost", "goblin", "skeleton"
 * @param encounterIndex - Which encounter at this position (0 = first, 1 = second, etc.)
 * @returns A fully-formed speech string ready for display
 *
 * @example
 *   generateSpeech(10, 25, "ghost", 0)
 *   // → "You remind me of someone who came before. That changes how this goes."
 *
 *   generateSpeech(10, 25, "ghost", 1)
 *   // → "I died in this corridor. I have been here ever since. ..."
 *
 *   // Deterministic: calling with same args always returns the same string.
 *   generateSpeech(10, 25, "ghost", 0)
 *   // → "You remind me of someone who came before. That changes how this goes."
 */
export function generateSpeech(
  x: number,
  y: number,
  creatureClass: CreatureClass,
  encounterIndex: number = 0
): string {
  const seed = positionToSeed(x, y);
  const profile = getProfile(creatureClass);
  return generateResponse(seed, encounterIndex, profile);
}

/**
 * Return the total number of unique speech combinations for a creature class.
 * Useful for debug logging or game design validation.
 */
export function getSpeechCombinations(creatureClass: CreatureClass): number {
  const profile = getProfile(creatureClass);
  return calculateCombinations(profile);
}

/**
 * Type guard: check if a string is a valid CreatureClass.
 * Useful when creature class comes from dynamic data (map files, spawn tables).
 */
export { isCreatureClass } from "./registry";
```

### JSON Profile Schema (for reference / new profiles)

Every `Dungeon-Speech-*.json` file follows this exact structure. All seven files in `profiles/` conform to this schema:

```json
{
  "name": "Dungeon Speech — {ClassName}",
  "description": "Procedural room-entry taunts, challenges and threats voiced by {ClassName}-class enemies. Tone is {tone_description}.",
  "version": "1.0.0",
  "templates": [
    "Template string with {placeholder_a} and {placeholder_b}.",
    "Another template referencing {placeholder_c}."
  ],
  "pools": {
    "placeholder_a": ["option1", "option2", "option3"],
    "placeholder_b": ["option1", "option2"],
    "placeholder_c": ["option1", "option2", "option3", "option4"]
  }
}
```

**Constraints:**
- Every `{token}` in every template MUST have a corresponding key in `pools`
- Pool arrays must have at least 1 entry (practically 4+ for variety)
- Same `{token}` appearing multiple times in one template is replaced with the same selected value (consistent within a single generation)
- The iteration order of `Object.entries(pools)` determines pool coordinate assignment (pool at index 0 gets coordinate 1, pool at index 1 gets coordinate 2, etc.)

---

## Data Flow

### Generation Pipeline

```
Game World                    Speech Module                     Engine
-----------                   -------------                     ------

enemy.x = 10  ─┐
enemy.y = 25  ─┤
                ├─→ positionToSeed(10, 25) ──→ xxhash32([10,25], 0)
                │                                    │
                │                              seed = 0xA3B7C2D1
                │                                    │
creatureClass   │                                    │
  = "ghost"  ──┼─→ getProfile("ghost") ──→ Dungeon-Speech-Ghost.json
                │                                    │
encounterIndex  │                                    │
  = 0        ──┼─→ generateResponse(seed, 0, profile)
                │        │
                │        ├─→ editHash(seed, 0, 0)      → template index
                │        ├─→ editHash(seed, 0, 1)      → pool[0] selection
                │        ├─→ editHash(seed, 0, 2)      → pool[1] selection
                │        ├─→ ...                        → pool[N] selection
                │        └─→ template.replace({tokens}) → filled string
                │
                └─→ "You remind me of someone who came before. That changes how this goes."
```

### Coordinate Space Mapping

```
ZeroBytes Coordinate System:
  (seed, promptIdx, coordinate)
       │       │         │
       │       │         └── 0 = template selection
       │       │             1 = first pool in Object.entries order
       │       │             2 = second pool
       │       │             N+1 = Nth pool
       │       │
       │       └── encounterIndex (0, 1, 2, ...) — advances dialogue
       │
       └── xxhash32([x, y], 0) — derived from enemy grid position

Each unique (x, y, creatureClass, encounterIndex) combination
produces a unique set of coordinates that deterministically
select one template and one value from each pool.
```

---

## Integration Steps

### Step 1: Create the `src/speech/` directory

Create the directory structure in the target game project:

```
src/speech/
src/speech/profiles/
```

### Step 2: Copy the JSON profiles

Copy all seven `Dungeon-Speech-*.json` files from `response-gen-dev/zerogen/` into `src/speech/profiles/`:

```
Dungeon-Speech-Beast.json
Dungeon-Speech-Boss.json
Dungeon-Speech-Demon.json
Dungeon-Speech-Elemental.json
Dungeon-Speech-Ghost.json
Dungeon-Speech-Goblin.json
Dungeon-Speech-Skeleton.json
```

These files are used as-is with zero modifications.

### Step 3: Create the four TypeScript files

Create the following files with the exact contents specified in the Technical Implementation section above:

1. `src/speech/types.ts` — `CreatureClass` type union + `ResponseProfile` interface
2. `src/speech/engine.ts` — xxhash32 engine (verbatim copy from `response-gen-dev/src/engine/zerobytes.ts`)
3. `src/speech/registry.ts` — `CreatureClass → ResponseProfile` map with static JSON imports
4. `src/speech/index.ts` — Public API (`generateSpeech`, `getSpeechCombinations`, `isCreatureClass`)

### Step 4: Verify TypeScript configuration

The target game project's `tsconfig.json` (or `tsconfig.app.json`) must include:

```json
{
  "compilerOptions": {
    "resolveJsonModule": true,
    "esModuleInterop": true
  }
}
```

`resolveJsonModule` is required for the static `import ... from "./profiles/Dungeon-Speech-*.json"` statements. If the game project already uses Vite with the React plugin, this is likely already configured.

### Step 5: Wire into game entity system

In the game's enemy/NPC entity code, call `generateSpeech` when the player triggers dialogue:

```typescript
import { generateSpeech, isCreatureClass } from "../speech";

// Inside your enemy encounter handler or room-entry trigger:
function onPlayerEncountersEnemy(enemy: Enemy, encounterCount: number) {
  if (!isCreatureClass(enemy.type)) return;

  const speech = generateSpeech(
    enemy.gridX,
    enemy.gridY,
    enemy.type,       // "ghost", "beast", "goblin", etc.
    encounterCount    // How many times player has met this enemy
  );

  // Pass to your game's dialogue display system:
  showSpeechBubble(enemy, speech);
  // or: dialogueBox.setText(speech);
  // or: floatingText.spawn(enemy.position, speech);
}
```

### Step 6: Validate determinism

After integration, verify the position-is-seed guarantee holds:

```typescript
// Test: same inputs → same output
const a = generateSpeech(10, 25, "ghost", 0);
const b = generateSpeech(10, 25, "ghost", 0);
console.assert(a === b, "Determinism broken: same inputs produced different outputs");

// Test: different position → different output
const c = generateSpeech(11, 25, "ghost", 0);
console.assert(a !== c, "Adjacent positions should produce different speech");

// Test: different encounter index → different output
const d = generateSpeech(10, 25, "ghost", 1);
console.assert(a !== d, "Sequential encounters should produce different speech");

// Test: different creature class → different output
const e = generateSpeech(10, 25, "goblin", 0);
console.assert(a !== e, "Different creature classes should produce different speech");
```

---

## Testing Scenarios

### Determinism Tests

| Test | Input | Assertion |
|---|---|---|
| Repeat call | `(10, 25, "ghost", 0)` x2 | Output identical |
| Adjacent X | `(10, 25, "ghost", 0)` vs `(11, 25, "ghost", 0)` | Output different |
| Adjacent Y | `(10, 25, "ghost", 0)` vs `(10, 26, "ghost", 0)` | Output different |
| Same pos, different class | `(10, 25, "ghost", 0)` vs `(10, 25, "beast", 0)` | Output different |
| Same pos, next encounter | `(10, 25, "ghost", 0)` vs `(10, 25, "ghost", 1)` | Output different |
| Negative coords | `(-5, -10, "skeleton", 0)` | Produces valid string (no crash) |
| Large coords | `(99999, 99999, "boss", 0)` | Produces valid string |
| Zero coords | `(0, 0, "demon", 0)` | Produces valid string |

### Profile Coverage Tests

| Test | Input | Assertion |
|---|---|---|
| All classes valid | Loop all 7 `CreatureClass` values | Each returns non-empty string |
| Combination count | `getSpeechCombinations("beast")` | Returns number > 0 |
| Type guard true | `isCreatureClass("ghost")` | Returns `true` |
| Type guard false | `isCreatureClass("dragon")` | Returns `false` |
| Type guard edge | `isCreatureClass("")` | Returns `false` |

### Stress / Distribution Tests

| Test | Method | Assertion |
|---|---|---|
| No crashes over range | Generate speech for all (x,y) in 0..100 grid, all 7 classes | Zero exceptions |
| Template coverage | 1000 calls per class with varying coords | All templates appear at least once |
| No empty output | 10000 random calls | No empty strings returned |

---

## Performance Goals

| Metric | Target | Rationale |
|---|---|---|
| Single `generateSpeech` call | < 0.1ms | xxhash32 is O(n) on 8-byte input; template fill is O(templates + pools) |
| Memory per profile | ~2-50 KB | JSON profiles are small; loaded once at module init |
| Total module memory | < 200 KB | 7 profiles + engine code |
| No allocations per call | Best effort | Reuse where possible; the regex replace creates strings |
| No async | Guaranteed | Entire pipeline is synchronous |

The speech system adds negligible overhead to the game loop. It is suitable for calling on every frame if needed, though typically called only on encounter events.

---

## Extended Features (Optional Enhancements)

### Enhancement: World Seed Prefix

If the game uses a global world seed (e.g., for procedural level generation), the position-to-seed function can incorporate it:

```typescript
function positionToSeed(x: number, y: number, worldSeed: number = 0): number {
  return xxhash32([x, y], worldSeed);
}
```

This means the same enemy at `(10, 25)` says different things in different generated worlds. The `generateSpeech` signature would become:

```typescript
generateSpeech(x, y, creatureClass, encounterIndex, worldSeed?)
```

### Enhancement: Batch Generation

For preloading dialogue (e.g., loading all speech for enemies in a room before the player enters):

```typescript
export function generateSpeechBatch(
  enemies: Array<{ x: number; y: number; creatureClass: CreatureClass }>,
  encounterIndex: number = 0
): Map<string, string> {
  const results = new Map<string, string>();
  for (const e of enemies) {
    const key = `${e.x},${e.y},${e.creatureClass}`;
    results.set(key, generateSpeech(e.x, e.y, e.creatureClass, encounterIndex));
  }
  return results;
}
```

### Enhancement: Multi-Line Dialogue Sequence

Generate a sequence of N lines for an extended conversation:

```typescript
export function generateDialogueSequence(
  x: number,
  y: number,
  creatureClass: CreatureClass,
  lineCount: underlying = 3,
  startIndex: number = 0
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(generateSpeech(x, y, creatureClass, startIndex + i));
  }
  return lines;
}
```

### Enhancement: Adding New Creature Classes

To add a new creature class (e.g., `"dragon"`):

1. Create `src/speech/profiles/Dungeon-Speech-Dragon.json` following the JSON profile schema
2. Add `"dragon"` to the `CreatureClass` union in `types.ts`
3. Import and register in `registry.ts`:
   ```typescript
   import dungeonDragon from "./profiles/Dungeon-Speech-Dragon.json";
   // Add to CREATURE_PROFILES:
   dragon: dungeonDragon as ResponseProfile,
   ```

No other files require changes. The public API automatically supports the new class.

---

## Glossary

| Term | Definition |
|---|---|
| **ZeroBytes** | Position-is-seed procedural generation methodology. Same input coordinates always produce the same output. |
| **xxhash32** | 32-bit non-cryptographic hash function. Fast, deterministic, good distribution. |
| **Seed** | 32-bit unsigned integer derived from enemy grid position. Defines the "universe" of speech for that position. |
| **Encounter Index** | Integer counter (0, 1, 2, ...) tracking how many times the player has triggered dialogue at a position. Advances the generation sequence. |
| **Profile** | A JSON file containing templates (sentence structures with `{placeholders}`) and pools (arrays of vocabulary options for each placeholder). |
| **Template** | A string like `"You {verb} {noun}. {consequence}."` where `{tokens}` are replaced with pool selections. |
| **Pool** | A named array of vocabulary options (e.g., `"verb": ["look like", "remind me of", "sound like"]`). |
| **Creature Class** | One of the seven supported NPC types: beast, boss, demon, elemental, ghost, goblin, skeleton. |
| **Coordinate** | In the ZeroBytes system, the third dimension `(seed, promptIdx, coordinate)` that selects which pool or template is being chosen. |
| **editHash** | Internal function: `xxhash32(coords, seed)` — combines seed with coordinate array to produce a deterministic hash. |
| **hashToIndex** | `hash % poolSize` — maps a 32-bit hash to a valid array index. |
