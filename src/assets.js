import * as THREE from 'three';
import { TEXTURE_DIR, PLANETS, ATLAS } from './config.js';
import { invertImageIntoCanvas, canvasTexture } from './utils.js';

const EARTH_MAPS = [
  'earth_day.jpg',
  'earth_normal.jpg',
  'earth_specular.jpg',
  'earth_night.jpg',
  'earth_clouds.png'
];

const BACKDROP_MAPS = ['smoke.png'];

const ATLAS_MAPS = Object.values(ATLAS.levels).map((level) => level.map);

const BODY_MAPS = [
  'sun.jpg',
  ...PLANETS.filter((p) => p.key !== 'earth').map((p) => p.map),
  ...PLANETS.filter((p) => p.ring).map((p) => p.ring.map)
];

export class AssetLoader {
  constructor(onProgress) {
    this.onProgress = onProgress;
    this.textures = {};
    this.files = [...BODY_MAPS, ...EARTH_MAPS, ...BACKDROP_MAPS, ...ATLAS_MAPS];
    this.loaded = 0;
  }

  async loadAll() {
    await Promise.all(this.files.map((file) => this.loadTexture(file)));
    await this.buildRoughness();
    if (this.onProgress) this.onProgress(1);
    return this.textures;
  }

  loadTexture(file) {
    return new Promise((resolve) => {
      new THREE.TextureLoader().load(
        `${TEXTURE_DIR}${file}`,
        (texture) => {
          texture.colorSpace = /\.(jpg|jpeg|webp)$/i.test(file) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.anisotropy = 4;
          texture.needsUpdate = true;
          this.textures[file] = texture;
          resolve(texture);
        },
        undefined,
        () => {
          console.warn(`texture unavailable: ${file}`);
          resolve(null);
        }
      );
      this.loaded += 1;
      if (this.onProgress) this.onProgress(Math.min(0.94, this.loaded / this.files.length));
    });
  }

  async buildRoughness() {
    const spec = this.textures['earth_specular.jpg'];
    if (!spec) return;
    const image = spec.image;
    if (!image.complete || !image.naturalWidth) {
      await new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    }
    const roughness = canvasTexture(invertImageIntoCanvas(image), { srgb: false });
    roughness.wrapS = THREE.RepeatWrapping;
    this.textures.earth_roughness = roughness;
  }
}
