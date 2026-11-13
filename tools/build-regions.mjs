// Regenerates src/regions.js from the Champion Edition dataset.
//
// This is a data-preparation tool, not part of the app build. The browser never
// runs it: index.html loads the committed src/regions.js directly. Run it only
// when assets/data/bd_6_regions_1985_2026_champion_jukebox.json changes.
//
//   node tools/build-regions.mjs
//
// The generated file keeps the UI small and fast: one row per year per signal,
// no 5 MB runtime fetch, and no dataset parsing in the browser.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets/data/bd_6_regions_1985_2026_champion_jukebox.json');
const eicSource = path.join(root, 'assets/data/nasa_eic_gallery_2000_2026_frames_and_cv_sonification.json');
const target = path.join(root, 'src/regions.js');

const SIGNALS = [
  { key: 'temperature', label: 'Temperature', field: 'T2M_C', source: 'mean_T2M_C', unit: '\u00b0C', decimals: 1, range: [10, 40], audio: 'Pitch 220\u2013880 Hz' },
  { key: 'rain', label: 'Rain', field: 'PRECTOTCORR_mm', source: 'total_rain_mm', unit: 'mm', decimals: 0, range: [0, 900], audio: 'Note density 0\u20131' },
  { key: 'vegetation', label: 'Vegetation', field: 'NDVI', source: 'mean_NDVI', unit: '', decimals: 2, range: [0.1, 0.9], audio: 'Pad brightness' },
  { key: 'canopy', label: 'Canopy', field: 'GEDI_canopy_m', source: 'mean_GEDI_canopy_m', unit: 'm', decimals: 1, range: [2, 20], audio: 'Reverb decay' },
  { key: 'groundwater', label: 'Groundwater', field: 'GRACE_ewh_cm', source: 'mean_GRACE_ewh_cm', unit: 'cm', decimals: 1, range: [-20, 15], audio: 'Sub-bass 55\u2013110 Hz' },
  { key: 'seaLevel', label: 'Sea level', field: 'SEA_LEVEL_mm', source: 'mean_SEA_LEVEL_mm', unit: 'mm', decimals: 1, range: [0, 250], audio: 'Wave-wash filter' },
  { key: 'air', label: 'Air quality', field: 'AIR_AOD_NO2_index', source: 'mean_AIR_AOD_NO2_index', unit: '', decimals: 1, range: [10, 100], audio: 'Bitcrusher grit' },
  { key: 'carbon', label: 'Carbon', field: 'CO2_ppm', source: 'mean_CO2_ppm', unit: 'ppm', decimals: 1, range: [340, 435], audio: 'Detune cents' },
  { key: 'lights', label: 'Night lights', field: 'NIGHT_LIGHTS_nW', source: 'mean_NIGHT_LIGHTS_nW', unit: 'nW', decimals: 1, range: [0, 100], audio: 'Arpeggiator pulse' },
  { key: 'disasters', label: 'Disasters', field: 'EXTREME_EVENTS', source: 'total_EXTREME_EVENTS', unit: '', decimals: 0, range: [0, 30], audio: 'Percussion hits' }
];

// Display metadata that is not carried by the dataset. `unavailable` is explicit
// because a landlocked region reports sea level as 0, and the UI must say N/A
// rather than imply a real coastal measurement.
const META = {
  dhaka: { name: 'Dhaka', bn: '\u09a2\u09be\u0995\u09be', short: 'Urban heat island', color: '#c05a3e', unavailable: ['seaLevel'] },
  chittagong: { name: 'Chittagong', bn: '\u099a\u099f\u09cd\u099f\u0997\u09cd\u09b0\u09be\u09ae', short: 'Port and hills', color: '#4f8f8a', unavailable: [] },
  sylhet: { name: 'Sylhet', bn: '\u09b8\u09bf\u09b2\u09c7\u099f', short: 'Haor and tea gardens', color: '#6f9b52', unavailable: ['seaLevel'] },
  sundarbans: { name: 'Sundarbans', bn: '\u09b8\u09c1\u09a8\u09cd\u09a6\u09b0\u09ac\u09a8', short: 'Mangrove delta', color: '#2f7d5c', unavailable: [] },
  coxs_bazar: { name: "Cox's Bazar", bn: '\u0995\u0995\u09cd\u09b8\u09ac\u09be\u099c\u09be\u09b0', short: 'Coastal shoreline', color: '#3f7fb5', unavailable: [] },
  kutubdia_saint_martin: { name: 'Kutubdia + Saint Martin', bn: '\u0995\u09c1\u09a4\u09c1\u09ac\u09a6\u09bf\u09df\u09be \u0993 \u09b8\u09c7\u09a8\u09cd\u099f\u09ae\u09be\u09b0\u09cd\u099f\u09bf\u09a8', short: 'Offshore islands', color: '#7a6bb0', unavailable: [] },
  mount_everest: {
    name: 'Mount Everest & Khumbu',
    bn: '\u09ae\u09be\u0989\u09a8\u09cd\u099f \u098f\u09ad\u09be\u09b0\u09c7\u09b8\u09cd\u099f \u0993 \u0996\u09c1\u09ae\u09cd\u09ac\u09c1 \u0997\u09cd\u09b2\u09c7\u09b8\u09bf\u09df\u09be\u09b0',
    short: 'Himalayan glacier retreat',
    color: '#38bdf8',
    unavailable: ['seaLevel'],
    country: 'Nepal (Himalaya EIC)',
    countryId: 'nepal',
    continent: 'Asia',
    fullName: 'Mount Everest & Khumbu Glacier (NASA EIC Cryosphere)',
    category: 'Cryosphere / Himalaya',
    lat: 27.9881,
    lon: 86.925
  },
  global_wildfires: {
    name: 'Pacific NW Wildfires',
    bn: '\u0997\u09cd\u09b2\u09cb\u09ac\u09be\u09b2 \u0993\u09df\u09be\u0987\u09b2\u09cd\u09a1\u09ab\u09be\u09df\u09be\u09b0 \u0993 \u09a6\u09be\u09ac\u09be\u09a8\u09b2',
    short: 'VIIRS active fire & smoke',
    color: '#f97316',
    unavailable: ['seaLevel'],
    country: 'Global EIC (Wildfires)',
    countryId: 'global_eic',
    continent: 'North America',
    fullName: 'Pacific Northwest Wildfires & Smoke (NASA EIC VIIRS)',
    category: 'Wildfire / Pacific Northwest',
    lat: 42.0,
    lon: -121.5
  }
};

// The two NASA EIC showcase destinations are not part of the Champion Edition
// dataset, which stops at six Bangladesh regions. Their source is the EIC gallery
// JSON: 27 annual frames (2000-2026), each with computer-vision statistics for the
// image rather than in-situ environmental measurements.
const EIC_THEMES = {
  mount_everest: 'mount_everest_glaciers',
  global_wildfires: 'global_wildfires_smoke'
};

const data = JSON.parse(fs.readFileSync(source, 'utf8'));
const eicData = fs.existsSync(eicSource) ? JSON.parse(fs.readFileSync(eicSource, 'utf8')) : null;

const round = (value, decimals) => Number(value.toFixed(decimals));
const clamp01 = (value) => Math.min(1, Math.max(0, value));

// Image-derived proxies for the EIC showcase destinations.
//
// These are NOT environmental measurements. The EIC gallery publishes annual
// frame statistics (RGB means, luminance, spatial pixel density); each signal
// below is a documented monotonic mapping of those statistics into the signal's
// display range. They exist so the two showcase destinations have a complete,
// audible panel, and the on-screen provenance note says so. Replace them with a
// real regional dataset when one is available.
function eicSignals(frame) {
  const red = frame.cv_mean_red_channel;
  const green = frame.cv_mean_green_channel;
  const blue = frame.cv_mean_blue_channel;
  const luma = frame.cv_mean_brightness_luma;
  const density = frame.cv_spatial_pixel_density;

  const greenness = clamp01((green - red) * 4 + 0.5); // vegetation tint
  const snow = clamp01(blue * 1.2); // bright blue reads as ice and snow
  const dry = clamp01(1 - (blue + green) / 2); // low moisture
  const warmth = clamp01((red - blue) * 1.5 + 0.5); // red/blue balance

  return {
    temperature: round(10 + 30 * clamp01((1 - luma) * 0.7 + density * 0.3), 1),
    rain: round(900 * clamp01(blue * 0.6 + density * 0.4), 0),
    vegetation: round(0.1 + 0.8 * clamp01(greenness * (1 - snow)), 2),
    canopy: round(2 + 18 * clamp01(greenness * (1 - snow)), 1),
    groundwater: round(-20 + 35 * clamp01((blue * 0.7 + green * 0.3) * (1 - dry * 0.5)), 1),
    seaLevel: 0,
    air: round(10 + 90 * clamp01(dry * 0.7 + density * 0.3), 1),
    carbon: round(340 + 95 * clamp01((1 - luma) * 0.6 + density * 0.4), 1),
    lights: round(100 * clamp01(warmth * density * 2), 1),
    disasters: round(30 * clamp01(density * 6 + warmth * 0.2), 0)
  };
}

function buildEicRegion(id) {
  const meta = META[id];
  const theme = eicData?.themes?.[EIC_THEMES[id]];
  if (!theme) throw new Error(`No NASA EIC theme data for region "${id}"`);
  const years = {};
  for (const [year, frame] of Object.entries(theme.frames_by_year)) {
    years[year] = eicSignals(frame);
  }
  return {
    id,
    name: meta.name,
    fullName: meta.fullName,
    bn: meta.bn,
    short: meta.short,
    category: meta.category,
    country: meta.country,
    countryId: meta.countryId,
    continent: meta.continent,
    lat: meta.lat,
    lon: meta.lon,
    color: meta.color,
    unavailable: meta.unavailable,
    years
  };
}

const regions = [];
for (const [id, raw] of Object.entries(data.regions)) {
  const meta = META[id];
  if (!meta) throw new Error(`No display metadata for region "${id}"`);
  const years = {};
  for (const [year, row] of Object.entries(raw.yearly_summary_1985_2026)) {
    const values = {};
    for (const signal of SIGNALS) values[signal.key] = row[signal.source];
    years[year] = values;
  }
  regions.push({
    id,
    name: meta.name,
    fullName: raw.name_en,
    bn: meta.bn,
    short: meta.short,
    category: raw.category,
    country: meta.country || 'Bangladesh',
    countryId: meta.countryId || 'bangladesh',
    continent: meta.continent || 'Asia',
    lat: raw.coordinates.latitude,
    lon: raw.coordinates.longitude,
    color: meta.color,
    unavailable: meta.unavailable,
    years
  });
}

for (const id of Object.keys(EIC_THEMES)) regions.push(buildEicRegion(id));

// Country groups follow the generated region order: Bangladesh, the Nepal EIC
// group, then the global wildfires EIC group.
const countries = [];
for (const region of regions) {
  let country = countries.find((entry) => entry.name === region.country);
  if (!country) {
    country = {
      id: region.countryId,
      name: region.country,
      continent: region.continent,
      regionIds: []
    };
    countries.push(country);
  }
  country.regionIds.push(region.id);
}

const comparisonPairs = (data.comparison_pairs || []).map((pair) => ({
  id: pair.pair_id,
  yearA: pair.year_A,
  yearB: pair.year_B,
  interval: pair.interval,
  label: pair.label
}));

const allYears = data.all_years;
const lines = [];
lines.push('// Generated from assets/data/bd_6_regions_1985_2026_champion_jukebox.json.');
lines.push('// Compact region index for the UI: coordinates, colours and one yearly value');
lines.push('// per signal. Regenerate with `node tools/build-regions.mjs` when the source');
lines.push('// dataset changes.');
lines.push('');
lines.push(`export const YEAR_RANGE = ${JSON.stringify({ start: allYears[0], end: allYears[allYears.length - 1], years: allYears })};`);
lines.push('');
lines.push('export const SIGNALS = [');
for (const signal of SIGNALS) lines.push(`  ${JSON.stringify(signal)},`);
lines.push('];');
lines.push('');
lines.push('export const COUNTRIES = [');
for (const country of countries) {
  lines.push(`  { id: ${JSON.stringify(country.id)}, name: ${JSON.stringify(country.name)}, continent: ${JSON.stringify(country.continent)}, regionIds: ${JSON.stringify(country.regionIds)} },`);
}
lines.push('];');
lines.push('');
lines.push('export const COMPARISON_PAIRS = [');
for (const pair of comparisonPairs) lines.push(`  ${JSON.stringify(pair)},`);
lines.push('];');
lines.push('');
lines.push('export const REGIONS = [');
for (const region of regions) {
  lines.push('  {');
  lines.push(`    id: ${JSON.stringify(region.id)},`);
  lines.push(`    name: ${JSON.stringify(region.name)},`);
  lines.push(`    fullName: ${JSON.stringify(region.fullName)},`);
  lines.push(`    bn: ${JSON.stringify(region.bn)},`);
  lines.push(`    short: ${JSON.stringify(region.short)},`);
  lines.push(`    category: ${JSON.stringify(region.category)},`);
  lines.push(`    country: ${JSON.stringify(region.country)},`);
  lines.push(`    countryId: ${JSON.stringify(region.countryId)},`);
  lines.push(`    continent: ${JSON.stringify(region.continent)},`);
  lines.push(`    lat: ${region.lat},`);
  lines.push(`    lon: ${region.lon},`);
  lines.push(`    color: ${JSON.stringify(region.color)},`);
  lines.push(`    unavailable: ${JSON.stringify(region.unavailable)},`);
  lines.push('    years: {');
  for (const [year, values] of Object.entries(region.years)) {
    lines.push(`      ${year}: ${JSON.stringify(values)},`);
  }
  lines.push('    },');
  lines.push('  },');
}
lines.push('];');
lines.push('');
lines.push('export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));');
lines.push('');
lines.push('export const MARKER = {');
lines.push('  capAngle: 0.215,');
lines.push('  shellScale: 1.0055,');
lines.push('  beamHeight: 0.135,');
lines.push('  beamRadius: 0.086,');
lines.push('  particleCount: 150,');
lines.push('  particleHeight: 0.3,');
lines.push('  hitRadius: 0.135');
lines.push('};');
lines.push('');

fs.writeFileSync(target, lines.join('\n'));
console.log(`wrote ${path.relative(root, target)} (${fs.statSync(target).size} bytes)`);
console.log(`regions: ${regions.map((region) => region.id).join(', ')}`);
console.log(`years: ${allYears[0]}..${allYears[allYears.length - 1]} (${allYears.length})`);
