export const QUALITY_PRESETS = {
  high:   { label: 'High',   particles: 16000, dprCap: 1.25, bloom: 'on',   bloomStrength: 0.9,  bloomRadius: 0.35, bloomThreshold: 0.2, target: [60, 60] },
  medium: { label: 'Medium', particles: 8000,  dprCap: 1.0,  bloom: 'weak', bloomStrength: 0.35, bloomRadius: 0.2,  bloomThreshold: 0.35, target: [45, 60] },
  low:    { label: 'Low',    particles: 3000,  dprCap: 0.75, bloom: 'off',  bloomStrength: 0,    bloomRadius: 0,    bloomThreshold: 1, target: [30, 45] },
};

const ORDER = ['low', 'medium', 'high'];

export class QualityManager {
  constructor(onChange) {
    this.onChange = onChange;
    this.mode = 'auto'; // auto | high | medium | low
    this.level = this.pickInitial();
    this.samples = [];
    this.lastAdjust = 0;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  pickInitial() {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    if (cores <= 4 || mem <= 4) return 'medium';
    return 'high';
  }

  get preset() { return QUALITY_PRESETS[this.level]; }

  setMode(mode) {
    this.mode = mode;
    if (mode !== 'auto') {
      this.level = mode;
      this.samples = [];
      this.onChange(this.preset, this.level, 'manual');
    } else {
      this.onChange(this.preset, this.level, 'auto');
    }
  }

  sample(fps, now) {
    if (this.mode !== 'auto') return;
    this.samples.push(fps);
    if (this.samples.length > 90) this.samples.shift();
    if (this.samples.length < 45) return;
    if (now - this.lastAdjust < 4000) return;
    const avg = this.samples.reduce((a,b)=>a+b,0) / this.samples.length;
    const idx = ORDER.indexOf(this.level);
    if (avg < (this.level === 'high' ? 48 : 32) && idx > 0) {
      this.level = ORDER[idx - 1];
      this.lastAdjust = now;
      this.samples = [];
      this.onChange(this.preset, this.level, 'downgrade', avg);
    } else if (avg > (this.level === 'low' ? 55 : 58) && idx < 2) {
      this.level = ORDER[idx + 1];
      this.lastAdjust = now;
      this.samples = [];
      this.onChange(this.preset, this.level, 'upgrade', avg);
    }
  }
}
