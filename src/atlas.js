import * as THREE from 'three';
import { ATLAS } from './config.js';
import { clamp, DEG } from './utils.js';

// A flat map stage drawn on camera-attached planes. The planes ride the camera
// and only their texture offset/repeat animate, so the camera transform keeps a
// single writer (CameraDirector.apply) and the rig contract stays intact.
//
// Each layer is driven by a plain state object owned by the director:
//   { u, v, zoom, opacity }
// `u` / `v` are the centre of the visible window in image space, measured from
// the top-left of the picture, so they can be read straight off the artwork.

// Regions without satellite artwork get a generated one-colour plate: the
// region colour, a survey grid and its name. It slots into the same `coxs`
// atlas layer as the real Cox's Bazar photo.
export function makeRegionPlate(region) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(region.color);
  const mid = base.clone().multiplyScalar(0.42);
  const deep = base.clone().multiplyScalar(0.24);
  const dark = base.clone().multiplyScalar(0.08);

  const grad = ctx.createRadialGradient(
    size * 0.5, size * 0.46, size * 0.04,
    size * 0.5, size * 0.5, size * 0.72
  );
  grad.addColorStop(0, `#${mid.getHexString()}`);
  grad.addColorStop(0.48, `#${deep.getHexString()}`);
  grad.addColorStop(1, `#${dark.getHexString()}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(3, 5, 10, 0.3)';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(225, 240, 255, 0.10)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 12; i += 1) {
    const p = Math.round((size / 12) * i) + 0.5;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(230, 244, 255, 0.16)';
  for (let i = 1; i <= 5; i += 1) {
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.5, size * 0.08 * i, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(240, 248, 255, 0.34)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(size * 0.5, size * 0.5 - 26); ctx.lineTo(size * 0.5, size * 0.5 + 26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(size * 0.5 - 26, size * 0.5); ctx.lineTo(size * 0.5 + 26, size * 0.5); ctx.stroke();

  ctx.strokeStyle = 'rgba(230, 244, 255, 0.26)';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, size - 60, size - 60);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
  const titleSize = region.name.length > 16 ? 18 : 22;
  ctx.font = `500 ${titleSize}px "SFMono-Regular", Consolas, monospace`;
  ctx.fillText(region.name.toUpperCase(), size * 0.5, size * 0.5 - 34);
  ctx.fillStyle = 'rgba(235, 245, 255, 0.26)';
  ctx.font = '12px "SFMono-Regular", Consolas, monospace';
  ctx.fillText(region.short.toUpperCase(), size * 0.5, size * 0.5 + 44);
  ctx.fillStyle = 'rgba(235, 245, 255, 0.2)';
  ctx.font = '10px "SFMono-Regular", Consolas, monospace';
  ctx.fillText(`${region.lat.toFixed(2)}\u00b0N  ${region.lon.toFixed(2)}\u00b0E`, size * 0.5, size * 0.5 + 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export class Atlas {
  constructor(camera, textures) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.layers = [];

    Object.keys(ATLAS.levels).forEach((key, index) => {
      const config = ATLAS.levels[key];
      const texture = textures[config.map] || null;

      if (texture) {
        // Windows always stay inside the image, but clamping removes any chance
        // of a seam wrapping across an edge on odd aspect ratios.
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.anisotropy = 8;
        texture.needsUpdate = true;
      }

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      });

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.position.set(0, 0, -ATLAS.distance);
      mesh.renderOrder = 900 + index;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);

      const image = texture && texture.image;
      const aspect = image && image.height ? image.width / image.height : 1;

      this.layers.push({ key, config, texture, material, mesh, aspect, state: null });
    });

    this.regionLayer = this.layers.find((layer) => layer.key === 'coxs') || null;
    this.defaultRegionTexture = this.regionLayer ? this.regionLayer.texture : null;
    this.customRegionTexture = null;
  }

  // Swaps the second atlas plate between the real Cox's Bazar photo and a
  // generated placeholder for the other regions.
  setRegionTexture(texture) {
    const layer = this.regionLayer;
    if (!layer) return;
    if (this.customRegionTexture && this.customRegionTexture !== texture) {
      this.customRegionTexture.dispose();
    }
    this.customRegionTexture = texture;
    layer.texture = texture;
    layer.material.map = texture;
    layer.material.needsUpdate = true;
    const image = texture.image;
    layer.aspect = image && image.height ? image.width / image.height : 1;
  }

  restoreRegionTexture() {
    const layer = this.regionLayer;
    if (!layer) return;
    if (this.customRegionTexture) {
      this.customRegionTexture.dispose();
      this.customRegionTexture = null;
    }
    layer.texture = this.defaultRegionTexture;
    layer.material.map = this.defaultRegionTexture;
    layer.material.needsUpdate = true;
    const image = this.defaultRegionTexture && this.defaultRegionTexture.image;
    layer.aspect = image && image.height ? image.width / image.height : 1;
  }

  sync(states) {
    for (let i = 0; i < this.layers.length; i += 1) {
      this.layers[i].state = states[i] || null;
    }
  }

  update() {
    const cam = this.camera;
    const halfHeight = Math.tan((cam.fov * DEG) / 2) * ATLAS.distance;
    const height = halfHeight * 2;
    const width = height * cam.aspect;
    let anyVisible = false;

    for (const layer of this.layers) {
      const state = layer.state;
      const opacity = state ? clamp(state.opacity, 0, 1) : 0;

      if (!layer.texture || opacity <= 0.001) {
        layer.mesh.visible = false;
        continue;
      }

      layer.mesh.visible = true;
      anyVisible = true;
      layer.material.opacity = opacity;
      layer.mesh.scale.set(width, height, 1);

      // At zoom 1 the picture covers the frame; deeper zooms shrink the window.
      const baseHeight = Math.min(1, layer.aspect / cam.aspect);
      const visibleHeight = clamp(baseHeight / Math.max(state.zoom, 0.05), 0.0005, 1);
      const visibleWidth = clamp((visibleHeight * cam.aspect) / layer.aspect, 0.0005, 1);

      const centerU = clamp(state.u, visibleWidth / 2, 1 - visibleWidth / 2);
      const centerV = clamp(state.v, visibleHeight / 2, 1 - visibleHeight / 2);

      layer.texture.repeat.set(visibleWidth, visibleHeight);
      layer.texture.offset.set(centerU - visibleWidth / 2, 1 - centerV - visibleHeight / 2);
    }

    this.group.visible = anyVisible;
  }
}
