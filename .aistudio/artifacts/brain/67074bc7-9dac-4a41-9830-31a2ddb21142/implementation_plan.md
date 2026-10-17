# Colgate Duraphat — 3D Interactive BTL Fluoride Shield Experience

An offline-ready, medical-grade 3D interactive web and BTL tablet kiosk application where university dentistry participants apply Colgate Duraphat (22,600 ppm F) fluoride varnish across three automated cinematic dental sectors (Front, Left Buccal, Right Buccal) using a touch-drag virtual red applicator brush before the 30-second countdown expires.

## User Review & Critical Decisions

> [!IMPORTANT]
> All core gameplay, camera choreography, scoring, and 3D asset-swapping decisions have been locked in based on your answers. Review the visual concept renders and milestone architecture below, then click **Proceed** (or run the `/goal` command at the bottom of this document) to begin full 3D implementation.

- **Confirmed Decision 1 — Automated Cinematic Camera Choreography**: Fixed multi-angle camera system (zero manual 3D orbit rotation). The camera frames the **Front (Anterior)** sector first, then automatically glides via frame-rate independent exponential damping (`THREE.MathUtils.damp`) to the **Left Buccal** and **Right Buccal** views as soon as 100% of the target teeth in the active sector are shielded.
- **Confirmed Decision 2 — Multi-Stroke Varnish Scrub & Bloom Armor**: Touch-dragging the virtual **Colgate Red Brush (`PINCEL`)** across unshielded target teeth scrubs away yellowish plaque and builds a progressive `0% → 100%` fluoride shield. Upon reaching 100%, the tooth locks in a glossy white-violet protective armor (`película fluorada`) enhanced by `UnrealBloomPass`, crystalline particle bursts, and a Web Audio API harmonic chime.
- **Confirmed Decision 3 — 30-Second BTL Kiosk Loop & Merch Reward**: A high-visibility **30-second LED-style countdown (`00:30`)**, live protected teeth counter, and sector progress indicator drive urgency. Completing all sectors triggers the **BTL Merch Reward Screen** (or a Time's Up summary with instant replay) plus an automatic idle-reset timer for continuous booth turnarounds.
- **Confirmed Decision 4 — FDI Tooth Numbering & Auto-Bounding-Box Fallback**: The scene loader attempts to load `/models/dental_arch.glb` (or a drag-and-drop `.glb` override for instant kiosk testing) and traverses meshes matching standard **FDI notation (`tooth_11` to `tooth_48`)**. If meshes use arbitrary names, an automatic spatial bounding-box classifier assigns each tooth to the Front, Left, or Right sector. If no external `.glb` file is present yet, a multi-part anatomical procedural 3D dental arch (upper/lower sculpted gingiva + 28 anatomical incisors, canines, premolars, and molars) renders seamlessly with zero 404 errors.

---

## 1. Overview & Core Concept

- **What It Does**: Transforms the Colgate Duraphat BTL university activation into a tactile 3D canvas. After a brief educational capsule on Duraphat's 22,600 ppm fluoride varnish, students step up to the tablet and race the 30-second clock to coat vulnerable teeth with protective white-violet fluoride armor across all three dental sectors.
- **Target Audience / Persona**: University dental students, hygienists, and clinical activation participants at Colgate Duraphat BTL booths operating touch tablets in offline/kiosk environments.
- **Key Value**: Reinforces clinical recall—demonstrating how Duraphat creates a durable protective film that strengthens enamel and prevents caries—through high-dopamine visual, tactile, and auditory feedback.

### Concept Renders for Visual Style Alignment

#### Concept A — Front View & Key Visual Aesthetic
![Concept Front View UI](/src/assets/images/concept_front_view_ui_1792199306798.jpg)

#### Concept B — Cinematic Angled Sector View (Left Buccal Focus)
![Concept Side Sector View](/src/assets/images/concept_side_sector_view_1792199307800.jpg)

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Attract / Capsule Intro Screen (`CapsuleMode`)**: Displays the Colgate Duraphat co-branded header, the 3D dental arch gently breathing in the background over the ethereal pastel lavender wave canvas, the 3-step BTL mechanic summary (*Aprende · Sonrisas · Armaduras · Merch*), and a prominent primary action button (**"¡Iniciar Reto! (30s)"**). Supports `?autostart=1` for instant kiosk/automated launch.
2. **Active 3D Varnish Challenge (`PlayingMode`)**:
   - **Phase 1 (Front / Anterior Sector)**: Camera frames incisors and canines (`tooth_13–23`, `tooth_33–43`). 3 to 4 randomized teeth in this sector spawn yellowish unshielded plaque spots.
   - **Touch-Drag Brushing**: Touching or dragging anywhere on the viewport moves the 3D/2.5D **Colgate Red Brush** along the tooth surface. Raycasting against the active target teeth increments each tooth's varnish coverage (`0% → 100%`).
   - **Phase 2 & 3 (Left Buccal & Right Buccal Sectors)**: As soon as all target teeth in the Front sector reach 100% protection, a celebratory sector chime plays and the camera smoothly orbits and dollies to frame the **Left Buccal** premolars/molars, spawning the next wave of unshielded spots, followed by the **Right Buccal** sector.
3. **BTL Merch Reward & Kiosk Reset (`VictoryMode` / `TimeoutMode`)**:
   - **Victory**: All 3 sectors shielded within 30 seconds. The camera pulls back for a 360° celebratory showcase of the fully armored, glowing dental arch alongside a **"¡Reto Completado! Reclama tu Merch Duraphat"** clinical achievement overlay showing completion time and fluoride protection facts.
   - **Timeout**: If `00:00` is reached first, displays protected teeth count and invites an immediate retry.

### Visual Identity & Theme
- **Aesthetic Direction**: Ultra-minimalist clinical luxury paired with the official Colgate Duraphat BTL Key Visual (ethereal lavender-pink pastel backdrop, delicate purple geometric Guilloché wave lines, crisp medical white surfaces, and Colgate Red accents).
- **Color Palette & Mood**:
  - `--background`: `#F6F2FF` to `#FFFFFF` radial pastel lavender-white gradient with subtle SVG geometric wave lines inspired by the key visual.
  - `--primary`: `#E31837` (Colgate Red — reserved for co-branding lockup, the virtual applicator brush, and primary CTA).
  - `--accent`: `#6B3FA0` / `#8B5CF6` (Duraphat Clinical Violet — used for protective shield aura, progress rings, and clinical callouts).
  - `--LED-timer`: `#14121A` dark bezel housing with `#FF2A3C` tabular digital countdown numerals (`00:30`), echoing the physical BTL timer in the key visual.
- **Typography & Hierarchy**:
  - *Display / Headings*: `Plus Jakarta Sans` (SemiBold/Bold, tight tracking, balanced headline wrapping).
  - *Body / Clinical Copy*: `DM Sans` (Regular/Medium for high legibility on tablet screens).
  - *Timer & Telemetry*: `JetBrains Mono` with `tabular-nums` so countdown ticks never jitter horizontally.
- **Viewport & HUD Discipline**:
  - Full-viewport 3D canvas (`100vw × 100vh`, `touch-action: none`) with semantic DOM HUD overlays positioned strictly at the perimeter (Top-Left Brand Lockup, Top-Right Digital Timer + Shield Counter, Bottom Center Sector Progress & Collapsible Kiosk Dock) so the central 3D dental arch is 100% unobstructed.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Automated Sector Camera vs. Free Orbit Controls**
  - *Chosen Approach*: Automated 3-sector camera state machine (`FRONT` → `LEFT_BUCCAL` → `RIGHT_BUCCAL` → `VICTORY_ORBIT`) driven by exponential damping (`THREE.MathUtils.damp`), with a subtle HUD sector indicator that also supports optional tap-to-focus in practice mode.
  - *Why*: Eliminates two-finger camera frustration on BTL tablets so every single touch-drag gesture is 100% dedicated to brushing with the Colgate Red Brush.
- **Decision 2 — Hybrid PBR + Selective Emissive Bloom for the Fluoride Shield**
  - *Chosen Approach*: Each tooth uses a calibrated `MeshPhysicalMaterial` (wet enamel clearcoat, subtle roughness variation). As varnish coverage increases from `0%` to `100%`, the material transitions from a matte yellowish plaque tint to high-gloss enamel with a violet-white emissive rim aura amplified by `EffectComposer` + `UnrealBloomPass` (automatically bypassed in headless/CPU environments for lossless frame rates).
  - *Why*: Directly replicates the glowing white-purple "armaduras blancas" shown on the tablet in the official key visual while maintaining 60 FPS on tablet GPUs.
- **Decision 3 — Drop-In `.glb` Loader with FDI Traversal & Procedural Anatomical Fallback**
  - *Chosen Approach*: Asynchronous `GLTFLoader` pipeline with a runtime Kiosk Model Hot-Swap support (via drag-and-drop `.glb` or static asset placement) backed by a multi-part composite procedural dental arch (sculpted upper/lower gums + 28 individually addressable FDI teeth meshes).
  - *Why*: Guarantees the app is 100% playable, testable, and booth-ready today while allowing zero-code replacement the moment your colleague exports `dental_arch.glb`.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   React Kiosk Shell & Game State Machine                   │
│       (Mode: ATTRACT | PLAYING | VICTORY | TIMEOUT  +  30s Timer Loop)     │
└───────────────┬────────────────────────────────────────────┬───────────────┘
                │                                            │
                ▼                                            ▼
┌───────────────────────────────────────┐    ┌───────────────────────────────┐
│      Semantic Perimeter DOM HUD       │    │   Pure Game Logic & FDI Core  │
│  ┌─────────────────────────────────┐  │    │  ┌─────────────────────────┐  │
│  │ Top Bar: Colgate Duraphat Brand │  │    │  │ Sector Spawner (Front,  │  │
│  │ + LED Timer (00:30) + Counter   │  │    │  │ Left, Right FDI Map)    │  │
│  ├─────────────────────────────────┤  │    │  ├─────────────────────────┤  │
│  │ Center Overlay: Intro Capsule   │  │    │  │ Multi-Stroke Scrub Math │  │
│  │ & BTL Merch Victory Modal       │  │    │  │ (0..100% Coverage/Tooth)│  │
│  ├─────────────────────────────────┤  │    │  ├─────────────────────────┤  │
│  │ Bottom Dock: Sector Progress    │  │    │  │ FDI Mesh Classifier &   │  │
│  │ + Audio Mute + GLB Hot-Swap     │  │    │  │ Bounding-Box Fallback   │  │
│  └─────────────────────────────────┘  │    │  └─────────────────────────┘  │
└───────────────────────────────────────┘    └───────────────┬───────────────┘
                                                             │
                                                             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    Three.js WebGL Studio Engine (60 FPS)                   │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │ GLTFLoader + 28-Tooth│  │ Damped Camera Rig    │  │ Touch Raycaster  │  │
│  │ Composite Procedural │  │ (Front/Left/Right    │  │ + 3D Red Brush   │  │
│  │ Arch & Gingiva Group │  │ Presets + FOV Damp)  │  │ + Sparkle Burst  │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └────────┬─────────┘  │
│             └─────────────────────────┼───────────────────────┘            │
│                                       ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ RoomEnvironment + 3-Point Studio Lighting + EffectComposer Bloom     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State
- **`DentalSector`**: `'FRONT' | 'LEFT' | 'RIGHT'`
  - `FRONT`: Anterior incisors & canines (`tooth_13`–`tooth_23`, `tooth_33`–`tooth_43`)
  - `LEFT`: Patient's left / viewer-framed buccal premolars & molars (`tooth_24`–`tooth_27`, `tooth_34`–`tooth_37`)
  - `RIGHT`: Patient's right buccal premolars & molars (`tooth_14`–`tooth_17`, `tooth_44`–`tooth_47`)
- **`ToothState`**: `{ fdiId: string; sector: DentalSector; needsVarnish: boolean; coverage: number (0..1); shielded: boolean }`
- **`GameSessionState`**: `{ status: 'ATTRACT' | 'PLAYING' | 'VICTORY' | 'TIMEOUT'; activeSector: DentalSector; timeRemainingMs: number; totalTargetTeeth: number; shieldedCount: number; currentStreak: number; modelSource: 'GLB' | 'PROCEDURAL' }`

### Interactive Component & State Mapping
- **Touch / Pointer Brushing Handler**: Pointer move/drag events project a normalized 2D ray from the active camera onto layer `1` (interactive tooth meshes). The 3D **Colgate Red Brush** smoothly tracks the surface intersection point and surface normal. Continuous scrubbing across an unshielded target tooth increases `coverage` by `delta * scrubRate`, emitting lavender-white fluoride sparkles and updating the tooth's shader/material uniform in real time without triggering 60Hz React re-renders.
- **Sector Completion & Camera Transition**: When all target teeth in `activeSector` reach `coverage >= 1.0`, the pure state machine advances `activeSector` to the next sector (`FRONT → LEFT → RIGHT`) and sets the new camera target position and lookAt vectors. When `RIGHT` completes, `status` transitions to `'VICTORY'` and triggers the BTL Merch Reward screen.
- **Zero-Code `.glb` Hot-Swap**: In addition to automatically loading `/models/dental_arch.glb` if placed in the public directory, the collapsible bottom kiosk dock includes an optional **"Cargar .GLB"** button (and drag-and-drop listener) that parses any colleague-provided `.glb` file via `GLTFLoader.parse()`, logs discovered mesh names, maps `tooth_11`–`tooth_48` (or auto-classifies meshes by 3D bounding-box X/Z coordinates), and immediately starts a round on the new geometry.

---

## 5. Implementation Milestones & Ready-to-Run `/goal` Command

### Milestones
1. **Milestone 1 — Pure Domain Logic & Unit Test Suite (`node:test`)**: Implement deterministic FDI tooth sector mapping (`tooth_11` to `tooth_48` + spatial bounding-box fallback classifier), randomized sector plaque spawning, multi-stroke scrub progression math (`0% → 100%`), sector auto-advance transitions, and 30-second countdown win/timeout evaluation, verified by automated unit tests.
2. **Milestone 2 — Three.js Studio Engine, Composite Procedural Arch & `.glb` Pipeline**: Build the Three.js scene with `RoomEnvironment` PBR reflections, 3-point clinical softbox lighting (`PCFSoftShadowMap`), `EffectComposer` + `UnrealBloomPass` (with headless fallback), the composite 28-tooth + sculpted gingiva procedural fallback model, and the `GLTFLoader` hot-swap pipeline.
3. **Milestone 3 — Virtual Colgate Red Brush, Raycasting & Web Audio Synth**: Implement the 3D articulated red brush applicator following pointer/touch raycasts, yellow plaque decal/tint scrubbing into glowing white-violet fluoride armor, GPU particle bursts on tooth completion, and Web Audio API crystalline synth chimes.
4. **Milestone 4 — Key Visual BTL UI, LED Timer HUD & Merch Reward Flow**: Build the pastel lavender/white wave backdrop, Colgate Duraphat co-branded header, LED-style `00:30` countdown module, sector progress dock, educational intro capsule, and BTL Merch Reward screen with idle kiosk reset.
5. **Milestone 5 — End-to-End Browser Verification & Visual Critique Loop**: Run unit tests, compile, capture desktop and tablet viewports via Playwright, verify `?autostart=1` and full gameplay journeys, and polish any visual or performance defects.

### Ready-to-Run `/goal` Command

Copy and paste the following command once you approve this plan to keep the build and verification loop running autonomously through all 5 milestones:

```text
/goal Execute the approved Colgate Duraphat 3D BTL Tablet Experience plan across all 5 milestones: (1) build and unit-test the pure FDI dental sector spawner, bounding-box GLB classifier, multi-stroke varnish scrub math, automated Front/Left/Right camera state machine, and 30s countdown rules via node:test; (2) implement the Three.js WebGL studio scene with RoomEnvironment, 3-point clinical lighting, EffectComposer + UnrealBloomPass, GLTFLoader with live .glb drag-and-drop hot-swap, and the 28-tooth composite procedural dental arch; (3) wire the touch-drag Colgate Red Brush raycaster, progressive 0-100% violet-white fluoride armor shader/material transitions, sparkle particle bursts, and Web Audio API dopamine chimes; (4) craft the official Colgate Duraphat key visual UI with the pastel lavender wave backdrop, 00:30 LED countdown timer, protected teeth counter, and BTL Merch Reward screen; and (5) verify all journeys, headless performance, and visual polish in a real browser.
```
