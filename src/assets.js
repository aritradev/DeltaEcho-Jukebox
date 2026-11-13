import * as THREE from 'three';
import { TEXTURE_DIR, PLANETS, ATLAS, SUN } from './config.js';
import { invertImageIntoCanvas, canvasTexture } from './utils.js';
import { REGION_IMAGERY } from './region-imagery.js';

const EARTH_MAPS = [
  'earth_day.jpg',
  'earth_normal.jpg',
  'earth_specular.jpg',
  'earth_night.jpg',
  'earth_clouds.png'
];
const BODY_MAPS = [
  ...(SUN.procedural ? [] : ['sun.jpg']),
  ...PLANETS.filter((p) => p.key !== 'earth').map((p) => p.map),
  ...PLANETS.filter((p) => p.ring).map((p) => p.ring.map)
];
const OPTIONAL_MAPS = new Set(['earth_normal.jpg', 'earth_specular.jpg']);

export class AssetLoader {
  constructor(onProgress) {
    this.onProgress = onProgress;
    this.textures = {};
    this.requests = new Map();
    this.warnings = [];
  }

  async loadCritical() {
    const files = [...new Set([...BODY_MAPS, ...EARTH_MAPS, 'smoke.png'])];
    let completed = 0;
    const results = await Promise.allSettled(files.map(async (file) => {
      try {
        return await this.loadTexture(file);
      } catch (error) {
        if (!OPTIONAL_MAPS.has(file)) throw error;
        this.warnings.push(file);
        console.warn(`Optional surface detail unavailable: ${file}`);
      } finally {
        completed += 1;
        this.onProgress?.(completed / files.length);
      }
    }));
    const failed = results.flatMap((result, i) => result.status === 'rejected' ? [files[i]] : []);
    if (failed.length) throw new Error(`Could not load ${failed.join(', ')}.`);
    return this.textures;
  }

  async loadAtlas(regionId = 'coxs_bazar') {
    const files = [ATLAS.levels.asia.map];
    const plate = REGION_IMAGERY[regionId]?.file;
    if (plate) files.push(plate);
    else if (regionId === 'coxs_bazar') files.push(ATLAS.levels.coxs.map);
    await Promise.all(files.map((file) => this.loadTexture(file)));
    return this.textures;
  }

  loadTexture(file) {
    if (this.textures[file]) return Promise.resolve(this.textures[file]);
    if (this.requests.has(file)) return this.requests.get(file);
    const request = this.fetchTexture(file).then((texture) => {
      this.textures[file] = texture;
      return texture;
    }).finally(() => this.requests.delete(file));
    this.requests.set(file, request);
    return request;
  }

  async fetchTexture(file) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 45000);
    let objectUrl;
    try {
      const response = await fetch(`${TEXTURE_DIR}${file}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Image request failed (${response.status})`);
      objectUrl = URL.createObjectURL(await response.blob());
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const texture = new THREE.Texture(image);
      texture.colorSpace = /\.(jpg|jpeg|webp)$/i.test(file) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      return texture;
    } finally {
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  buildRoughness() {
    const spec = this.textures['earth_specular.jpg'];
    if (!spec) return;
    const roughness = canvasTexture(invertImageIntoCanvas(spec.image), { srgb: false });
    roughness.wrapS = THREE.RepeatWrapping;
    this.textures.earth_roughness = roughness;
  }
}
