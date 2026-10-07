export const EARTH_RADIUS = 2.8;

export const RENDER = {
  fov: 52,
  near: 0.05,
  far: 12000,
  maxPixelRatio: 2,
  exposure: 0.95
};

export const SUN = {
  radius: 8.5,
  lightIntensity: 3.5,
  ambient: 0.055,
  coronaScale: [1.85, 3.1, 5.6],
  procedural: true,
  quality: {
    rays: 1800,
    raySegments: 6,
    flareChains: 90,
    flareSteps: 10,
    flareSegments: 10,
    bakeSize: 256
  }
};

export const EARTH = {
  radius: EARTH_RADIUS,
  orbitRadius: 68,
  orbitPeriod: 3600,
  orbitInclination: 0.6,
  startAngleDeg: 241.3,
  axisTiltDeg: 12,
  spinPeriod: 420,
  startSpinDeg: 0,
  nightScale: 1.003,
  atmosphereScale: 1.042,
  atmosphereInnerScale: 1.006
};

export const CLOUDS = {
  scale: 1.015,
  spinFactor: 1.4,
  segments: [96, 48],
  detailScale: 2.7,
  detailMix: 0.45,
  evolveRate: 0.0016,
  opacity: {
    solarRest: 0.3,
    earthApproach: 0.34,
    earthOrbit: 0.66,
    regionApproach: 0.92,
    cloudEntry: 1.0,
    regionReveal: 0.4,
    regionHotspot: 0.46,
    freeOrbit: 0.66,
    returnReveal: 0.72,
    returnApproach: 0.3
  }
};

export const ATMOSPHERE = {
  rimPowerBase: 2.6,
  rimPowerNear: 0.9,
  intensityBase: 0.3,
  intensityNear: 0.7,
  dayBias: 0.6,
  detailDistance: 7.5,
  hazeOnsetFar: 1.6,
  hazeOnsetNear: 1.02,
  hazeIntensity: 0.3,
  hazeRim: 3.4
};

export const FRAMING = {
  sunAzimuthFromRegionDeg: -62
};

export const PLANETS = [
  {
    key: 'mercury', name: 'Mercury', radius: 1.15, orbit: 30, period: 620,
    inclination: 6.2, startAngle: 20, map: 'mercury.jpg', color: 0x9a8f86, roughness: 0.92, metalness: 0.06
  },
  {
    key: 'venus', name: 'Venus', radius: 1.95, orbit: 46, period: 900,
    inclination: 2.4, startAngle: 132, map: 'venus.jpg', color: 0xd6b98c, roughness: 0.96, metalness: 0.0
  },
  {
    key: 'earth', name: 'Earth', radius: EARTH_RADIUS, orbit: 68, period: 3600,
    inclination: 0.6, startAngle: 241.3, map: 'earth_day.jpg', color: 0xffffff, roughness: 1.0, metalness: 0.0
  },
  {
    key: 'mars', name: 'Mars', radius: 1.5, orbit: 95, period: 1500,
    inclination: 1.8, startAngle: 300, map: 'mars.jpg', color: 0xb1603f, roughness: 0.95, metalness: 0.0
  },
  {
    key: 'jupiter', name: 'Jupiter', radius: 6.4, orbit: 140, period: 2600,
    inclination: 1.3, startAngle: 96, map: 'jupiter.jpg', color: 0xd8c3a5, roughness: 0.9, metalness: 0.0
  },
  {
    key: 'saturn', name: 'Saturn', radius: 5.5, orbit: 190, period: 3800,
    inclination: 2.5, startAngle: 205, map: 'saturn.jpg', color: 0xdfd0ac, roughness: 0.9, metalness: 0.0,
    axialTilt: 26.7,
    ring: { inner: 1.34, outer: 2.32, map: 'saturn_ring.jpg' }
  },
  {
    key: 'uranus', name: 'Uranus', radius: 3.3, orbit: 245, period: 5200,
    inclination: 0.8, startAngle: 22, map: 'uranus.jpg', color: 0x9fd3dd, roughness: 0.7, metalness: 0.0
  },
  {
    key: 'neptune', name: 'Neptune', radius: 3.2, orbit: 300, period: 6800,
    inclination: 1.7, startAngle: 165, map: 'neptune.jpg', color: 0x5c7fd6, roughness: 0.7, metalness: 0.0
  }
];

export const REGION = {
  name: 'Bay of Bengal',
  label: 'Bay of Bengal',
  sublabel: 'Available region',
  lat: 16.5,
  lon: 89.0,
  capAngle: 0.215,
  shellScale: 1.0055,
  beamHeight: 0.135,
  beamRadius: 0.086,
  particleCount: 150,
  particleHeight: 0.3,
  hitRadius: 0.135
};

export const STATES = {
  SOLAR_SYSTEM: { id: 1, name: 'solar system' },
  EARTH_APPROACH: { id: 2, name: 'earth approach' },
  EARTH_ORBIT: { id: 3, name: 'earth orbit' },
  REGION_APPROACH: { id: 4, name: 'region approach' },
  CLOUD_ENTRY: { id: 5, name: 'cloud entry' },
  REGION_REVEAL: { id: 6, name: 'region reveal' },
  REGION_HOTSPOT: { id: 7, name: 'region hotspot' }
};

export const TIMELINE = {
  acknowledge: 2.2,
  approach: 6.8,
  orbit: 5.5,
  regionApproach: 4.5,
  cloudEntry: 4.5,
  reveal: 4.5,
  lock: 2.0
};

export const CATEGORIES = [
  { key: 'ocean', label: 'Ocean', glyph: '\u{1F30A}' },
  { key: 'atmosphere', label: 'Atmosphere', glyph: '\u{1F327}' },
  { key: 'land', label: 'Land', glyph: '\u{1F331}' }
];

export const TEXTURE_DIR = './assets/textures/';
