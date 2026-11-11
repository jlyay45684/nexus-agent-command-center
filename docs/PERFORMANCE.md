# Performance Test Record

## Test Baseline (Required)
- **GPU:** NVIDIA GeForce GTX 1050 Ti 4GB (target baseline)
- **CPU/RAM/OS/Browser:** _fill during manual validation on target machine_
- **Resolution:** _fill_
- **Power mode:** Prefer plugged-in / High performance

## Quality Presets

| Preset | Particles | DPR cap | Bloom | Target FPS |
|---|---:|---:|---|---:|
| High | 16,000 | 1.25 | On (0.9) | 60 |
| Medium | 8,000 | 1.0 | Weak (0.35) | 45–60 |
| Low | 3,000 | 0.75 | Off | 30–45 |

## Automated/Build Validation (this environment)
- `npm run build`: **PASS** (Vite production build completed)
- Bundle output recorded from build:
  - `dist/index.html` ~3.67 kB (gzip 1.34 kB)
  - `dist/assets/index-*.css` ~6.14 kB (gzip 1.86 kB)
  - `dist/assets/index-*.js` ~626.61 kB (gzip 167.15 kB, includes Three.js)
- Note: Large chunk warning from Three.js is expected for a 3D scene; acceptable for demo.

## Runtime FPS Observations
> Record actual measurements on GTX 1050 Ti 4GB using the in-app FPS monitor and browser performance tools.

| Scenario | Quality | DPR | Avg FPS | 1% Low (est) | Notes |
|---|---|---:|---:|---:|---|
| Idle scene, no pulses burst | High | 1.25 | _TBD on 1050 Ti_ | _TBD_ | Bloom on |
| Dispatch bursts + pulses | High | 1.25 | _TBD on 1050 Ti_ | _TBD_ |  |
| Idle scene | Medium | 1.0 | _TBD on 1050 Ti_ | _TBD_ | Weak bloom |
| Idle scene | Low | 0.75 | _TBD on 1050 Ti_ | _TBD_ | Bloom off |
| Auto downgrade trigger | Auto | varies | _TBD on 1050 Ti_ | _TBD_ | Verify downgrade/upgrade logs |

## Functional Performance Checks
- [x] Single `requestAnimationFrame` render loop
- [x] No per-frame object allocation in particle/link hot paths (buffers updated in-place; pulses reused list)
- [x] `BufferGeometry` + `Points` nebula; instancing-ready materials reused
- [x] Pauses on tab hidden and when canvas offscreen
- [x] Auto quality adjustment based on FPS samples
- [x] WebGL context loss fallback
- [x] `prefers-reduced-motion` respected
- [x] Bloom only when necessary (High/Medium)

## RWD Checks
- [x] Desktop: dual glass panels over 3D scene
- [x] Mobile/narrow: stacked panels below scene, scrollable, controls usable

## Simulation Compliance
- [x] All agent actions/results labeled/logged as **Simulation**
- [x] UI disclaimer: no real LLM execution

## Sign-off
- Build: PASS (`npm run build`)
- Manual GTX 1050 Ti FPS capture: _pending execution on target hardware_
