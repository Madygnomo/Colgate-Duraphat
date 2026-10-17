# Colgate Duraphat — 3D Interactive BTL Fluoride Shield Experience (`PLAN.md`)

## 1. Architectural Vision & Confirmed Decisions
- **Aesthetic Direction**: Medical-grade Colgate Duraphat key visual aesthetic — ethereal pastel lavender/pink backdrop (`#F6EEFA` → `#EFE3F8`) with purple Guilloché wave lines, official Colgate + Duraphat® 22,600 ppm F co-branding, dark digital LED countdown (`00:30`), 4 clinical benefit badges (*Aprende, Sonrisas, Armaduras, Merch*), and the 3D perspective Duraphat 10mL product pack.
- **Automated Cinematic Camera Choreography (Zero Manual Orbit)**:
  - **Attract View**: Gentle orbital breathing framing the full 28-tooth dental arch while the Title card is displayed.
  - **Sector 1 (`FRONT`)**: Labial focus on anterior incisors and canines (`tooth_13`..`tooth_23`, `tooth_33`..`tooth_43`).
  - **Sector 2 (`LEFT`)**: Left buccal corridor focus on premolars and molars (`tooth_24`..`tooth_27`, `tooth_34`..`tooth_37`).
  - **Sector 3 (`RIGHT`)**: Right buccal corridor focus on premolars and molars (`tooth_14`..`tooth_17`, `tooth_44`..`tooth_47`).
  - **Auto-Advance**: Once 100% of target teeth in the active sector are shielded with Duraphat varnish, the camera automatically transitions via `THREE.MathUtils.damp` to the next sector.
- **Multi-Stroke "Colgate Red Brush" Varnish Scrubbing**:
  - Touch-drag or pointer-scrub raycasting against Layer 1 tooth meshes smoothly increments fluoride varnish coverage (`0%` → `100%`), fading the yellow plaque biofilm decal while illuminating a crystalline violet-white fluoride armor (`UnrealBloomPass` + `MeshStandardMaterial` emissive sheen) and spawning pooled sparkle particles + Web Audio harmonic chimes.
- **Drop-In `.GLB` Asset Swapping (`dental_arch.glb`)**:
  - Automatically loads `/dental_arch.glb` if present or accepts live `.glb`/`.gltf` drag-and-drop / file selection via the bottom bar (`Cargar .GLB (28 FDI)`).
  - Binds meshes named `tooth_11`..`tooth_48` (FDI standard) and falls back to automatic 3D bounding-box sector classification (`classifySectorByBoundingBoxCenter`) when custom mesh names differ.

## 2. Milestones
- **Milestone 1 — Pure Domain Logic & Unit Tests (`src/game/dentalRules.ts`, `src/game/dentalRules.test.ts`)**:
  - 28-tooth FDI catalog, sector-constrained random plaque spawner (`4` targets per sector, `12` total), continuous scrub coverage state machine, and 30-second countdown timer.
- **Milestone 2 — 3D Studio Engine & Procedural/GLB Dental Arch (`src/three/proceduralDentalArch.ts`, `src/components/DentalViewport3D.tsx`)**:
  - `RoomEnvironment` PMREM reflections, 3-point clinical studio lighting with `PCFSoftShadowMap`, `EffectComposer` + `UnrealBloomPass`, 3D Colgate Red Brush wand tracking, and pooled sparkle particles.
- **Milestone 3 — BTL Tablet Kiosk HUD & Merch Reward Flow (`src/App.tsx`, `src/components/BrandAssets.tsx`, `src/audio/soundEngine.ts`)**:
  - Responsive tablet/mobile HUD, collapsible bottom sector bar, accessible brush action button + keyboard controls, and celebratory BTL Merch Claim screen.

## 3. Ready-to-Run `/goal` Command
```text
/goal Build, verify, and polish the complete Colgate Duraphat 3D Interactive BTL Tablet Experience following PLAN.md: implement the decoupled FDI dental sector spawner and unit tests in src/game/dentalRules.ts, build the Three.js WebGL studio scene with RoomEnvironment, 3-point soft-shadow lighting, UnrealBloomPass, damped Front/Left/Right automated camera choreography, 3D Colgate Red Brush raycast scrubbing, and FDI/bounding-box dental_arch.glb loader, create the key-visual lavender Guilloché UI with 30s LED countdown and BTL Merch Reward screen, and verify zero console/page errors across desktop and mobile viewports in headless Chromium.
```
