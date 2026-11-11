import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { coreVertex, coreFragment, nebulaVertex, nebulaFragment, postVertex, postFragment } from './shaders/materials.js';
import { QualityManager, QUALITY_PRESETS, QUALITY_ORDER } from './perf/QualityManager.js';

const canvas = document.getElementById('scene');
const fallbackEl = document.getElementById('fallback');
const logEl = document.getElementById('log');
const agentListEl = document.getElementById('agent-list');
const fpsEl = document.getElementById('fps');
const qualityLabelEl = document.getElementById('quality-label');
const scaleLabelEl = document.getElementById('scale-label');
const particlesLabelEl = document.getElementById('particles-label');
const frameLabelEl = document.getElementById('frame-label');
const activeCountEl = document.getElementById('active-count');
const alertCountEl = document.getElementById('alert-count');
const clockEl = document.getElementById('clock');

const MAX_PARTICLES = 70000;

const state = {
  paused: false,
  rotationSpeed: 0.6,
  zoom: 13,
  selected: null,
  alerts: 0,
  running: false,
  visible: true,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  bloom: true,
  warp: 0.0,
  hue: 0.0,
};

function log(msg) {
  if (!logEl) return;
  const t = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.className = 'e';
  div.innerHTML = `<span class="t">[${t}]</span> ${msg}`;
  logEl.prepend(div);
  while (logEl.children.length > 80) logEl.lastChild.remove();
}
setInterval(() => { if (clockEl) clockEl.textContent = new Date().toLocaleTimeString(); }, 1000);
if (clockEl) clockEl.textContent = new Date().toLocaleTimeString();

let renderer, scene, camera, composer, bloomPass, postPass, renderPass;
let core, coreMat, coreWire, nebula, nebulaGeo, nebulaMat, noiseTex, grainTex;
let networkGroup, pulseGroup;
let agents = [];
let linkLines = [];
let ringMeshes = [];
let pulses = [];
let animationId = null;
let lastTime = 0;
let fpsAccum = 0, fpsFrames = 0, fpsLast = 0;
let qm;
let currentScale = 0.82;

function showFallback(reason) {
  if (fallbackEl) fallbackEl.classList.remove('hidden');
  log('WebGL fallback: ' + (reason || 'unavailable') + ' (Simulation).');
}

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
} catch (e) {
  showFallback('init error');
}
if (!renderer || !renderer.getContext()) { showFallback('no context'); }

// Context loss handling (static fallback, no multiple loops)
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  state.running = false;
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;
  showFallback('context lost');
  log('WebGL context lost — rendering halted (Simulation).');
});
canvas.addEventListener('webglcontextrestored', () => {
  if (fallbackEl) fallbackEl.classList.add('hidden');
  log('WebGL context restored — reload recommended.');
});
const reloadBtn = document.getElementById('btn-reload');
if (reloadBtn) reloadBtn.addEventListener('click', () => location.reload());

scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x040812, 0.035);
scene.background = new THREE.Color(0x040812);

camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.set(0, 4, state.zoom);

// Pre-generate low-res noise texture ONCE (no per-frame regeneration)
function makeNoiseTexture(size) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const i4 = i * 4;
    data[i4] = Math.floor(Math.random() * 256);
    data[i4 + 1] = Math.floor(Math.random() * 256);
    data[i4 + 2] = Math.floor(Math.random() * 256);
    data[i4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
noiseTex = makeNoiseTexture(128);
grainTex = makeNoiseTexture(128);

// Post-processing setup
function setupComposer() {
  const w = Math.floor(window.innerWidth * currentScale);
  const h = Math.floor(window.innerHeight * currentScale);
  renderer.setPixelRatio(1.0); // DPR cap 1.0
  renderer.setSize(window.innerWidth, window.innerHeight); // canvas CSS/native for HUD; composer handles render scale
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(1.0);
  composer.setSize(w, h);
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.28, 0.28);
  composer.addPass(bloomPass);
  postPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      tNoise: { value: grainTex },
      uTime: { value: 0 },
      uWarp: { value: 0.0 },
      uHue: { value: 0.0 },
      uCA: { value: 1.0 },
      uResolution: { value: new THREE.Vector2(w, h) },
    },
    vertexShader: postVertex,
    fragmentShader: postFragment,
  });
  composer.addPass(postPass);
  composer.addPass(new OutputPass());
}
setupComposer();

// Lights
scene.add(new THREE.AmbientLight(0x335577, 0.6));
const p1 = new THREE.PointLight(0x63e6ff, 2.2, 30); p1.position.set(0, 0, 0); scene.add(p1);
const p2 = new THREE.PointLight(0xa06bff, 1.2, 40); p2.position.set(6, 4, -6); scene.add(p2);

// Core
coreMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uPulse: { value: 0 },
    uColorA: { value: new THREE.Color(0x3a7bff) },
    uColorB: { value: new THREE.Color(0x63e6ff) },
  },
  vertexShader: coreVertex,
  fragmentShader: coreFragment,
  transparent: true,
});
core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 32), coreMat);
scene.add(core);
coreWire = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.55, 2),
  new THREE.MeshBasicMaterial({ color: 0xa06bff, wireframe: true, transparent: true, opacity: 0.18 })
);
scene.add(coreWire);

// Rings
for (let i = 0; i < 3; i++) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.1 + i * 0.55, 0.008, 8, 120),
    new THREE.MeshBasicMaterial({ color: i % 2 ? 0x63e6ff : 0xa06bff, transparent: true, opacity: 0.35 })
  );
  ring.rotation.x = Math.PI / (2.2 + i * 0.7);
  ring.rotation.y = i * 0.7;
  ring.userData = { speed: (i % 2 ? 1 : -1) * (0.12 + i * 0.05) };
  scene.add(ring);
  ringMeshes.push(ring);
}

// Nebula: allocate MAX once, adjust via setDrawRange (no rebuild)
nebulaGeo = new THREE.BufferGeometry();
const positions = new Float32Array(MAX_PARTICLES * 3);
const sizes = new Float32Array(MAX_PARTICLES);
const seeds = new Float32Array(MAX_PARTICLES);
for (let i = 0; i < MAX_PARTICLES; i++) {
  const r = 3.2 + Math.random() * 9.5;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
  positions[i*3+1] = r * Math.cos(phi) * 0.7;
  positions[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
  sizes[i] = 0.6 + Math.random() * 1.8;
  seeds[i] = Math.random();
}
nebulaGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
nebulaGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
nebulaGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
nebulaGeo.setDrawRange(0, 48000);
nebulaMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uPixelRatio: { value: 1.0 },
    uNoiseTex: { value: noiseTex },
    uColorA: { value: new THREE.Color(0x63e6ff) }, // blue-cyan
    uColorB: { value: new THREE.Color(0xa06bff) }, // purple
    uColorC: { value: new THREE.Color(0xff6bb3) }, // pink
  },
  vertexShader: nebulaVertex,
  fragmentShader: nebulaFragment,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
nebula = new THREE.Points(nebulaGeo, nebulaMat);
scene.add(nebula);

// Network agents
networkGroup = new THREE.Group();
scene.add(networkGroup);
pulseGroup = new THREE.Group();
scene.add(pulseGroup);

const AGENT_COUNT = 10;
const agentGeo = new THREE.SphereGeometry(0.13, 16, 16);
const agentMats = {
  ok: new THREE.MeshStandardMaterial({ color: 0x63e6ff, emissive: 0x1a6b88, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.4 }),
  busy: new THREE.MeshStandardMaterial({ color: 0xa06bff, emissive: 0x4a1f88, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.4 }),
  fail: new THREE.MeshStandardMaterial({ color: 0xff5c7a, emissive: 0x881a2e, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.4 }),
  paused: new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0x885a1a, emissiveIntensity: 1.0, roughness: 0.3, metalness: 0.4 }),
  selected: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x63e6ff, emissiveIntensity: 2.0, roughness: 0.2, metalness: 0.5 }),
};
const lineMatBase = new THREE.LineBasicMaterial({ color: 0x2f6f99, transparent: true, opacity: 0.35 });
const pulseGeo = new THREE.SphereGeometry(0.045, 8, 8);
const pulseMatBase = new THREE.MeshBasicMaterial({ color: 0x7ef7c4 });

function initAgents() {
  const R = 4.6;
  for (let i = 0; i < AGENT_COUNT; i++) {
    const a = (i / AGENT_COUNT) * Math.PI * 2;
    const y = Math.sin(i * 1.3) * 1.4;
    const pos = new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R);
    const mesh = new THREE.Mesh(agentGeo, agentMats.ok.clone());
    mesh.position.copy(pos);
    mesh.userData.base = pos.clone();
    mesh.userData.phase = Math.random() * Math.PI * 2;
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.22, 32), new THREE.MeshBasicMaterial({ color: 0x63e6ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
    mesh.add(halo);
    networkGroup.add(mesh);
    agents.push({ id: i, name: `AG-${String(i+1).padStart(2,'0')}`, mesh, status: 'ok', halo });
  }
  for (let i = 0; i < AGENT_COUNT; i++) {
    addLink(i, (i + 1) % AGENT_COUNT);
    if (i % 3 === 0) addLink(i, (i + 4) % AGENT_COUNT);
  }
  renderAgentList();
  updateCounts();
}
function addLink(a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([agents[a].mesh.position, agents[b].mesh.position]);
  const line = new THREE.Line(geo, lineMatBase.clone());
  line.userData = { a, b };
  networkGroup.add(line);
  linkLines.push(line);
}
initAgents();

function updateAgentMaterial(a) {
  const key = state.selected === a.id ? 'selected' : a.status;
  a.mesh.material.color.copy(agentMats[key].color);
  a.mesh.material.emissive.copy(agentMats[key].emissive);
  a.mesh.material.emissiveIntensity = agentMats[key].emissiveIntensity;
  a.halo.material.color.copy(agentMats[a.status].color);
}
function setStatus(id, status) {
  const a = agents[id]; if (!a) return;
  a.status = status;
  updateAgentMaterial(a);
  renderAgentList();
  updateCounts();
}
function renderAgentList() {
  if (!agentListEl) return;
  agentListEl.innerHTML = agents.map(a => `
    <li data-id="${a.id}" class="${state.selected===a.id?'selected':''}">
      <span class="name">${a.name}</span>
      <span class="st st-${a.status}">${a.status.toUpperCase()}</span>
    </li>`).join('');
}
function updateCounts() {
  if (activeCountEl) activeCountEl.textContent = agents.filter(a => a.status === 'busy' || a.status === 'ok').length;
  if (alertCountEl) alertCountEl.textContent = agents.filter(a => a.status === 'fail').length;
  state.alerts = agents.filter(a => a.status === 'fail').length;
}
function spawnPulse(a, b) {
  const m = new THREE.Mesh(pulseGeo, pulseMatBase.clone());
  m.userData = { a, b, t: 0, speed: 0.35 + Math.random() * 0.35 };
  pulseGroup.add(m);
  pulses.push(m);
}

// Agent list interaction
if (agentListEl) agentListEl.addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  const id = Number(li.dataset.id);
  state.selected = state.selected === id ? null : id;
  agents.forEach(updateAgentMaterial);
  renderAgentList();
  log(`Agent ${agents[id].name} ${state.selected===id?'selected':'deselected'} [Simulation]`);
});

// Controls (preserve existing behavior)
const byId = (id) => document.getElementById(id);
byId('btn-dispatch')?.addEventListener('click', () => {
  const idle = agents.filter(a => a.status === 'ok');
  if (!idle.length) { log('Dispatch skipped — no available agents [Simulation]'); return; }
  const count = Math.min(3, idle.length);
  for (let i = 0; i < count; i++) {
    const pick = idle[Math.floor(Math.random()*idle.length)];
    setStatus(pick.id, 'busy');
    log(`Mission dispatched to ${pick.name} [Simulation]`);
    const link = linkLines.find(l => l.userData.a === pick.id || l.userData.b === pick.id);
    if (link) spawnPulse(link.userData.a, link.userData.b);
    setTimeout(() => { if (agents[pick.id] && agents[pick.id].status === 'busy' && !state.paused) setStatus(pick.id, 'ok'); }, 2500 + Math.random()*2500);
  }
  if (coreMat) coreMat.uniforms.uPulse.value = 1.0;
});
byId('btn-pause')?.addEventListener('click', (e) => {
  state.paused = !state.paused;
  e.target.textContent = state.paused ? 'Resume' : 'Pause';
  agents.forEach(a => { if (a.status === 'busy') setStatus(a.id, state.paused ? 'paused' : 'busy'); });
  log(state.paused ? 'System paused [Simulation]' : 'System resumed [Simulation]');
});
byId('btn-fail')?.addEventListener('click', () => {
  const candidates = agents.filter(a => a.status !== 'fail');
  if (!candidates.length) return;
  const a = candidates[Math.floor(Math.random()*candidates.length)];
  setStatus(a.id, 'fail');
  log(`Failure simulated on ${a.name} [Simulation]`);
});
byId('btn-recover')?.addEventListener('click', () => {
  let target = state.selected != null ? agents[state.selected] : agents.find(a => a.status === 'fail');
  if (!target || target.status !== 'fail') { log('No failed agent to recover [Simulation]'); return; }
  setStatus(target.id, 'ok');
  log(`Agent ${target.name} recovered [Simulation]`);
});
byId('rot-speed')?.addEventListener('input', (e) => { state.rotationSpeed = Number(e.target.value); });
byId('zoom')?.addEventListener('input', (e) => { state.zoom = Number(e.target.value); }); // scroll/camera zoom preserved

// Warp / Hue / Bloom controls
byId('btn-bloom')?.addEventListener('click', (e) => {
  state.bloom = !state.bloom;
  e.target.classList.toggle('active', state.bloom);
  e.target.textContent = state.bloom ? 'Bloom: On' : 'Bloom: Off';
  if (bloomPass) bloomPass.enabled = state.bloom && qm.preset.bloomMip > 0;
  log(`Bloom ${state.bloom ? 'enabled' : 'disabled'} [Simulation]`);
});
byId('btn-warp')?.addEventListener('click', (e) => {
  state.warp = state.warp > 0.01 ? 0.0 : 0.12;
  e.target.classList.toggle('active', state.warp > 0.01);
  if (postPass) postPass.uniforms.uWarp.value = state.warp;
  log(`Warp ${state.warp > 0.01 ? 'enabled' : 'disabled'} [Simulation]`);
});
byId('hue')?.addEventListener('input', (e) => {
  state.hue = Number(e.target.value);
  if (postPass) postPass.uniforms.uHue.value = state.hue;
});

// Quality
const qualitySel = byId('quality');
if (qualitySel) {
  // ensure options exist for new profiles
  qualitySel.innerHTML = `<option value="auto" selected>Auto</option>
    <option value="high">High</option>
    <option value="balanced">Balanced</option>
    <option value="performance">Performance</option>
    <option value="mobile">Mobile</option>`;
  qualitySel.addEventListener('change', (e) => {
    qm.setMode(e.target.value);
    log(`Quality set to ${e.target.value} [Simulation]`);
  });
}

// Raycaster selection (pointer interaction preserved)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  if (!camera) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(agents.map(a => a.mesh));
  if (hits.length) {
    const id = agents.findIndex(a => a.mesh === hits[0].object);
    if (id >= 0) {
      state.selected = state.selected === id ? null : id;
      agents.forEach(updateAgentMaterial);
      renderAgentList();
      log(`Agent ${agents[id].name} ${state.selected===id?'selected':'deselected'} [Simulation]`);
    }
  }
});

// Quality application
function applyQuality(preset, level) {
  currentScale = preset.renderScale;
  // DPR cap 1.0
  renderer.setPixelRatio(1.0);
  // HUD keeps native resolution (canvas CSS size = window); render at scaled size
  renderer.setSize(window.innerWidth, window.innerHeight);
  const rw = Math.max(1, Math.floor(window.innerWidth * currentScale));
  const rh = Math.max(1, Math.floor(window.innerHeight * currentScale));
  if (composer) {
    composer.setPixelRatio(1.0);
    composer.setSize(rw, rh);
  }
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (bloomPass) {
    bloomPass.strength = preset.bloomStrength;
    bloomPass.radius = preset.bloomRadius;
    bloomPass.threshold = preset.bloomThreshold;
    bloomPass.enabled = state.bloom && preset.bloomMip > 0;
    // resolution follows composer render target
  }
  if (postPass && postPass.uniforms.uResolution) {
    postPass.uniforms.uResolution.value.set(rw, rh);
  }
  if (nebulaGeo) nebulaGeo.setDrawRange(0, preset.particles);
  if (nebulaMat) nebulaMat.uniforms.uPixelRatio.value = 1.0;
  if (qualityLabelEl) qualityLabelEl.textContent = `${preset.label}${qm && qm.mode === 'auto' ? ' (Auto)' : ''}`;
  if (scaleLabelEl) scaleLabelEl.textContent = currentScale.toFixed(2);
  if (particlesLabelEl) particlesLabelEl.textContent = preset.particles.toLocaleString();
}

qm = new QualityManager((preset, level, reason, avg) => {
  applyQuality(preset, level);
  if (qualityLabelEl) qualityLabelEl.textContent = `${preset.label}${qm.mode === 'auto' ? ' (Auto)' : ''}`;
  if (reason && reason !== 'manual' && reason !== 'auto') {
    log(`Quality ${reason} → ${preset.label}${avg ? ` (ema ${avg.toFixed(1)} fps)` : ''} [Simulation]`);
  }
});

applyQuality(qm.preset, qm.level);

// Resize: update renderer, composer, shader uniforms
window.addEventListener('resize', () => {
  if (!renderer || !camera) return;
  applyQuality(qm.preset, qm.level);
});

// Visibility / lifecycle: stop render loop when hidden, restart on visible (no multiple loops)
function stopLoop() {
  state.running = false;
  if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
}
function startLoop() {
  if (state.running) return;
  if (document.hidden) return;
  state.running = true;
  lastTime = performance.now();
  fpsLast = lastTime;
  fpsAccum = 0; fpsFrames = 0;
  animationId = requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => {
  state.visible = !document.hidden;
  if (document.hidden) stopLoop();
  else startLoop();
});

function loop(now) {
  if (!state.running) return;
  animationId = requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // FPS measurement reflects actual rendering
  fpsAccum += dt; fpsFrames++;
  const frameMs = dt * 1000;
  if (now - fpsLast >= 500) {
    const fps = fpsFrames / Math.max(fpsAccum, 0.001);
    if (fpsEl) fpsEl.textContent = fps.toFixed(0);
    if (frameLabelEl) frameLabelEl.textContent = frameMs.toFixed(1);
    qm.sample(fps, now);
    fpsAccum = 0; fpsFrames = 0; fpsLast = now;
  } else {
    if (frameLabelEl) frameLabelEl.textContent = frameMs.toFixed(1);
  }

  const t = now * 0.001;
  const motion = state.reducedMotion ? 0.15 : 1;
  const run = state.paused ? 0 : 1;

  if (coreMat) {
    coreMat.uniforms.uTime.value = t;
    coreMat.uniforms.uPulse.value *= 0.92;
  }
  if (core) core.rotation.y += 0.15 * dt * motion;
  if (coreWire) { coreWire.rotation.y -= 0.08 * dt * motion; coreWire.rotation.x += 0.05 * dt * motion; }
  if (nebulaMat) nebulaMat.uniforms.uTime.value = t;
  if (nebula) nebula.rotation.y += 0.02 * dt * motion * state.rotationSpeed;

  ringMeshes.forEach((ring) => {
    ring.rotation.z += ring.userData.speed * dt * motion * run;
    ring.rotation.x += ring.userData.speed * 0.5 * dt * motion * run;
  });

  // agent float & link update (preserve pointer/scroll interactions)
  if (networkGroup) networkGroup.rotation.y += 0.08 * dt * motion * state.rotationSpeed * run;
  agents.forEach((a) => {
    const b = a.mesh.userData.base;
    const ph = a.mesh.userData.phase;
    a.mesh.position.y = b.y + Math.sin(t * 0.8 + ph) * 0.12 * motion;
    if (a.halo) a.halo.lookAt(camera.position);
  });
  linkLines.forEach(l => {
    const pos = l.geometry.attributes.position;
    const pa = agents[l.userData.a].mesh.position;
    const pb = agents[l.userData.b].mesh.position;
    pos.setXYZ(0, pa.x, pa.y, pa.z);
    pos.setXYZ(1, pb.x, pb.y, pb.z);
    pos.needsUpdate = true;
  });

  // pulses
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    p.userData.t += dt * p.userData.speed * (state.paused ? 0.2 : 1);
    const tt = p.userData.t % 1;
    const pa = agents[p.userData.a].mesh.getWorldPosition(new THREE.Vector3());
    const pb = agents[p.userData.b].mesh.getWorldPosition(new THREE.Vector3());
    p.position.lerpVectors(pa, pb, tt);
    if (p.userData.t > 2.5) { pulseGroup.remove(p); pulses.splice(i,1); }
  }

  // camera zoom lerp (scroll/zoom control preserved)
  camera.position.z += (state.zoom - camera.position.z) * 0.05;
  camera.position.y += (4 - camera.position.y) * 0.05;
  camera.lookAt(0, 0, 0);

  if (postPass) {
    postPass.uniforms.uTime.value = t;
    postPass.uniforms.uWarp.value = state.warp;
    postPass.uniforms.uHue.value = state.hue;
  }

  // Render through composer (post + bloom). Bloom pass can be disabled while keeping other effects.
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

// Ambient mission pulses
setInterval(() => {
  if (state.paused || document.hidden || state.reducedMotion) return;
  if (linkLines.length) {
    const l = linkLines[Math.floor(Math.random()*linkLines.length)];
    spawnPulse(l.userData.a, l.userData.b);
  }
}, 1200);

log('NEXUS Command Center initialized [Simulation] (perf build)');
log('All agent activity is simulated. No real LLM execution.');

// Start single render loop
startLoop();
