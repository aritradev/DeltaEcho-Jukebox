// Locality plates for the flat map stage. The five new plates are NASA HLS
// L30 (Landsat 8/9) true-colour products retrieved from NASA GIBS and graded
// locally for display. The supplied 2025 Landsat crops informed the coastal
// site/season treatment; at 8 km they were too narrow for a full map plate.
export const REGION_IMAGERY = Object.freeze({
  coxs_bazar: {
    file: 'coxs-bazar.jpg',
    label: "Cox's Bazar satellite image",
    note: 'Capture date unknown; not imagery for the selected year.',
    credit: ''
  },
  chittagong: {
    file: 'chattogram-hls.jpg',
    label: 'NASA HLS L30 (Landsat 8/9) · 9 Feb 2025 · Chattogram port and coast',
    note: 'Representative dry-season view; not imagery for the selected year.',
    credit: 'NASA HLS L30 via NASA GIBS; Landsat data courtesy of USGS'
  },
  dhaka: {
    file: 'dhaka-hls.jpg',
    label: 'NASA HLS L30 (Landsat 8/9) · 15 Jan 2025 · Dhaka region',
    note: 'Representative dry-season regional view; not imagery for the selected year.',
    credit: 'NASA HLS L30 via NASA GIBS; Landsat data courtesy of USGS'
  },
  sylhet: {
    file: 'sylhet-hls.jpg',
    label: 'NASA HLS L30 (Landsat 8/9) · 9 Feb 2025 · Sylhet region',
    note: 'Representative dry-season regional view; not imagery for the selected year.',
    credit: 'NASA HLS L30 via NASA GIBS; Landsat data courtesy of USGS'
  },
  sundarbans: {
    file: 'sundarbans-hls.jpg',
    label: 'NASA HLS L30 (Landsat 8/9) · 27 Mar 2025 · central Sundarbans',
    note: 'Representative mangrove view; not imagery for the selected year.',
    credit: 'NASA HLS L30 via NASA GIBS; Landsat data courtesy of USGS'
  },
  kutubdia_saint_martin: {
    file: 'kutubdia-saint-martin-hls.jpg',
    label: 'NASA HLS L30 (Landsat 8/9) · 16 Jan 2025 · Kutubdia',
    note: 'Plate shows Kutubdia and the adjacent coast. Saint Martin is part of this destination but is not shown in this plate; not imagery for the selected year.',
    credit: 'NASA HLS L30 via NASA GIBS; Landsat data courtesy of USGS'
  },
  mount_everest: {
    file: 'everest-hls.jpg',
    label: 'NASA SVS ID 4834 & GIBS · Mount Everest, Khumbu Glacier & Imja Lake',
    note: 'Cryosphere & glacial lake expansion plate; not imagery for the selected year. Signal values are image-derived proxies from NASA EIC annual CV metrics, not in-situ measurements.',
    credit: 'NASA Scientific Visualization Studio (ID 4834) & NASA GIBS / Landsat'
  },
  global_wildfires: {
    file: 'wildfire-viirs.jpg',
    label: 'NASA SVS ID 5113 & 5453 · VIIRS Active Fires (FRP) & GEOS Smoke',
    note: 'Representative peak wildfire season plate; not imagery for the selected year. Signal values are image-derived proxies from NASA EIC annual CV metrics, not in-situ measurements.',
    credit: 'NASA SVS EIC Gallery (ID 5113, ID 5453) & NASA FIRMS VIIRS'
  }
});
