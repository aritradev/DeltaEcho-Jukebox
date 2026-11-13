import * as THREE from 'three';
import { mulberry32, smoothstep, DEG, createCanvas, canvasTexture } from './utils.js';
import { computeProceduralTextures } from './procedural-texture-job.js';

// A camera-space cloud pass for the cloud-entry → continent handoff.
//
// The planes are children of the camera, so they are always billboarded toward
// the viewer. Moving them from FAR to NEAR makes perspective grow them and slide
// them out of frame — the parallax that a flat CSS overlay cannot produce. They
// render above the globe and the atlas (depth test off) so the same pass covers
// both sides of the handoff.
//
// The billboard textures are generated procedurally: fractal value noise shaped
// by a radial falloff gives soft, detailed puffs with genuinely transparent
// edges. Sampling `earth_clouds.png` directly looked like paint splatter at this
// zoom, and `smoke.png` is a single low-contrast grey blob.
//
// Intensity is driven by the director: 0 before cloud entry, 1 through the
// globe→map swap, 0 once the flat map is established.

const PLANE_COUNT = 80;
const CORE_COUNT = 12;
const NEAR = 0.14;
const FAR = 3.6;

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = `
uniform sampler2D uMap;
uniform float uOpacity;
uniform vec3 uTint;
uniform float uMask;
varying vec2 vUv;

void main() {
  float a = texture2D(uMap, vUv).a;

  // Fade the plane edges so a puff never reads as a rectangle. The generated
  // texture already reaches zero at r = 0.48; this only softens the last edge.
  float r = length(vUv - 0.5);
  a *= mix(1.0, 1.0 - smoothstep(0.42, 0.5, r), uMask);

  if (a < 0.004) discard;

  // Vertical light: cloud tops catch the sun, undersides stay cool. Without
  // this the puffs read as flat white fog.
  vec3 col = mix(vec3(0.82, 0.87, 0.94), vec3(1.0), smoothstep(0.0, 0.95, vUv.y));
  col *= 0.9 + 0.1 * smoothstep(0.15, 0.85, a);
  gl_FragColor = vec4(col * uTint, a * uOpacity);
}
`;

function makeTexture({ width, height, data }) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  image.data.set(data);
  ctx.putImageData(image, 0, 0);
  return canvasTexture(canvas, { srgb: false });
}

export class CloudPass {
  static async create(camera) {
    const pixels = await computeProceduralTextures({ type: 'clouds' });
    const textures = [];
    try {
      for (const image of pixels) textures.push(makeTexture(image));
      return new CloudPass(camera, textures.slice(0, 6), textures.slice(6));
    } catch (error) {
      for (const texture of textures) texture.dispose();
      throw error;
    }
  }

  constructor(camera, maps, fields) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.intensity = 0;
    this.time = 0;
    this.planes = [];

    const random = mulberry32(0x9e3779b9);

    this.backdrops = [
      { distance: 5, phase: 0, alpha: 0.82 },
      { distance: 7.5, phase: 2.1, alpha: 0.68 }
    ].map((config, index) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.ShaderMaterial({
          uniforms: {
            uMap: { value: fields[index] },
            uOpacity: { value: 0 },
            uTint: { value: new THREE.Color(0xf4f8ff) },
            uMask: { value: 0 }
          },
          vertexShader: VERT,
          fragmentShader: FRAG,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      mesh.position.set(0, 0, -config.distance);
      mesh.renderOrder = 938 + index;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return { ...config, mesh };
    });

    const geometry = new THREE.PlaneGeometry(1, 1);

    for (let i = 0; i < PLANE_COUNT; i += 1) {
      const core = i < CORE_COUNT;
      const filler = i % 6 === 0;
      const angle = random() * Math.PI * 2;
      // Core puffs stay near the view axis so the centre reads as cloud, not
      // as a hole. The rest sit on a wider ring and sweep past the edges.
      const radius = core ? random() * 0.28 : 0.45 + random() * 1.3;
      const map = maps[i % maps.length];

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: map },
          uOpacity: { value: 0 },
          uTint: { value: new THREE.Color(filler ? 0xdfeaf8 : 0xffffff) },
          uMask: { value: 1 }
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: filler ? THREE.AdditiveBlending : THREE.NormalBlending,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 950 + i;
      mesh.frustumCulled = false;
      this.group.add(mesh);

      this.planes.push({
        mesh,
        material,
        x: Math.cos(angle) * radius * 1.5,
        y: Math.sin(angle) * radius * 0.95,
        offset: random(),
        speed: core ? 0.28 + random() * 0.16 : 0.45 + random() * 0.4,
        spin: (random() - 0.5) * 0.5,
        scale: filler ? 2.2 + random() * 1 : core ? 1.5 + random() * 0.7 : 0.7 + random() * 0.8,
        alpha: filler ? 0.1 + random() * 0.06 : core ? 0.5 + random() * 0.16 : 0.6 + random() * 0.22
      });
    }
  }

  update(delta, intensity) {
    // A new pass starts from the far end instead of picking up mid-flight.
    if (intensity > 0.002 && this.intensity <= 0.002) this.time = 0;
    this.intensity = intensity;

    const visible = intensity > 0.002;
    this.group.visible = visible;
    if (!visible) return;

    this.time += delta;

    // The backdrops cover the frustum at fixed depths, so the gaps between
    // parallax puffs never expose the globe. Two different fields cancel each
    // other's holes; a slow drift keeps them from reading as still images.
    const cam = this.camera;
    for (const backdrop of this.backdrops) {
      const halfHeight = Math.tan((cam.fov * DEG) / 2) * backdrop.distance;
      const height = halfHeight * 2;
      const width = height * cam.aspect;
      const drift = 1 + intensity * 0.12;
      backdrop.mesh.scale.set(width * drift, height * drift, 1);
      backdrop.mesh.position.x = Math.sin(this.time * 0.3 + backdrop.phase) * 0.05 * width;
      backdrop.mesh.position.y = Math.cos(this.time * 0.24 + backdrop.phase) * 0.035 * height;
      backdrop.mesh.material.uniforms.uOpacity.value = intensity * backdrop.alpha;
    }

    for (const plane of this.planes) {
      const travel = (this.time * plane.speed + plane.offset) % 1;
      const z = -(NEAR + (1 - travel) * (FAR - NEAR));

      plane.mesh.position.set(plane.x, plane.y, z);
      // Perspective already grows the puff; the extra scale keeps it sweeping
      // past the lens instead of stalling at the edge.
      const size = plane.scale * (1 + travel * 0.55);
      plane.mesh.scale.set(size, size, 1);
      plane.mesh.rotation.z = plane.offset * Math.PI * 2 + this.time * plane.spin;

      const fadeIn = smoothstep(0, 0.16, travel);
      const fadeOut = 1 - smoothstep(0.7, 1, travel);
      plane.material.uniforms.uOpacity.value = intensity * plane.alpha * fadeIn * fadeOut;
    }
  }
}
