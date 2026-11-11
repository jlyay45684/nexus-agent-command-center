export const QUALITY_PRESETS = {
  high:        { label: 'High',        particles: 70000, renderScale: 1.00, bloomMip: 3, bloomStrength: 0.75, bloomRadius: 0.35, bloomThreshold: 0.22 },
  balanced:    { label: 'Balanced',    particles: 48000, renderScale: 0.82, bloomMip: 3, bloomStrength: 0.55, bloomRadius: 0.28, bloomThreshold: 0.28 },
  performance: { label: 'Performance', particles: 28000, renderScale: 0.68, bloomMip: 2, bloomStrength: 0.35, bloomRadius: 0.22, bloomThreshold: 0.35 },
  mobile:      { label: 'Mobile',      particles: 20000, renderScale: 0.60, bloomMip: 2, bloomStrength: 0.20, bloomRadius: 0.18, bloomThreshold: 0.42 },
};

export const QUALITY_ORDER = ['mobile', 'performance', 'balanced', 'high'];

export class QualityManager {
  constructor(onChange) {
    this.onChange = onChange;
    this.mode = 'auto'; // auto | preset key
    this.level = 'balanced'; // initial Balanced
    this.ema = 60;
    this.alpha = 0.12; // FPS EMA smoothing
    this.low45Since = 0;
    this.low38Since = 0;
    this.high58Since = 0;
    this.cooldownUntil = 0;
    this.lastTime = 0;
  }

  get preset() { return QUALITY_PRESETS[this.level]; }

  setMode(mode) {
    this.mode = mode;
    this.low45Since = this.low38Since = this.high58Since = 0;
    if (mode !== 'auto' && QUALITY_PRESETS[mode]) {
      this.level = mode;
    }
    this.onChange(this.preset, this.level, 'manual');
  }

  sample(fps, now) {
    if (!this.lastTime) this.lastTime = now;
    const dt = Math.max(0.001, (now - this.lastTime) / 1000);
    this.lastTime = now;
    // EMA
    this.ema = this.alpha * fps + (1 - this.alpha) * this.ema;

    if (this.mode !== 'auto') return;
    if (now < this.cooldownUntil) return;

    const idx = QUALITY_ORDER.indexOf(this.level);
    const canDown = idx > 0;
    const canUp = idx < QUALITY_ORDER.length - 1;

    // sustained timers
    if (this.ema < 45) { if (!this.low45Since) this.low45Since = now; } else { this.low45Since = 0; }
    if (this.ema < 38) { if (!this.low38Since) this.low38Since = now; } else { this.low38Since = 0; }
    if (this.ema > 58) { if (!this.high58Since) this.high58Since = now; } else { this.high58Since = 0; }

    // priority: particle drop on sustained <38 (>=1.5s), then render scale down on sustained <45
    if (this.low38Since && (now - this.low38Since) >= 1500 && canDown) {
      this.level = QUALITY_ORDER[idx - 1];
      this._afterAdjust(now, 'fps<38');
      return;
    }
    if (this.low45Since && (now - this.low45Since) >= 1200 && canDown) {
      // lower render scale first by stepping down one profile (profiles couple scale+particles; step down gives lower cost)
      // but spec states "lower Render Scale" on <45, "lower particle level" on <38 - both map to profile step
      this.level = QUALITY_ORDER[idx - 1];
      this._afterAdjust(now, 'fps<45');
      return;
    }
    if (this.high58Since && (now - this.high58Since) >= 10000 && canUp) {
      this.level = QUALITY_ORDER[idx + 1];
      this._afterAdjust(now, 'fps>58 stable');
    }
  }

  _afterAdjust(now, reason) {
    this.low45Since = this.low38Since = this.high58Since = 0;
    this.cooldownUntil = now + 5000; // 5s cooldown
    this.ema = 50; // dampen to avoid oscillation
    this.onChange(this.preset, this.level, reason, this.ema);
  }
}
