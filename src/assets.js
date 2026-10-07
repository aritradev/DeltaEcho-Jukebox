import * as THREE from 'three';
import { TEXTURE_DIR, PLANETS } from './config.js';
import { invertImageIntoCanvas, canvasTexture } from './utils.js';

const EARTH_MAPS = [
  'earth_day.jpg',
  'earth_normal.jpg',
  'earth_specular.jpg',
  'earth_night.jpg',
  'earth_clouds.png'
];

const BODY_MAPS = [
  'sun.jpg',
  ...PLANETS.filter((p) => p.key !== 'earth').map((p) => p.map),
  ...PLANETS.filter((p) => p.ring).map((p) => p.ring.map)
];

const GALAXY_MAPS = ['galaxy.webp'];

export class AssetLoader {
  constructor(onProgress) {
    this.onProgress = onProgress;
    this.textures = {};
    this.files = [...BODY_MAPS, ...EARTH_MAPS, ...GALAXY_MAPS];
    this.loaded = 0;
  }

  async loadAll(maxAnisotropy = 8) {
    await Promise.all(this.files.map((file) => this.loadTexture(file, maxAnisotropy)));
    this.buildRoughness();
    if (this.onProgress) this.onProgress(1);
    return this.textures;
  }

  loadTexture(file, maxAnisotropy = 8) {
    return new Promise((resolve) => {
      new THREE.TextureLoader().load(
        `${TEXTURE_DIR}${file}`,
        (texture) => {
          texture.colorSpace = /\.(jpg|jpeg|webp)$/i.test(file) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          // Earth maps are 4K; bump anisotropy for sharper oblique views.
          texture.anisotropy = maxAnisotropy;
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

  /**
   * Derive a roughness map from the existing specular map. Water reflects
   * (low roughness) while land diffuses (high roughness).
   */
  buildRoughness() {
    const spec = this.textures['earth_specular.jpg'];
    if (!spec) return;
    const image = spec.image;
    if (!image.complete || !image.naturalWidth) {
      // Synchronously wait via re-decode; if it isn't decoded yet, fall back
      // to using the spec map itself for roughness.
      const handle = () => this._buildRoughnessFromImage(image);
      if (!image.complete) {
        image.addEventListener('load', handle, { once: true });
        return;
      }
      handle();
      return;
    }
    this._buildRoughnessFromImage(image);
  }

  _buildRoughnessFromImage(image) {
    const roughness = canvasTexture(invertImageIntoCanvas(image), { srgb: false });
    roughness.wrapS = THREE.RepeatWrapping;
    this.textures.earth_roughness = roughness;
  }
}