// The Studio filmstrips: one 256x256 frame per cell, baked into a single sprite
// sheet so playback needs no network at runtime. Three presets are available:
// the original 130-frame monthly MODIS decade for Cox's Bazar, plus two 27-frame
// annual NASA EIC series for Mount Everest and the Pacific Northwest wildfires.
//
// Frame order is chronological, so the date label is arithmetic on the index.
// Monthly presets step by month from `firstMonth`; yearly presets step by year
// and keep `firstMonth` as the fixed acquisition month. The sheet is read once at
// load time and every cell is reduced to a small feature vector, which is what
// the synth actually consumes. Nothing below the feature extraction sees pixels.

export const FILMSTRIP_PRESETS = Object.freeze({
  coxs_bazar: Object.freeze({
    id: 'coxs_bazar',
    title: "Cox's Bazar · 2000–2010 (MODIS Monthly)",
    src: './assets/textures/coxs-bazar-decade.jpg',
    cols: 13,
    rows: 10,
    cell: 256,
    frames: 130,
    firstYear: 2000,
    firstMonth: 3,
    stepMode: 'monthly',
    sourceCredit: 'NASA GIBS MODIS Terra true-colour + NASA POWER MERRA-2'
  }),
  mount_everest: Object.freeze({
    id: 'mount_everest',
    title: 'Mount Everest & Imja Glacier · 2000–2026 (NASA EIC SVS 4834)',
    src: './assets/textures/everest-filmstrip-2000-2026.jpg',
    cols: 9,
    rows: 3,
    cell: 256,
    frames: 27,
    firstYear: 2000,
    firstMonth: 11,
    stepMode: 'yearly',
    sourceCredit: 'NASA SVS ID 4834 & GIBS MODIS/VIIRS Cryosphere Series (2000–2026)'
  }),
  global_wildfires: Object.freeze({
    id: 'global_wildfires',
    title: 'Global Wildfires & Smoke · 2000–2026 (NASA EIC SVS 5113 & 5453)',
    src: './assets/textures/wildfires-filmstrip-2000-2026.jpg',
    cols: 9,
    rows: 3,
    cell: 256,
    frames: 27,
    firstYear: 2000,
    firstMonth: 8,
    stepMode: 'yearly',
    sourceCredit: 'NASA SVS ID 5113, ID 5453 & FIRMS VIIRS Thermal Anomalies (2000–2026)'
  })
});

// The original single-strip export stays for callers that only know the decade.
export const FILMSTRIP = FILMSTRIP_PRESETS.coxs_bazar;

export const MONTHS = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]);

export function frameDate(index, preset = FILMSTRIP) {
  if (preset.stepMode === 'yearly') {
    return {
      year: preset.firstYear + index,
      month: preset.firstMonth
    };
  }
  const total = preset.firstMonth - 1 + index;
  return {
    year: preset.firstYear + Math.floor(total / 12),
    month: (total % 12) + 1
  };
}

export function frameLabel(index, preset = FILMSTRIP) {
  const { year, month } = frameDate(index, preset);
  return `${MONTHS[month - 1]} ${year}`;
}

// Feature windows. A value at or beyond an edge is 0 or 1; these are tuned
// against the real sheet so a monsoon frame and a clear January frame sit at
// opposite ends of every bar.
export const FEATURE_RANGES = Object.freeze({
  lum: [55, 210],
  cloud: [0, 1],
  green: [-2, 30],
  edge: [2, 42],
  water: [0, 0.4],
  contrast: [2, 60]
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const norm = (v, range) => clamp01((v - range[0]) / (range[1] - range[0]));

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load filmstrip: ${src}`));
    image.src = src;
  });
}

// Per cell, sampled on a 2px grid: enough signal for four stable numbers, four
// times cheaper than touching all 8.5M pixels of the sheet.
function measureCell(data, cell, step) {
  const last = cell - 1;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumL = 0;
  let sumL2 = 0;
  let cloud = 0;
  let water = 0;
  let edge = 0;
  let n = 0;

  for (let y = 0; y < cell; y += step) {
    const row = y * cell;
    const rowDown = Math.min(y + step, last) * cell;
    for (let x = 0; x < cell; x += step) {
      const o = (row + x) * 4;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      sumR += r;
      sumG += g;
      sumB += b;
      sumL += l;
      sumL2 += l * l;

      // MODIS clouds are bright and desaturated; few land surfaces here are.
      if (r > 205 && g > 205 && b > 205) cloud += 1;
      // Sea and river sediment both read blue against vegetation.
      if (b > g + 8 && b > r + 14) water += 1;

      const xr = Math.min(x + step, last);
      const oR = (row + xr) * 4;
      const oD = (rowDown + x) * 4;
      const lR = 0.2126 * data[oR] + 0.7152 * data[oR + 1] + 0.0722 * data[oR + 2];
      const lD = 0.2126 * data[oD] + 0.7152 * data[oD + 1] + 0.0722 * data[oD + 2];
      edge += Math.abs(l - lR) + Math.abs(l - lD);

      n += 1;
    }
  }

  const meanLum = sumL / n;
  const variance = Math.max(0, sumL2 / n - meanLum * meanLum);

  return {
    meanLum,
    cloudPct: cloud / n,
    greenness: (sumG - sumR) / n,
    edgeMean: edge / n,
    waterPct: water / n,
    contrast: Math.sqrt(variance)
  };
}

export function toFeatures(raw) {
  // GIBS serves a uniform black tile when a day has no observation. Treat it as
  // missing data, not as a very dark scene, so the synth never invents a sound
  // for a frame that contains no measurement.
  const blank = raw.contrast < 0.5 && (raw.meanLum > 250 || raw.meanLum < 5);
  return {
    lum: norm(raw.meanLum, FEATURE_RANGES.lum),
    cloud: norm(raw.cloudPct, FEATURE_RANGES.cloud),
    green: norm(raw.greenness, FEATURE_RANGES.green),
    edge: norm(raw.edgeMean, FEATURE_RANGES.edge),
    water: norm(raw.waterPct, FEATURE_RANGES.water),
    contrast: norm(raw.contrast, FEATURE_RANGES.contrast),
    blank,
    raw
  };
}

export async function loadFilmstrip(presetKey = 'coxs_bazar') {
  const preset = typeof presetKey === 'string' ? FILMSTRIP_PRESETS[presetKey] : presetKey;
  if (!preset) throw new Error(`Unknown filmstrip preset: ${presetKey}`);
  const image = await loadImage(preset.src);
  const { cols, rows, cell, frames } = preset;

  const sheet = document.createElement('canvas');
  sheet.width = cols * cell;
  sheet.height = rows * cell;
  const sheetCtx = sheet.getContext('2d', { willReadFrequently: true });
  sheetCtx.drawImage(image, 0, 0, sheet.width, sheet.height);

  const step = 2;
  const perFrame = [];
  const started = performance.now();

  for (let i = 0; i < frames; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const data = sheetCtx.getImageData(col * cell, row * cell, cell, cell).data;
    perFrame.push(toFeatures(measureCell(data, cell, step)));
  }

  const elapsed = Math.round(performance.now() - started);

  return {
    image,
    sheet,
    preset,
    frames: perFrame,
    analysisMs: elapsed,
    draw(ctx, index, size) {
      const col = index % cols;
      const row = Math.floor(index / cols);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, col * cell, row * cell, cell, cell, 0, 0, size, size);
    }
  };
}
