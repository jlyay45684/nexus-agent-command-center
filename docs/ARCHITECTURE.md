# Architecture

## Overview
NEXUS is a client-side WebGL simulation rendered with Three.js and composed via a single render loop. All "agent" behavior is deterministic/randomized UI simulation—no backend or LLM calls.

## Modules
- **`src/main.js`**: Bootstraps renderer/scene/camera/composer, creates core, nebula, agent network, pulse system, HUD bindings, input/raycast selection, visibility/lifecycle handling, and the main animation loop.
- **`src/shaders/materials.js`**: Custom GLSL
  - Core: simplex-noise vertex displacement + fresnel/scan/pulse fragment coloring.
  - Nebula: point-sprite vertex sizing/animation and soft radial fragment alpha with additive blending.
- **`src/perf/QualityManager.js`**: Quality presets (High/Medium/Low) and Auto FPS sampling that downgrades/upgrades with cooldown.
- **`src/style.css`**: Cyberpunk HUD, scanlines, radar sweep, glass panels, responsive layout.
- **`.github/workflows/deploy.yml`**: CI build and GitHub Pages deployment.

## Scene Graph
- `Scene` (fog + dark background)
  - Core mesh (`IcosahedronGeometry`, custom `ShaderMaterial`) + wireframe shell
  - 3 decorative torus rings
  - Nebula (`Points`, `BufferGeometry`, custom shader, additive)
  - `networkGroup` (rotatable): 10 agent sphere nodes + halo rings + `Line` connections
  - `pulseGroup`: transient pulse meshes traveling along links
  - Lights: ambient + core/cool point lights

## Render Pipeline
1. `RenderPass`
2. `UnrealBloomPass` (enabled/weighted per quality; off on Low)
3. `OutputPass`
- Single `requestAnimationFrame` loop; composer used when bloom enabled, otherwise direct renderer for lower cost.

## Simulation Model
- Agents have states: `ok`, `busy`, `paused`, `fail` (visual + list badges).
- Dispatch sets available agents to busy and schedules simulated completion timers.
- Pause/Resume toggles busy↔paused.
- Failure/Recovery mutates selected/random agent state.
- Pulses are pooled-ish transient meshes spawned on dispatch/ambient interval and advanced by normalized `t` along world-space link endpoints.
- All UI/log entries append `[Simulation]` semantics; disclaimer shown in panel.

## Interaction & UX
- UI controls: dispatch, pause/resume, failure, recovery, rotation speed, camera zoom, quality selector.
- Selection: click agent list item or raycast-pick 3D agent mesh.
- Real-time FPS meter and telemetry counters.

## Resilience & Adaptivity
- **Context loss**: `webglcontextlost` halts loop and shows fallback overlay; `webglcontextrestored` prompts reload.
- **Visibility**: pauses on `document.hidden` and when canvas not intersecting viewport.
- **Reduced motion**: detects `prefers-reduced-motion` to damp motion, stop radar sweep/pulse ambience.
- **Auto quality**: rolling FPS samples trigger tier changes with 4s cooldown.

## Build/Deploy
- Vite `base: './'` for GitHub Pages subpath safety.
- Actions workflow: checkout → Node 20 → `npm ci` → `npm run build` → upload/deploy Pages artifact.
