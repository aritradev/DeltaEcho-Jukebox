import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const invlerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);

export function shortestAngle(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function latLonToVector3(lat, lon, radius = 1, target = new THREE.Vector3()) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  const sp = Math.sin(phi);
  return target.set(
    -radius * sp * Math.cos(theta),
    radius * Math.cos(phi),
    radius * sp * Math.sin(theta)
  );
}

export function sphericalToVector3(dist, az, el, target = new THREE.Vector3()) {
  const c = Math.cos(el);
  return target.set(
    dist * c * Math.sin(az),
    dist * Math.sin(el),
    dist * c * Math.cos(az)
  );
}

export function vectorToSpherical(v) {
  const dist = v.length();
  if (dist < 1e-8) return { dist: 0, az: 0, el: 0 };
  const el = Math.asin(clamp(v.y / dist, -1, 1));
  const az = Math.atan2(v.x, v.z);
  return { dist, az, el };
}

export function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function canvasTexture(canvas, { srgb = true, repeatX = false, flipY = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = flipY;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function invertImageIntoCanvas(image) {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 255 - px[i];
    px[i + 1] = 255 - px[i + 1];
    px[i + 2] = 255 - px[i + 2];
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export function imageToCanvas(image) {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function disposeObject(root) {
  root.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const key of Object.keys(material)) {
          const value = material[key];
          if (value && value.isTexture) value.dispose();
        }
        material.dispose();
      }
    }
  });
}
