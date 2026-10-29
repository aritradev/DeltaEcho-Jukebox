import * as THREE from 'three';
import { mulberry32, createCanvas, canvasTexture, TAU } from './utils.js';

const SHELLS = [
  { radius: 900, count: 820, size: [0.8, 1.9], brightness: [0.34, 0.72], warm: 0.1 },
  { radius: 1700, count: 620, size: [0.65, 1.45], brightness: [0.22, 0.5], warm: 0.16 },
  { radius: 2900, count: 420, size: [0.5, 1.1], brightness: [0.13, 0.32], warm: 0.2 }
];

// Nebula palette, matching the reference build. The weights bias the sky
// towards maroon and violet; green and blue stay as faint accents.
const NEBULA_COLORS = [
  { rgb: [153, 102, 255], weight: 1.0 }, // violet
  { rgb: [255, 102, 153], weight: 1.15 }, // rose
  { rgb: [255, 0, 0], weight: 0.5 }, // red
  { rgb: [76, 114, 191], weight: 0.4 }, // blue
  { rgb: [102, 255, 153], weight: 0.26 } // green
];

const NEBULA = {
  width: 2048,
  height: 1024,
  base: [3, 2, 5],
  clusters: 12, // spread evenly around the sky so no direction is empty
  spritesPerCluster: 22,
  washSprites: 8, // faint fallback so no view is ever pure black
  spread: 0.45, // angular sigma of a cluster, radians
  latBand: 1.15, // how far from the equator a cluster centre may sit, radians
  radiusBase: 0.045, // sprite radius as a fraction of map width (~32 degrees)
  radiusVariance: 0.85,
  gain: 0.085,
  knee: 55,
  kneeRange: 45,
  dither: 2.5
};

const STAR_VERT = `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vBright;
void main() {
  vColor = aColor;
  float breathe = 0.96 + 0.04 * sin(uTime * 0.22 + aPhase * 6.28318);
  vBright = breathe;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = max(1.0, -mv.z);
  gl_PointSize = aSize * uPixelRatio * (1.0 + 70.0 / depth);
  gl_Position = projectionMatrix * mv;
}
`;

const STAR_FRAG = `
varying vec3 vColor;
varying float vBright;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float core = smoothstep(0.5, 0.02, r);
  float halo = smoothstep(0.5, 0.2, r) * 0.35;
  float a = core + halo;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * vBright, a);
}
`;

function buildShell(def, rng) {
  const count = def.count;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const cool = new THREE.Color(0xbfd6ff);
  const white = new THREE.Color(0xfff6ec);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const u = rng();
    const v = rng();
    const theta = u * TAU;
    const cosPhi = 2 * v - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const jitter = 1 + (rng() - 0.5) * 0.06;
    positions[i * 3] = def.radius * sinPhi * Math.cos(theta) * jitter;
    positions[i * 3 + 1] = def.radius * sinPhi * Math.sin(theta) * jitter;
    positions[i * 3 + 2] = def.radius * cosPhi * jitter;

    const t = rng();
    sizes[i] = def.size[0] + (def.size[1] - def.size[0]) * Math.pow(t, 2.4);
    phases[i] = rng();

    const warmth = rng();
    tmp.copy(white).lerp(cool, Math.min(1, warmth / Math.max(0.001, def.warm) * 0.55 + rng() * 0.4));
    const b = def.brightness[0] + (def.brightness[1] - def.brightness[0]) * Math.pow(rng(), 1.6);
    colors[i * 3] = tmp.r * b;
    colors[i * 3 + 1] = tmp.g * b;
    colors[i * 3 + 2] = tmp.b * b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 }
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  return new THREE.Points(geometry, material);
}

function gaussian(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

const NEBULA_TOTAL_WEIGHT = NEBULA_COLORS.reduce((sum, entry) => sum + entry.weight, 0);

function pickNebulaColor(rng) {
  let r = rng() * NEBULA_TOTAL_WEIGHT;
  for (const entry of NEBULA_COLORS) {
    if (r < entry.weight) return entry;
    r -= entry.weight;
  }
  return NEBULA_COLORS[NEBULA_COLORS.length - 1];
}

/**
 * Turns the smoke sprite into a grayscale density map. The reference nebula is
 * built from this texture, so the cloud structure comes from the image itself
 * rather than from any falloff we would have to invent.
 */
function buildSmokeBrush(image) {
  const width = image.width;
  const height = image.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const density = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    // Additive blending multiplies colour by alpha, so that is the visible weight.
    density[i] = (pixels[i * 4] / 255) * (pixels[i * 4 + 3] / 255);
  }
  return { width, height, density };
}

function sampleBrush(brush, u, v) {
  if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return 0;
  const { width, height, density } = brush;
  const x = u * width - 0.5;
  const y = v * height - 0.5;
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = density[y0 * width + x0];
  const b = density[y0 * width + x1];
  const c = density[y1 * width + x0];
  const d = density[y1 * width + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/**
 * Bakes the smoke-brush nebula into one equirectangular skybox texture, so the
 * whole backdrop costs a single draw call and no extra overdraw.
 *
 * Accumulation happens in a float buffer and is written once. Canvas additive
 * blending rounds every sprite to 8 bits, and with this many faint overlaps
 * those roundings line up into a visible lattice, so painting directly is not
 * an option.
 */
function buildNebulaTexture(brush, rng) {
  const width = NEBULA.width;
  const height = NEBULA.height;
  const accum = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    accum[i * 3] = NEBULA.base[0];
    accum[i * 3 + 1] = NEBULA.base[1];
    accum[i * 3 + 2] = NEBULA.base[2];
  }

  // Sprites are stamped three times so the horizontal wrap stays seamless.
  const paintSprite = (x, y, rx, ry, rotation, rgb, alpha) => {
    if (alpha <= 0) return;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (const offset of [-width, 0, width]) {
      const cx = x + offset;
      if (cx + rx < 0 || cx - rx > width) continue;
      const x0 = Math.max(0, Math.floor(cx - rx));
      const x1 = Math.min(width - 1, Math.ceil(cx + rx));
      const y0 = Math.max(0, Math.floor(y - ry));
      const y1 = Math.min(height - 1, Math.ceil(y + ry));
      for (let py = y0; py <= y1; py += 1) {
        const dy = (py + 0.5 - y) / ry;
        if (dy <= -1 || dy >= 1) continue;
        const row = py * width;
        for (let px = x0; px <= x1; px += 1) {
          const dx = (px + 0.5 - cx) / rx;
          if (dx <= -1 || dx >= 1) continue;
          const sx = dx * cos + dy * sin;
          const sy = -dx * sin + dy * cos;
          if (sx <= -1 || sx >= 1 || sy <= -1 || sy >= 1) continue;
          const density = sampleBrush(brush, sx * 0.5 + 0.5, sy * 0.5 + 0.5);
          if (density <= 0.001) continue;
          const k = density * alpha;
          const i = (row + px) * 3;
          accum[i] += rgb[0] * k;
          accum[i + 1] += rgb[1] * k;
          accum[i + 2] += rgb[2] * k;
        }
      }
    }
  };

  // Clusters are stratified by azimuth and carry one palette colour each, which
  // is what produces maroon in one part of the sky and violet in another.
  for (let c = 0; c < NEBULA.clusters; c += 1) {
    const entry = pickNebulaColor(rng);
    const az = ((c + rng() * 0.8) / NEBULA.clusters) * TAU;
    const lat = (rng() * 2 - 1) * NEBULA.latBand;

    for (let i = 0; i < NEBULA.spritesPerCluster; i += 1) {
      const sLat = Math.max(-1.35, Math.min(1.35, lat + gaussian(rng) * NEBULA.spread * 0.72));
      const sAz = az + gaussian(rng) * NEBULA.spread;
      const radiusFrac = NEBULA.radiusBase * (1 - NEBULA.radiusVariance * 0.5 + rng() * NEBULA.radiusVariance);
      const radius = radiusFrac * width;
      // Widen near the poles so the sprite stays round once the sphere is
      // curved back out of the equirectangular map.
      const stretch = 1 / Math.max(0.28, Math.cos(sLat));
      const alpha = NEBULA.gain * entry.weight * (0.45 + rng() * 1.0);
      paintSprite(
        (sAz / TAU) * width,
        (0.5 - sLat / Math.PI) * height,
        radius * stretch,
        radius,
        rng() * TAU,
        entry.rgb,
        alpha
      );
    }
  }

  // A faint wash so the sky is never flat black in any direction.
  for (let i = 0; i < NEBULA.washSprites; i += 1) {
    const rgb = NEBULA_COLORS[i % NEBULA_COLORS.length].rgb;
    const sAz = ((i + rng() * 0.7) / NEBULA.washSprites) * TAU;
    const sLat = Math.asin(2 * rng() - 1) * 0.8;
    const radius = (0.06 + rng() * 0.09) * width;
    paintSprite(
      (sAz / TAU) * width,
      (0.5 - sLat / Math.PI) * height,
      radius / Math.max(0.28, Math.cos(sLat)),
      radius,
      rng() * TAU,
      rgb,
      NEBULA.gain * 0.16
    );
  }

  // Where clusters overlap the additive sum can exceed a sane brightness. A soft
  // knee rolls those highlights off smoothly instead of clipping to a hot core.
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const px = image.data;
  for (let i = 0, o = 0; i < width * height; i += 1, o += 4) {
    // A light per-pixel dither hides 8-bit banding in the darkest gradients.
    const n = (rng() - 0.5) * NEBULA.dither;
    for (let c = 0; c < 3; c += 1) {
      let value = accum[i * 3 + c];
      if (value > NEBULA.knee) {
        value = NEBULA.knee + NEBULA.kneeRange * (1 - Math.exp(-(value - NEBULA.knee) / NEBULA.kneeRange));
      }
      value += n;
      px[o + c] = value < 0 ? 0 : value > 255 ? 255 : value;
    }
    px[o + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  const texture = canvasTexture(canvas, { srgb: true });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

export class Starfield {
  constructor(pixelRatio, smokeTexture) {
    this.group = new THREE.Group();
    this.shells = [];
    this.spin = new THREE.Group();
    this.group.add(this.spin);

    const rng = mulberry32(20260925);
    for (const def of SHELLS) {
      const points = buildShell(def, rng);
      points.material.uniforms.uPixelRatio.value = pixelRatio;
      points.frustumCulled = false;
      this.shells.push(points);
      this.spin.add(points);
    }

    const brush = smokeTexture && smokeTexture.image ? buildSmokeBrush(smokeTexture.image) : null;
    if (brush) {
      const backdropGeometry = new THREE.SphereGeometry(5200, 48, 32);
      const backdropMaterial = new THREE.MeshBasicMaterial({
        map: buildNebulaTexture(brush, rng),
        color: 0xffffff,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false
      });
      this.backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial);
      this.backdrop.frustumCulled = false;
      this.backdrop.renderOrder = -10;
      this.spin.add(this.backdrop);
    } else {
      console.warn('nebula brush unavailable; backdrop disabled');
    }
  }

  update(elapsed, camera) {
    this.group.position.copy(camera.position);
    this.spin.rotation.y = elapsed * 0.0035;
    this.spin.rotation.x = Math.sin(elapsed * 0.0016) * 0.02;
    for (const shell of this.shells) {
      shell.material.uniforms.uTime.value = elapsed;
    }
  }

  setPixelRatio(ratio) {
    for (const shell of this.shells) {
      shell.material.uniforms.uPixelRatio.value = ratio;
    }
  }
}
