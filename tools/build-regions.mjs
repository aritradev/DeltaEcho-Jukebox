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
  kutubdia_saint_martin: { name: 'Kutubdia + Saint Martin', bn: '\u0995\u09c1\u09a4\u09c1\u09ac\u09a6\u09bf\u09df\u09be \u0993 \u09b8\u09c7\u09a8\u09cd\u099f\u09ae\u09be\u09b0\u09cd\u099f\u09bf\u09a8', short: 'Offshore islands', color: '#7a6bb0', unavailable: [] }
};

const data = JSON.parse(fs.readFileSync(source, 'utf8'));

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
    country: 'Bangladesh',
    continent: 'Asia',
    lat: raw.coordinates.latitude,
    lon: raw.coordinates.longitude,
    color: meta.color,
    unavailable: meta.unavailable,
    years
  });
}

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
lines.push(`  { id: 'bangladesh', name: 'Bangladesh', continent: 'Asia', regionIds: ${JSON.stringify(regions.map((region) => region.id))} },`);
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
