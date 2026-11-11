# Performance Test Record — Galaxy Optimization v1.0

## Target Hardware (required baseline)
- **GPU:** NVIDIA GeForce GTX 1050 Ti 4GB
- **RAM:** 16 GB
- **OS:** Windows 11
- **Browser:** _UNMEASURED (record during manual validation)_
- **Resolution / Power mode:** _UNMEASURED_

> If not measured on actual GTX 1050 Ti hardware, results are **UNMEASURED** and must not be claimed as PASS.

## Optimization Summary
- Nebula: replaced per-fragment FBM (3 groups × 5 octaves) with pre-generated low-res noise texture sampling (`DataTexture` 128², created once) + 3 cheap samples and slow UV offsets to preserve purple/blue/pink gradient, depth, and breathing.
- Post-processing: single optimized `ShaderPass` (chromatic aberration, halation, scanlines, vignette, hue, radial warp) with grain via pre-generated noise texture lookup; warp math skipped when `uWarp==0`. No per-frame texture regeneration.
- Bloom: `UnrealBloomPass` retained (button preserved) with lowered render-resolution/composite sizes via composer render scale and lighter per-profile strength/radius/threshold (2–3 effective mip feel via tuned params and scaled buffer).
- Adaptive rendering: profiles High 70k/1.00, Balanced 48k/0.82, Performance 28k/0.68, Mobile 20k/0.60; initial Balanced; DPR cap 1.0 via `renderer.setPixelRatio(1.0)` and `composer.setPixelRatio(1.0)`; nebula count via `BufferGeometry.setDrawRange` (max 70k allocated once, no geometry rebuild); HUD remains native CSS resolution.
- Auto quality controller: FPS EMA (α=0.12), sustained <45 (~1.2s) steps down, sustained <38 (~1.5s) steps down (particle/scale reduction), sustained >58 for 10s steps up, 5s cooldown to avoid oscillation. FPS reflects actual render loop.
- Runtime: render loop stops on `visibilitychange` hidden and restarts on visible (single `requestAnimationFrame` loop, no duplicates); pointer selection, rotation/zoom, warp/hue/bloom controls preserved; WebGL context lost shows static fallback, rendering halted.
- Resize: updates renderer, composer size/pixel ratio, and shader `uResolution`.

## Quality Profiles

| Profile | Particles | Render Scale | Bloom (strength/radius/thr) |
|---|---:|---:|---|
| High | 70,000 | 1.00 | 0.75 / 0.35 / 0.22 |
| Balanced (initial) | 48,000 | 0.82 | 0.55 / 0.28 / 0.28 |
| Performance | 28,000 | 0.68 | 0.35 / 0.22 / 0.35 |
| Mobile | 20,000 | 0.60 | 0.20 / 0.18 / 0.42 |

## Automated / Build Validation (this environment)
- **Syntax check:** `node --check` on `src/main.js`, `src/perf/QualityManager.js`, `src/shaders/materials.js` — **PASS**
- **Build:** `npm ci` + `npm run build` (Vite v8.3.8) — **PASS**
  - `dist/index.html` ~4.17 kB (gzip ~1.43 kB)
  - `dist/assets/index-*.js` ~583.50 kB (gzip ~146.38 kB, includes Three.js) — chunk warning expected for 3D bundle
- **Single loop/lifecycle:** one `requestAnimationFrame` chain, visibility-gated start/stop — **PASS (static/code review)**
- **Context loss fallback:** handler halts loop and shows fallback — **PASS (static/code review)**
- **Controls preserved:** dispatch/pause/fail/recover, agent select (pointer), rotation, zoom, bloom toggle, warp toggle, hue — **PASS (static/code review)**

## Runtime FPS Observations (GTX 1050 Ti 4GB) — UNMEASURED
> Capture on target hardware using in-app FPS/Frame ms/Render Scale/Particles telemetry.

| Scenario | Profile | Render Scale | Particles | Avg FPS | Frame Time (ms) | Notes |
|---|---|---:|---:|---:|---:|---|
| General scene (idle) | Balanced | 0.82 | 48,000 | _UNMEASURED_ | _UNMEASURED_ | target 50–60 |
| Warp enabled | Balanced | 0.82 | 48,000 | _UNMEASURED_ | _UNMEASURED_ | target ≥45 |
| General scene | High | 1.00 | 70,000 | _UNMEASURED_ | _UNMEASURED_ |  |
| General scene | Performance | 0.68 | 28,000 | _UNMEASURED_ | _UNMEASURED_ |  |
| General scene | Mobile | 0.60 | 20,000 | _UNMEASURED_ | _UNMEASURED_ |  |
| Auto downgrade/upgrade | Auto | varies | varies | _UNMEASURED_ | _UNMEASURED_ | verify 5s cooldown, stable 10s upgrade |

## Acceptance (GTX 1050 Ti 4GB)
- General scene 50–60 FPS: **UNMEASURED**
- Warp ≥45 FPS: **UNMEASURED**
- No prolonged <40 FPS: **UNMEASURED**
- Scroll/drag smooth, visuals near-original: **UNMEASURED** (requires manual verification)

## Simulation Compliance
- All agent actions labeled/logged as **Simulation**; no real LLM execution.
