import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { coreVertex, coreFragment, nebulaVertex, nebulaFragment } from './shaders/materials.js';
import { QualityManager } from './perf/QualityManager.js';

const canvas = document.getElementById('scene');
const fallbackEl = document.getElementById('fallback');
const logEl = document.getElementById('log');
const agentListEl = document.getElementById('agent-list');
const fpsEl = document.getElementById('fps');
const qualityLabelEl = document.getElementById('quality-label');
const activeCountEl = document.getElementById('active-count');
const alertCountEl = document.getElementById('alert-count');
const clockEl = document.getElementById('clock');

const state = {
  paused: false,
  rotationSpeed: 0.6,
  zoom: 13,
  selected: null,
  alerts: 0,
  running: true,
  visible: true,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

function log(msg) {
  const t = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.className = 'e';
  div.innerHTML = `<span class="t">[${t}]</span> ${msg}`;
  logEl.prepend(div);
  while (logEl.children.length > 80) logEl.lastChild.remove();
}
setInterval(() => { clockEl.textContent = new Date().toLocaleTimeString(); }, 1000);
clockEl.textContent = new Date().toLocaleTimeString();

let renderer, scene, camera, composer, bloomPass, renderPass;
let core, coreMat, nebula, nebulaMat, nebulaGeo;
let agents = [];
let links = [];
let pulses = [];
let networkGroup, pulseGroup;
let animationId = null;
let lastTime = performance.now();
let fpsAccum = 0, fpsFrames = 0, fpsLast = performance.now();
let qm;

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
} catch (e) {
  showFallback();
}
if (!renderer || !renderer.getContext()) showFallback();

function showFallback() {
  fallbackEl.classList.remove('hidden');
  log('WebGL unavailable/context lost — fallback mode (Simulation).');
  throw new Error('WebGL unavailable');
}

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  state.running = false;
  cancelAnimationFrame(animationId);
  fallbackEl.classList.remove('hidden');
  log('WebGL context lost — rendering halted (Simulation).');
});
canvas.addEventListener('webglcontextrestored', () => {
  fallbackEl.classList.add('hidden');
  log('WebGL context restored — reload recommended.');
});
document.getElementById('btn-reload').addEventListener('click', () => location.reload());

scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x040812, 0.035);
scene.background = new THREE.Color(0x040812);

camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 4, state.zoom);

renderer.setClearColor(0x040812, 1);

qm = new QualityManager((preset, level, reason, avg) => {
  applyQuality(preset);
  qualityLabelEl.textContent = `${preset.label}${qm.mode === 'auto' ? ' (Auto)' : ''}`;
  if (reason && reason !== 'manual' && reason !== 'auto') {
    log(`Quality ${reason} → ${preset.label}${avg ? ` (avg ${avg.toFixed(1)} fps)` : ''} [Simulation]`);
  }
});

function applyQuality(preset) {
  const dpr = Math.min(window.devicePixelRatio || 1, preset.dprCap);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  if (bloomPass) {
    const enabled = preset.bloom !== 'off';
    bloomPass.enabled = enabled;
    bloomPass.strength = enabled ? preset.bloomStrength : 0;
    bloomPass.radius = preset.bloomRadius || 0;
    bloomPass.threshold = preset.bloomThreshold || 1;
  }
  rebuildNebula(preset.particles);
}

// Postprocessing
composer = new EffectComposer(renderer);
renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.35, 0.2);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// Lights
const ambient = new THREE.AmbientLight(0x335577, 0.6);
scene.add(ambient);
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
const coreWire = new THREE.Mesh(
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
  links.push(ring);
}

// Nebula particles
function rebuildNebula(count) {
  if (nebula) { scene.remove(nebula); nebulaGeo.dispose(); nebulaMat.dispose(); }
  nebulaGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
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
  nebulaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uColorA: { value: new THREE.Color(0x63e6ff) },
      uColorB: { value: new THREE.Color(0xa06bff) },
    },
    vertexShader: nebulaVertex,
    fragmentShader: nebulaFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  nebula = new THREE.Points(nebulaGeo, nebulaMat);
  scene.add(nebula);
}

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
const lineMat = new THREE.LineBasicMaterial({ color: 0x2f6f99, transparent: true, opacity: 0.35 });
const pulseGeo = new THREE.SphereGeometry(0.045, 8, 8);
const pulseMat = new THREE.MeshBasicMaterial({ color: 0x7ef7c4 });

function initAgents() {
  const R = 4.6;
  for (let i = 0; i < AGENT_COUNT; i++) {
    const a = (i / AGENT_COUNT) * Math.PI * 2;
    const y = (Math.sin(i * 1.3) * 1.4);
    const pos = new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R);
    const mesh = new THREE.Mesh(agentGeo, agentMats.ok.clone());
    mesh.position.copy(pos);
    mesh.userData.base = pos.clone();
    mesh.userData.phase = Math.random() * Math.PI * 2;
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.22, 32), new THREE.MeshBasicMaterial({ color: 0x63e6ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
    halo.lookAt(0,0,0);
    mesh.add(halo);
    networkGroup.add(mesh);
    agents.push({ id: i, name: `AG-${String(i+1).padStart(2,'0')}`, mesh, status: 'ok', halo });
  }
  // connections ring + some chords
  const pts = agents.map(a => a.mesh.position);
  for (let i = 0; i < AGENT_COUNT; i++) {
    addLink(i, (i + 1) % AGENT_COUNT);
    if (i % 3 === 0) addLink(i, (i + 4) % AGENT_COUNT);
  }
  renderAgentList();
}
function addLink(a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([agents[a].mesh.position, agents[b].mesh.position]);
  const line = new THREE.Line(geo, lineMat.clone());
  line.userData = { a, b };
  networkGroup.add(line);
  links.push(line);
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
  agentListEl.innerHTML = agents.map(a => `
    <li data-id="${a.id}" class="${state.selected===a.id?'selected':''}">
      <span class="name">${a.name}</span>
      <span class="st st-${a.status}">${a.status.toUpperCase()}</span>
    </li>`).join('');
}
agentListEl.addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  const id = Number(li.dataset.id);
  state.selected = state.selected === id ? null : id;
  agents.forEach(updateAgentMaterial);
  renderAgentList();
  log(`Agent ${agents[id].name} ${state.selected===id?'selected':'deselected'} [Simulation]`);
});

function updateCounts() {
  activeCountEl.textContent = agents.filter(a => a.status === 'busy' || a.status === 'ok').length;
  alertCountEl.textContent = agents.filter(a => a.status === 'fail').length;
  state.alerts = Number(alertCountEl.textContent);
}
updateCounts();

function spawnPulse(a, b) {
  const m = new THREE.Mesh(pulseGeo, pulseMat.clone());
  m.userData = { a, b, t: 0, speed: 0.35 + Math.random() * 0.35 };
  pulseGroup.add(m);
  pulses.push(m);
}

// Controls
document.getElementById('btn-dispatch').addEventListener('click', () => {
  const idle = agents.filter(a => a.status === 'ok');
  if (!idle.length) { log('Dispatch skipped — no available agents [Simulation]'); return; }
  const count = Math.min(3, idle.length);
  for (let i = 0; i < count; i++) {
    const a = idle[Math.floor(Math.random()*idle.length)];
    setStatus(a.id, 'busy');
    log(`Mission dispatched to ${a.name} [Simulation]`);
    const link = links.find(l => l.userData.a === a.id || l.userData.b === a.id);
    if (link) spawnPulse(link.userData.a, link.userData.b);
    setTimeout(() => { if (agents[a.id].status === 'busy' && !state.paused) setStatus(a.id, 'ok'); }, 2500 + Math.random()*2500);
  }
  coreMat.uniforms.uPulse.value = 1.0;
});
document.getElementById('btn-pause').addEventListener('click', (e) => {
  state.paused = !state.paused;
  e.target.textContent = state.paused ? 'Resume' : 'Pause';
  agents.forEach(a => { if (a.status === 'busy') setStatus(a.id, state.paused ? 'paused' : 'busy'); });
  log(state.paused ? 'System paused [Simulation]' : 'System resumed [Simulation]');
});
document.getElementById('btn-fail').addEventListener('click', () => {
  const candidates = agents.filter(a => a.status !== 'fail');
  if (!candidates.length) return;
  const a = candidates[Math.floor(Math.random()*candidates.length)];
  setStatus(a.id, 'fail');
  log(`Failure simulated on ${a.name} [Simulation]`);
});
document.getElementById('btn-recover').addEventListener('click', () => {
  let target = state.selected != null ? agents[state.selected] : agents.find(a => a.status === 'fail');
  if (!target || target.status !== 'fail') { log('No failed agent to recover [Simulation]'); return; }
  setStatus(target.id, 'ok');
  log(`Agent ${target.name} recovered [Simulation]`);
});
document.getElementById('rot-speed').addEventListener('input', (e) => { state.rotationSpeed = Number(e.target.value); });
document.getElementById('zoom').addEventListener('input', (e) => { state.zoom = Number(e.target.value); });
document.getElementById('quality').addEventListener('change', (e) => {
  qm.setMode(e.target.value);
  log(`Quality set to ${e.target.value} [Simulation]`);
});

// Raycaster selection
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(agents.map(a => a.mesh));
  if (hits.length) {
    const id = agents.findIndex(a => a.mesh === hits[0].object);
    if (id >= 0) { state.selected = state.selected === id ? null : id; agents.forEach(updateAgentMaterial); renderAgentList(); log(`Agent ${agents[id].name} ${state.selected===id?'selected':'deselected'} [Simulation]`); }
  }
});

// Visibility / lifecycle
document.addEventListener('visibilitychange', () => {
  state.visible = !document.hidden;
  if (state.visible) { lastTime = performance.now(); if (state.running) loop(lastTime); }
  else { cancelAnimationFrame(animationId); }
});
const io = new IntersectionObserver((entries) => {
  const vis = entries[0]?.isIntersecting;
  if (vis === false) { state.visible = false; cancelAnimationFrame(animationId); }
  else if (vis === true && !document.hidden) { state.visible = true; lastTime = performance.now(); if (state.running) loop(lastTime); }
}, { threshold: 0.05 });
io.observe(canvas);

window.addEventListener('resize', () => {
  applyQuality(qm.preset);
});

applyQuality(qm.preset);
qualityLabelEl.textContent = `${qm.preset.label} (Auto)`;
log('NEXUS Command Center initialized [Simulation]');
log('All agent activity is simulated. No real LLM execution.');

function loop(now) {
  if (!state.running || !state.visible) return;
  animationId = requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // FPS
  fpsAccum += dt; fpsFrames++;
  if (now - fpsLast >= 500) {
    const fps = fpsFrames / fpsAccum;
    fpsEl.textContent = fps.toFixed(0);
    qm.sample(fps, now);
    fpsAccum = 0; fpsFrames = 0; fpsLast = now;
  }

  const t = now * 0.001;
  const motion = state.reducedMotion ? 0.15 : 1;
  const run = state.paused ? 0 : 1;

  coreMat.uniforms.uTime.value = t;
  coreMat.uniforms.uPulse.value *= 0.92;
  core.rotation.y += 0.15 * dt * motion;
  coreWire.rotation.y -= 0.08 * dt * motion;
  coreWire.rotation.x += 0.05 * dt * motion;
  if (nebulaMat) {
    nebulaMat.uniforms.uTime.value = t;
    nebulaMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }
  if (nebula) nebula.rotation.y += 0.02 * dt * motion * state.rotationSpeed;

  links.forEach((obj) => {
    if (obj.isMesh && obj.userData.speed) {
      obj.rotation.z += obj.userData.speed * dt * motion * run;
      obj.rotation.x += obj.userData.speed * 0.5 * dt * motion * run;
    }
  });

  // agent float & link update
  networkGroup.rotation.y += 0.08 * dt * motion * state.rotationSpeed * run;
  agents.forEach((a, i) => {
    const b = a.mesh.userData.base;
    const ph = a.mesh.userData.phase;
    a.mesh.position.y = b.y + Math.sin(t * 0.8 + ph) * 0.12 * motion;
    a.halo.lookAt(camera.position);
  });
  links.forEach(l => {
    if (l.isLine) {
      const pos = l.geometry.attributes.position;
      const pa = agents[l.userData.a].mesh.position;
      const pb = agents[l.userData.b].mesh.position;
      pos.setXYZ(0, pa.x, pa.y, pa.z);
      pos.setXYZ(1, pb.x, pb.y, pb.z);
      pos.needsUpdate = true;
    }
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

  // camera zoom lerp
  const targetZ = state.zoom;
  camera.position.z += (targetZ - camera.position.z) * 0.05;
  camera.position.y += (4 - camera.position.y) * 0.05;
  camera.lookAt(0, 0, 0);

  if (bloomPass && bloomPass.enabled) composer.render();
  else renderer.render(scene, camera);
}

animationId = requestAnimationFrame(loop);

// ambient mission pulses
setInterval(() => {
  if (state.paused || !state.visible || state.reducedMotion) return;
  if (links.length) {
    const l = links[Math.floor(Math.random()*links.length)];
    if (l.isLine) spawnPulse(l.userData.a, l.userData.b);
  }
}, 1200);
