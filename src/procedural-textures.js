const TAU = Math.PI * 2;

const NEBULA_COLORS = [
  { rgb: [153, 102, 255], weight: 1.0 },
  { rgb: [255, 102, 153], weight: 1.15 },
  { rgb: [255, 0, 0], weight: 0.5 },
  { rgb: [76, 114, 191], weight: 0.4 },
  { rgb: [102, 255, 153], weight: 0.26 }
];

const NEBULA = {
  width: 2048,
  height: 1024,
  base: [3, 2, 5],
  clusters: 12,
  spritesPerCluster: 22,
  washSprites: 8,
  spread: 0.45,
  latBand: 1.15,
  radiusBase: 0.045,
  radiusVariance: 0.85,
  gain: 0.085,
  knee: 55,
  kneeRange: 45,
  dither: 2.5
};

const NEBULA_TOTAL_WEIGHT = NEBULA_COLORS.reduce((sum, entry) => sum + entry.weight, 0);

// Same sequence as utils.js, with a snapshot for continuing after the star shells.
export function textureRandom(seed) {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  random.getState = () => a;
  return random;
}

function smoothstep(edge0, edge1, x) {
  const v = (x - edge0) / (edge1 - edge0);
  const t = v < 0 ? 0 : v > 1 ? 1 : v;
  return t * t * (3 - 2 * t);
}

function gaussian(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function pickNebulaColor(rng) {
  let r = rng() * NEBULA_TOTAL_WEIGHT;
  for (const entry of NEBULA_COLORS) {
    if (r < entry.weight) return entry;
    r -= entry.weight;
  }
  return NEBULA_COLORS[NEBULA_COLORS.length - 1];
}

function* buildSmokeBrush({ width, height, data }) {
  const density = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    density[i] = (data[i * 4] / 255) * (data[i * 4 + 3] / 255);
    if ((i + 1) % 8192 === 0) yield;
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

function* buildNebula(brush, rng) {
  const width = NEBULA.width;
  const height = NEBULA.height;
  const accum = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    accum[i * 3] = NEBULA.base[0];
    accum[i * 3 + 1] = NEBULA.base[1];
    accum[i * 3 + 2] = NEBULA.base[2];
    if ((i + 1) % 8192 === 0) yield;
  }

  // Keep sprite, wrap and pixel accumulation order: Float32 rounding is visible.
  const paintSprite = function* (x, y, rx, ry, rotation, rgb, alpha) {
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
        if ((py - y0 + 1) % 8 === 0) yield;
      }
    }
  };

  for (let c = 0; c < NEBULA.clusters; c += 1) {
    const entry = pickNebulaColor(rng);
    const az = ((c + rng() * 0.8) / NEBULA.clusters) * TAU;
    const lat = (rng() * 2 - 1) * NEBULA.latBand;

    for (let i = 0; i < NEBULA.spritesPerCluster; i += 1) {
      const sLat = Math.max(-1.35, Math.min(1.35, lat + gaussian(rng) * NEBULA.spread * 0.72));
      const sAz = az + gaussian(rng) * NEBULA.spread;
      const radiusFrac = NEBULA.radiusBase * (1 - NEBULA.radiusVariance * 0.5 + rng() * NEBULA.radiusVariance);
      const radius = radiusFrac * width;
      const stretch = 1 / Math.max(0.28, Math.cos(sLat));
      const alpha = NEBULA.gain * entry.weight * (0.45 + rng() * 1.0);
      yield* paintSprite(
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

  for (let i = 0; i < NEBULA.washSprites; i += 1) {
    const rgb = NEBULA_COLORS[i % NEBULA_COLORS.length].rgb;
    const sAz = ((i + rng() * 0.7) / NEBULA.washSprites) * TAU;
    const sLat = Math.asin(2 * rng() - 1) * 0.8;
    const radius = (0.06 + rng() * 0.09) * width;
    yield* paintSprite(
      (sAz / TAU) * width,
      (0.5 - sLat / Math.PI) * height,
      radius / Math.max(0.28, Math.cos(sLat)),
      radius,
      rng() * TAU,
      rgb,
      NEBULA.gain * 0.16
    );
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, o = 0; i < width * height; i += 1, o += 4) {
    const n = (rng() - 0.5) * NEBULA.dither;
    for (let c = 0; c < 3; c += 1) {
      let value = accum[i * 3 + c];
      if (value > NEBULA.knee) {
        value = NEBULA.knee + NEBULA.kneeRange * (1 - Math.exp(-(value - NEBULA.knee) / NEBULA.kneeRange));
      }
      value += n;
      data[o + c] = value < 0 ? 0 : value > 255 ? 255 : value;
    }
    data[o + 3] = 255;
    if ((i + 1) % 8192 === 0) yield;
  }
  return { width, height, data };
}

function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

function fbm(x, y, seed, octaves = 5) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * freq, y * freq, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function* makeCloud(size, seed) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);
      const v = y / (size - 1);
      const dx = (u - 0.5) * 2;
      const dy = (v - 0.5) * 2;
      const r = Math.sqrt(dx * dx + dy * dy);
      const falloff = 1 - smoothstep(0.36, 0.48, r);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      // Alpha is exactly zero outside support; keep RGB even for transparent texels.
      if (falloff === 0) continue;

      const wx = (fbm(u * 2.2 + seed, v * 2.2, seed + 5) - 0.5) * 1;
      const wy = (fbm(u * 2.2, v * 2.2 + seed, seed + 9) - 0.5) * 1;
      const body = fbm((u + wx) * 3, (v + wy) * 3, seed);
      const detail = fbm((u + wx) * 9, (v + wy) * 9, seed + 31);
      const density = body * (0.65 + 0.35 * detail);
      const alpha = smoothstep(0.3, 0.72, density) * falloff;
      data[i + 3] = Math.round(alpha * 255);
    }
    if ((y + 1) % 8 === 0) yield;
  }
  return { width: size, height: size, data };
}

function* makeCloudField(size, seed) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);
      const v = y / (size - 1);
      const wx = (fbm(u * 2.5, v * 2.5, seed + 5) - 0.5) * 0.9;
      const wy = (fbm(u * 2.5, v * 2.5, seed + 9) - 0.5) * 0.9;
      const body = fbm((u + wx) * 3.6, (v + wy) * 3.6, seed);
      const detail = fbm((u + wx) * 11, (v + wy) * 11, seed + 31);
      const density = body * (0.62 + 0.38 * detail);
      const alpha = smoothstep(0.32, 0.68, density);

      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(alpha * 255);
    }
    if ((y + 1) % 8 === 0) yield;
  }
  return { width: size, height: size, data };
}

// Yield points also let the no-Worker path run the identical computation in slices.
export function* generateProceduralTextures(job) {
  if (job.type === 'nebula') {
    const brush = yield* buildSmokeBrush(job.brush);
    return [yield* buildNebula(brush, textureRandom(job.seed))];
  }
  if (job.type === 'clouds') {
    const textures = [];
    for (let i = 0; i < 6; i += 1) {
      textures.push(yield* makeCloud(384, 11 + i * 37));
    }
    for (let i = 0; i < 2; i += 1) {
      textures.push(yield* makeCloudField(512, 97 + i * 131));
    }
    return textures;
  }
  throw new Error(`Unknown procedural texture job: ${job.type}`);
}
