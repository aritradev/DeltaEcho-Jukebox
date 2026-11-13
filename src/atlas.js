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

// Regions without satellite artwork get a generated survey plate: a tinted
// contour field, measurement grid and small locator plaque. It uses the same
// atlas layer as the real Cox's Bazar photograph without pretending to be one.
export function makeRegionPlate(region) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(region.color);
  const mid = base.clone().multiplyScalar(0.48);
  const deep = base.clone().multiplyScalar(0.24);
  const dark = base.clone().multiplyScalar(0.07);
  const cx = size * 0.5;
  const cy = size * 0.5;

  const grad = ctx.createRadialGradient(
    size * 0.46, size * 0.4, size * 0.03,
    cx, cy, size * 0.72
  );
  grad.addColorStop(0, `#${mid.getHexString()}`);
  grad.addColorStop(0.46, `#${deep.getHexString()}`);
  grad.addColorStop(1, `#${dark.getHexString()}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(3, 5, 10, 0.28)';
  ctx.fillRect(0, 0, size, size);

  const wash = ctx.createLinearGradient(0, 0, size, size);
  wash.addColorStop(0, 'rgba(235, 247, 255, 0.035)');
  wash.addColorStop(0.5, 'rgba(235, 247, 255, 0)');
  wash.addColorStop(1, 'rgba(3, 5, 10, 0.12)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(225, 240, 255, 0.075)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 16; i += 1) {
    const p = Math.round((size / 16) * i) + 0.5;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }

  ctx.save();
  ctx.translate(cx, cy);
  for (let ring = 0; ring < 8; ring += 1) {
    const radius = size * (0.105 + ring * 0.047);
    ctx.beginPath();
    for (let step = 0; step <= 96; step += 1) {
      const angle = (step / 96) * Math.PI * 2;
      const wobble = 1
        + 0.042 * Math.sin(angle * 3 + ring * 1.3)
        + 0.018 * Math.sin(angle * 7 - ring * 0.8);
      const x = Math.cos(angle) * radius * wobble;
      const y = Math.sin(angle) * radius * wobble * 0.84;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(230, 244, 255, ${0.095 - ring * 0.007})`;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
  ctx.restore();

  let seed = [...region.id].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 17);
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 30; i += 1) {
    const angle = random() * Math.PI * 2;
    const radius = size * (0.08 + random() * 0.34);
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius * 0.84;
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + random() * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(235, 247, 255, ${0.08 + random() * 0.14})`;
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(235, 247, 255, 0.2)';
  ctx.lineWidth = 1.3;
  ctx.strokeRect(34, 34, size - 68, size - 68);
  ctx.strokeStyle = 'rgba(235, 247, 255, 0.14)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 8; i += 1) {
    const inset = 34;
    const p = size * (i / 8);
    ctx.beginPath(); ctx.moveTo(p, inset); ctx.lineTo(p, inset + 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(inset, p); ctx.lineTo(inset + 8, p); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p, size - inset); ctx.lineTo(p, size - inset - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(size - inset, p); ctx.lineTo(size - inset - 8, p); ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(240, 248, 255, 0.42)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, cy - 17); ctx.lineTo(cx, cy + 17); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 17, cy); ctx.lineTo(cx + 17, cy); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(240, 248, 255, 0.72)';
  ctx.fill();

  const spaced = (text, x, y, spacing) => {
    const chars = [...text];
    const widths = chars.map((char) => ctx.measureText(char).width);
    const total = widths.reduce((sum, width) => sum + width, 0) + spacing * Math.max(0, chars.length - 1);
    let cursor = x - total * 0.5;
    ctx.textAlign = 'left';
    chars.forEach((char, index) => {
      ctx.fillText(char, cursor, y);
      cursor += widths[index] + spacing;
    });
  };

  ctx.textBaseline = 'alphabetic';
  ctx.font = '8px "SFMono-Regular", Consolas, monospace';
  ctx.fillStyle = 'rgba(235, 247, 255, 0.34)';
  spaced('LOCATION PLATE', cx, cy - 42, 2.2);

  ctx.font = '12px "SFMono-Regular", Consolas, monospace';
  ctx.fillStyle = 'rgba(248, 252, 255, 0.72)';
  spaced(region.name.toUpperCase(), cx, cy + 44, 1.4);

  ctx.strokeStyle = 'rgba(235, 247, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 34, cy + 56);
  ctx.lineTo(cx + 34, cy + 56);
  ctx.stroke();

  ctx.font = '8px "SFMono-Regular", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(235, 247, 255, 0.3)';
  ctx.fillText(region.short.toUpperCase(), cx, cy + 72);
  ctx.fillStyle = 'rgba(235, 247, 255, 0.24)';
  ctx.fillText(`${region.lat.toFixed(2)}\u00b0N  ${region.lon.toFixed(2)}\u00b0E`, cx, cy + 88);

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
    this.customRegionTextureOwned = false;
  }

  setBaseTexture(key, texture) {
    const layer = this.layers.find((item) => item.key === key);
    if (key === 'coxs') {
      this.defaultRegionTexture = texture;
      if (this.customRegionTexture) return;
    }
    if (layer.texture === texture) return;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    layer.texture = texture;
    layer.material.map = texture;
    layer.material.needsUpdate = true;
    layer.aspect = texture.image.width / texture.image.height;
  }

  setRegionTexture(texture, { owned = false } = {}) {
    const layer = this.regionLayer;
    if (!layer) return;
    if (this.customRegionTexture && this.customRegionTexture !== texture && this.customRegionTextureOwned) {
      this.customRegionTexture.dispose();
    }
    this.customRegionTexture = texture;
    this.customRegionTextureOwned = owned;
    layer.texture = texture;
    layer.material.map = texture;
    layer.material.needsUpdate = true;
    const image = texture.image;
    layer.aspect = image && image.height ? image.width / image.height : 1;
  }

  restoreRegionTexture() {
    const layer = this.regionLayer;
    if (!layer) return;
    if (this.customRegionTexture && this.customRegionTextureOwned) this.customRegionTexture.dispose();
    this.customRegionTexture = null;
    this.customRegionTextureOwned = false;
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
