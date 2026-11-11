# Optimization Comparison — NEXUS Galaxy (perf/galaxy-optimization)

## Before / After

| Area | Before (backup_original, 4c18b69) | After (optimized) |
|---|---|---|
| Nebula shading | Per-fragment procedural noise in shader path (FBM-style cost; 3 groups × 5 octaves intent) | Pre-generated 128² `DataTexture` noise sampled 3× with slow UV offsets; no per-frame texture generation; preserves purple/blue/pink depth & breathing |
| Post-processing | `RenderPass` + `UnrealBloomPass` only | `RenderPass` + `UnrealBloomPass` + custom `ShaderPass` (CA, halation, scanlines, vignette, hue, radial warp) with grain via noise-texture lookup; warp math skipped when off |
| Bloom | 5-level mip blur behavior at full composer res, strength 0.9/0.35/off per preset | Bloom retained/toggleable; lighter per-profile params and reduced render buffer resolution (2–3 effective mip feel on scaled targets), consistent composer/render target sizing |
| DPR / resolution | `min(devicePixelRatio, preset.dprCap)` up to 1.25; full-res composer | DPR capped at 1.0; composer/render scaled by profile (1.00/0.82/0.68/0.60) via `composer.setPixelRatio(1.0)` + `setSize`; HUD remains native |
| Particles | Rebuilt nebula geometry on quality change (3k/8k/16k presets) | Single allocation at 70k max; count adjusted via `BufferGeometry.setDrawRange` (no rebuild/dispose churn) |
| Quality profiles | High/Medium/Low (16k/8k/3k) | High/Balanced/Performance/Mobile (70k/48k/28k/20k @ 1.00/0.82/0.68/0.60), initial Balanced |
| Auto controller | Avg of recent samples, 4s cooldown, simple thresholds | FPS EMA (α=0.12), sustained <45↓, <38↓, >58 stable 10s↑, 5s cooldown, damped after adjust |
| Lifecycle | Paused on hidden/offscreen in places; single RAF chain | Strict visibility stop/start (single RAF, no duplicates), hidden halts loop; WebGL context-lost static fallback |
| Controls | Dispatch/pause/fail/recover, rotation, zoom, agent select, quality | All preserved + Bloom toggle, Warp toggle, Hue slider; pointer selection and zoom lerp intact |

## Files Changed
- `src/main.js` — render/composer scaling, noise textures, drawRange nebula, post pass, adaptive hooks, lifecycle & controls
- `src/perf/QualityManager.js` — profiles, EMA auto controller, cooldown/stability logic
- `src/shaders/materials.js` — texture-sampled nebula, optimized post shader
- `index.html` — controls/telemetry (quality, render scale, particles, frame ms)
- `src/style.css` — active button/telemetry tweaks
- `docs/PERFORMANCE.md` — updated record and UNMEASURED target-hardware results
- `backup_original/` — preserved original `index.html` and `src/`

## Validation
- `node --check`: PASS (`src/main.js`, `src/perf/QualityManager.js`, `src/shaders/materials.js`)
- `npm run build`: PASS (Vite v8.3.8)
- Functional regression (static): controls, pointer select, zoom/scroll lerp, bloom/warp/hue, simulation labels, single loop/visibility, context-loss fallback — PASS by code inspection
- Target-hardware FPS (GTX 1050 Ti 4GB): **UNMEASURED** (not claimed PASS)
