import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const invlerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);

export function shortestAngle(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function latLonToVector3(lat, lon, radius = 1, target = new THREE.Vector3()) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  const sp = Math.sin(phi);
  return target.set(
    -radius * sp * Math.cos(theta),
    radius * Math.cos(phi),
    radius * sp * Math.sin(theta)
  );
}

export function sphericalToVector3(dist, az, el, target = new THREE.Vector3()) {
  const c = Math.cos(el);
  return target.set(
    dist * c * Math.sin(az),
    dist * Math.sin(el),
    dist * c * Math.cos(az)
  );
}

export function vectorToSpherical(v) {
  const dist = v.length();
  if (dist < 1e-8) return { dist: 0, az: 0, el: 0 };
  const el = Math.asin(clamp(v.y / dist, -1, 1));
  const az = Math.atan2(v.x, v.z);
  return { dist, az, el };
}

export function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function canvasTexture(canvas, { srgb = true, repeatX = false, flipY = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = flipY;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function invertImageIntoCanvas(image) {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 255 - px[i];
    px[i + 1] = 255 - px[i + 1];
    px[i + 2] = 255 - px[i + 2];
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export function imageToCanvas(image) {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function disposeObject(root) {
  root.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const key of Object.keys(material)) {
          const value = material[key];
          if (value && value.isTexture) value.dispose();
        }
        material.dispose();
      }
    }
  });
}

/**
 * Tiny time-clock used to remap real wall-clock seconds into a local
 * "director" clock that can be paused, scaled, or rewound without rebuilding
 * the GSAP timeline. The director records a `_t0` when a timeline starts and
 * asks the clock for the current local second via `clock.toLocal(t0, real)`.
 *
 * scale: 1 = real-time, 0.5 = half-speed, 0 = paused.
 */
export class TimelineClock {
  constructor() {
    this.scale = 1;
    this.offset = 0; // seconds, accumulated pause gap
    this._pauseAt = -1; // real time at which pause started, -1 if not paused
  }
  toLocal(t0, real = performance.now() / 1000) {
    if (this._pauseAt >= 0) {
      // Freeze accumulation at the pause instant.
      real = this._pauseAt;
    }
    const elapsed = (real - t0 - this.offset) * this.scale;
    return Math.max(0, elapsed);
  }
  pause(real = performance.now() / 1000) {
    if (this._pauseAt >= 0) return;
    this._pauseAt = real;
  }
  resume(real = performance.now() / 1000) {
    if (this._pauseAt < 0) return;
    this.offset += real - this._pauseAt;
    this._pauseAt = -1;
  }
  setScale(scale) {
    this.scale = scale;
  }
}

/**
 * Rolling FPS monitor with hysteresis. Calls `onDownshift` when FPS has been
 * under LOW for >= 1.2s, and `onUpshift` when FPS recovers to >= HIGH for the
 * same window. Cooldown prevents flapping.
 */
export function createPerfMonitor({ onDownshift, onUpshift, low = 48, high = 58 } = {}) {
  const window = []; // {t, dt}
  let lastTrigger = 0;
  function push(dt) {
    const real = performance.now() / 1000;
    window.push({ real, dt });
    while (window.length && real - window[0].real > 1.2) window.shift();
    if (window.length < 12) return;
    if (real - lastTrigger < 6) return;
    const fps = window.length / (real - window[0].real);
    if (fps < low && onDownshift) {
      lastTrigger = real;
      window.length = 0;
      onDownshift();
    } else if (fps > high && onUpshift) {
      lastTrigger = real;
      window.length = 0;
      onUpshift();
    }
  }
  return {
    sample(delta) { push(delta); },
    reset() { window.length = 0; lastTrigger = 0; }
  };
}

/**
 * Hand-authored cubic-bezier-like easings, registered with GSAP via
 * `parseEase`. The free GSAP build shipped here doesn't include
 * `CustomEase` (that's a Club GreenSock plugin), so we express the curves
 * as inline functions.
 *
 * The curves are sampled at ~64 points and piecewise-lerped; this is
 * perceptually identical to the analytic ease and roughly 0.05 ms / lookup.
 */
function makeBezierEase(x1, y1, x2, y2, samples = 64) {
  // Solve cubic Bezier B(t) for a given x.
  // Reference: https://pomax.github.io/bezierinfo/#yforx
  const lut = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = i / (samples - 1);
    let t = x;
    for (let iter = 0; iter < 8; iter += 1) {
      const cx = 3 * t * (1 - t) * (1 - t) * x1 + 3 * t * t * (1 - t) * x2 + t * t * t - x;
      const cdx = 3 * (1 - t) * (1 - t) * x1 + 6 * t * (1 - t) * (x2 - x1) + 3 * t * t * (1 - x2);
      if (Math.abs(cdx) < 1e-6) break;
      t -= cx / cdx;
      t = Math.max(0, Math.min(1, t));
    }
    const y = 3 * t * (1 - t) * (1 - t) * y1 + 3 * t * t * (1 - t) * y2 + t * t * t;
    lut[i] = y;
  }
  return function easeOut(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const f = t * (samples - 1);
    const i = Math.floor(f);
    const a = lut[i];
    const b = lut[Math.min(samples - 1, i + 1)];
    return a + (b - a) * (f - i);
  };
}

/**
 * Register two cinematic easings used in the camera director:
 *   'cinemaOut' - ease-out quint feel (slow end, cinematic settle)
 *   'cinemaInOut' - ease-in-out with a 30% ease-in, 70% ease-out
 *
 * Must be called once at startup before any timeline that uses them.
 */
let cinematicEasesRegistered = false;
export function registerCinematicEases(gsap) {
  if (cinematicEasesRegistered) return;
  cinematicEasesRegistered = true;
  const out = makeBezierEase(0.22, 1, 0.36, 1);    // easeOutQuint
  const inOut = makeBezierEase(0.65, 0, 0.35, 1); // easeInOutCirc-ish
  if (gsap && gsap.parseEase) {
    gsap.parseEase('cinemaOut', out);
    gsap.parseEase('cinemaInOut', inOut);
  }
}
