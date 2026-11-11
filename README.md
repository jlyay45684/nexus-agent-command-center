# NEXUS — AI Agent Command Center (Simulation)

High-fidelity cyberpunk 3D AI Agent command center built with Vite, Three.js, custom GLSL shaders, GSAP, and WebGL postprocessing.

> **Simulation Notice:** All agent activity, missions, failures, recoveries, and telemetry in this project are **simulated** for visual/demo purposes. No real LLM execution, network dispatch, or autonomous agent runtime is performed.

## Live Demo
- GitHub Pages: *(set after deployment via Actions)*

## Features
- Central 3D AI core with custom GLSL displacement/fresnel shader
- Multi-layer rotating particle nebula (quality-scaled)
- 10 agent nodes in dynamic network with connection lines
- Flowing energy pulse particles along network links
- Holographic HUD: scanlines, radar sweep, corner reticles, telemetry panels
- Cyberpunk palette: deep blue / cyan / violet neon
- Transparent glass control panels (left/right)
- Spatial depth, fog, and parallax camera response
- Interactions:
  - Dispatch Mission
  - Pause / Resume
  - Agent Failure Simulation
  - Agent Recovery
  - Agent Selection (list or 3D click)
  - Network Rotation
  - Camera Zoom
  - Real-time FPS Monitor
  - Quality Selector: Auto / High / Medium / Low

## Tech Stack
- Vite + JavaScript
- Three.js (WebGL)
- Custom GLSL shaders
- GSAP (UI transitions)
- `EffectComposer` + `UnrealBloomPass` (High/Medium)
- GitHub Pages + GitHub Actions

## Performance Targets (GTX 1050 Ti 4GB baseline)

| Item | High | Medium | Low |
|---|---:|---:|---:|
| Particle cap | 16,000 | 8,000 | 3,000 |
| DPR | 1.25 | 1.0 | 0.75 |
| Bloom | On | Weak | Off |
| Target FPS | 60 | 45–60 | 30–45 |

### Performance Measures
- `BufferGeometry` + `Points` for nebula particles
- Reused geometries/materials/objects in render loop (no per-frame allocations in hot path)
- Single main render loop (`requestAnimationFrame`)
- Pauses animation when tab hidden (`visibilitychange`) and when canvas leaves viewport (IntersectionObserver)
- FPS sampling with Auto quality downgrade/upgrade
- WebGL context loss fallback UI
- `prefers-reduced-motion` support (reduced animation/sweep/pulses)
- Conservative transparent overlays

## Project Structure
```
.
├─ .github/workflows/deploy.yml   # GitHub Pages deployment
├─ docs/
│  ├─ ARCHITECTURE.md             # Technical architecture
│  └─ PERFORMANCE.md              # FPS & performance test record template/results
├─ src/
│  ├─ main.js                     # Scene, simulation, loop, UI wiring
│  ├─ style.css                   # HUD / glass UI / RWD
│  ├─ perf/QualityManager.js      # Presets + auto quality scaling
│  └─ shaders/materials.js        # Custom GLSL shaders
├─ index.html
├─ vite.config.js
└─ package.json
```

## Development
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Deployment
Push to `main` triggers `.github/workflows/deploy.yml` which builds and deploys `dist/` to GitHub Pages. Ensure repository Settings → Pages → Source is set to **GitHub Actions**.

## RWD
Desktop shows dual glass panels over full 3D scene; mobile stacks panels below a fixed-height scene viewport for usability.

## License
MIT
