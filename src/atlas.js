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
