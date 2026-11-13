import * as THREE from 'three';
import { createCanvas, canvasTexture, TAU } from './utils.js';
import { textureRandom } from './procedural-textures.js';
import { computeProceduralTextures } from './procedural-texture-job.js';

const SHELLS = [
  { radius: 900, count: 820, size: [0.8, 1.9], brightness: [0.34, 0.72], warm: 0.1 },
  { radius: 1700, count: 620, size: [0.65, 1.45], brightness: [0.22, 0.5], warm: 0.16 },
  { radius: 2900, count: 420, size: [0.5, 1.1], brightness: [0.13, 0.32], warm: 0.2 }
];

const STAR_VERT = `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vBright;
void main() {
  vColor = aColor;
  float breathe = 0.96 + 0.04 * sin(uTime * 0.22 + aPhase * 6.28318);
  vBright = breathe;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = max(1.0, -mv.z);
  gl_PointSize = aSize * uPixelRatio * (1.0 + 70.0 / depth);
  gl_Position = projectionMatrix * mv;
}
`;

const STAR_FRAG = `
varying vec3 vColor;
varying float vBright;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float core = smoothstep(0.5, 0.02, r);
  float halo = smoothstep(0.5, 0.2, r) * 0.35;
  float a = core + halo;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * vBright, a);
}
`;

function buildShell(def, rng) {
  const count = def.count;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const cool = new THREE.Color(0xbfd6ff);
  const white = new THREE.Color(0xfff6ec);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const u = rng();
    const v = rng();
    const theta = u * TAU;
    const cosPhi = 2 * v - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const jitter = 1 + (rng() - 0.5) * 0.06;
    positions[i * 3] = def.radius * sinPhi * Math.cos(theta) * jitter;
    positions[i * 3 + 1] = def.radius * sinPhi * Math.sin(theta) * jitter;
    positions[i * 3 + 2] = def.radius * cosPhi * jitter;

    const t = rng();
    sizes[i] = def.size[0] + (def.size[1] - def.size[0]) * Math.pow(t, 2.4);
    phases[i] = rng();

    const warmth = rng();
    tmp.copy(white).lerp(cool, Math.min(1, warmth / Math.max(0.001, def.warm) * 0.55 + rng() * 0.4));
    const b = def.brightness[0] + (def.brightness[1] - def.brightness[0]) * Math.pow(rng(), 1.6);
    colors[i * 3] = tmp.r * b;
    colors[i * 3 + 1] = tmp.g * b;
    colors[i * 3 + 2] = tmp.b * b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 }
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  return new THREE.Points(geometry, material);
}

function readSmokePixels(image) {
  const width = image.width;
  const height = image.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

export class Starfield {
  static async create(pixelRatio, smokeTexture) {
    if (!smokeTexture?.image) throw new Error('Nebula smoke brush unavailable');
    const rng = textureRandom(20260925);
    const starfield = new Starfield(pixelRatio, rng);
    try {
      const [pixels] = await computeProceduralTextures({
        type: 'nebula',
        seed: rng.getState(),
        brush: readSmokePixels(smokeTexture.image)
      });
      const canvas = createCanvas(pixels.width, pixels.height);
      const ctx = canvas.getContext('2d');
      const image = ctx.createImageData(pixels.width, pixels.height);
      image.data.set(pixels.data);
      ctx.putImageData(image, 0, 0);
      const texture = canvasTexture(canvas, { srgb: true });
      texture.wrapS = THREE.RepeatWrapping;

      const backdropGeometry = new THREE.SphereGeometry(5200, 48, 32);
      const backdropMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false
      });
      starfield.backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial);
      starfield.backdrop.frustumCulled = false;
      starfield.backdrop.renderOrder = -10;
      starfield.spin.add(starfield.backdrop);
      return starfield;
    } catch (error) {
      for (const shell of starfield.shells) {
        shell.geometry.dispose();
        shell.material.dispose();
      }
      throw error;
    }
  }

  constructor(pixelRatio, rng) {
    this.group = new THREE.Group();
    this.shells = [];
    this.spin = new THREE.Group();
    this.group.add(this.spin);

    for (const def of SHELLS) {
      const points = buildShell(def, rng);
      points.material.uniforms.uPixelRatio.value = pixelRatio;
      points.frustumCulled = false;
      this.shells.push(points);
      this.spin.add(points);
    }
  }

  update(elapsed, camera) {
    this.group.position.copy(camera.position);
    this.spin.rotation.y = elapsed * 0.0035;
    this.spin.rotation.x = Math.sin(elapsed * 0.0016) * 0.02;
    for (const shell of this.shells) {
      shell.material.uniforms.uTime.value = elapsed;
    }
  }

  setPixelRatio(ratio) {
    for (const shell of this.shells) {
      shell.material.uniforms.uPixelRatio.value = ratio;
    }
  }
}
