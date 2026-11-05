import * as THREE from 'three';
import { mulberry32, createCanvas, canvasTexture, TAU } from './utils.js';

const SHELLS = [
  { radius: 900, count: 1300, size: [1.2, 3.1], brightness: [0.4, 0.82], warm: 0.1 },
  { radius: 1700, count: 1100, size: [0.95, 2.3], brightness: [0.24, 0.56], warm: 0.16 },
  { radius: 2900, count: 750, size: [0.8, 1.7], brightness: [0.12, 0.34], warm: 0.2 }
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
  float breathe = 0.9 + 0.1 * sin(uTime * 0.35 + aPhase * 6.28318);
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

function buildGalaxyTexture(rng) {
  const w = 2048;
  const h = 1024;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#070a12';
  ctx.fillRect(0, 0, w, h);

  const bandTilt = -0.42;
  const bandCenter = h * 0.5;
  const drawBand = (target, color, count, sizeMin, sizeMax, alpha, spreadMin, spreadRange) => {
    target.globalCompositeOperation = 'source-over';
    for (let i = 0; i < count; i += 1) {
      const u = rng();
      const spread = spreadMin + spreadRange * rng();
      const v = bandCenter + Math.sin(u * Math.PI * 2 + 0.6) * h * bandTilt * 0.9 + (rng() - 0.5) * h * spread;
      const size = sizeMin + (sizeMax - sizeMin) * Math.pow(rng(), 2);
      const x = u * w;
      const y = Math.max(-size, Math.min(h + size, v));
      const grad = target.createRadialGradient(x, y, 0, x, y, size);
      grad.addColorStop(0, color.replace('ALPHA', (alpha * (0.5 + rng() * 0.5)).toFixed(3)));
      grad.addColorStop(1, color.replace('ALPHA', '0'));
      target.fillStyle = grad;
      target.beginPath();
      target.ellipse(x, y, size, size * (0.6 + rng() * 0.8), rng() * Math.PI, 0, TAU);
      target.fill();
    }
  };

  drawBand(ctx, 'rgba(104,128,176,ALPHA)', 1500, 60, 260, 0.011, 0.12, 0.2);
  drawBand(ctx, 'rgba(126,152,196,ALPHA)', 2100, 16, 92, 0.068, 0.055, 0.13);
  drawBand(ctx, 'rgba(178,196,226,ALPHA)', 1200, 12, 62, 0.06, 0.05, 0.12);
  drawBand(ctx, 'rgba(96,120,170,ALPHA)', 640, 24, 132, 0.042, 0.06, 0.14);

  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 420; i += 1) {
    const u = rng();
    const spread = 0.045 + 0.1 * rng();
    const v = bandCenter + Math.sin(u * Math.PI * 2 + 0.6) * h * bandTilt * 0.9 + (rng() - 0.5) * h * spread;
    const size = 20 + rng() * 150;
    const grad = ctx.createRadialGradient(u * w, v, 0, u * w, v, size);
    grad.addColorStop(0, `rgba(14,18,28,${(0.55 + rng() * 0.4).toFixed(2)})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(u * w, v, size, size * 0.45, rng() * Math.PI, 0, TAU);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2200; i += 1) {
    const u = rng();
    const spread = 0.04 + 0.09 * rng();
    const v = bandCenter + Math.sin(u * Math.PI * 2 + 0.6) * h * bandTilt * 0.9 + (rng() - 0.5) * h * spread;
    if (v < -4 || v > h + 4) continue;
    const size = 0.5 + rng() * 1.4;
      ctx.fillStyle = `rgba(198,214,240,${(0.09 + rng() * 0.34).toFixed(2)})`;
    ctx.fillRect(u * w, v, size, size);
  }

  ctx.globalCompositeOperation = 'source-over';
  const texture = canvasTexture(canvas, { srgb: true });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

export class Starfield {
  constructor(pixelRatio, galaxyTexture) {
    this.group = new THREE.Group();
    this.shells = [];
    this.spin = new THREE.Group();
    this.group.add(this.spin);

    const rng = mulberry32(20260925);
    for (const def of SHELLS) {
      const points = buildShell(def, rng);
      points.material.uniforms.uPixelRatio.value = pixelRatio;
      points.frustumCulled = false;
      this.shells.push(points);
      this.spin.add(points);
    }

    const galaxyGeometry = new THREE.SphereGeometry(5200, 48, 32);
    const galaxyMaterial = new THREE.MeshBasicMaterial({
      map: galaxyTexture || buildGalaxyTexture(rng),
      color: 0x49536e,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    this.galaxy = new THREE.Mesh(galaxyGeometry, galaxyMaterial);
    this.galaxy.frustumCulled = false;
    this.galaxy.renderOrder = -10;
    this.spin.add(this.galaxy);
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

  /**
   * Trim star counts to keep frame budget in check on the downshift quality
   * tier.  Rebuilds the affected shells' geometries; preserves the same RNG
   * seed so the same stars are kept (just fewer extras).
   */
  applyShellCounts(targetCounts) {
    for (let i = 0; i < this.shells.length && i < targetCounts.length; i += 1) {
      const shell = this.shells[i];
      const desired = targetCounts[i];
      const current = shell.geometry.attributes.position.count;
      if (desired === current) continue;
      const factor = desired / current;
      const newCount = Math.max(120, Math.round(current * factor));
      const newGeo = shell.geometry.clone();
      const positions = newGeo.attributes.position.array;
      const colors = newGeo.attributes.aColor.array;
      const sizes = newGeo.attributes.aSize.array;
      const phases = newGeo.attributes.aPhase.array;
      const pick = new Uint16Array(newCount);
      for (let k = 0; k < newCount; k += 1) pick[k] = k * (current / newCount) | 0;
      const np = new Float32Array(newCount * 3);
      const nc = new Float32Array(newCount * 3);
      const ns = new Float32Array(newCount);
      const nh = new Float32Array(newCount);
      for (let k = 0; k < newCount; k += 1) {
        const src = pick[k];
        np[k * 3] = positions[src * 3];
        np[k * 3 + 1] = positions[src * 3 + 1];
        np[k * 3 + 2] = positions[src * 3 + 2];
        nc[k * 3] = colors[src * 3];
        nc[k * 3 + 1] = colors[src * 3 + 1];
        nc[k * 3 + 2] = colors[src * 3 + 2];
        ns[k] = sizes[src];
        nh[k] = phases[src];
      }
      newGeo.setAttribute('position', new THREE.BufferAttribute(np, 3));
      newGeo.setAttribute('aColor', new THREE.BufferAttribute(nc, 3));
      newGeo.setAttribute('aSize', new THREE.BufferAttribute(ns, 1));
      newGeo.setAttribute('aPhase', new THREE.BufferAttribute(nh, 1));
      shell.geometry.dispose();
      shell.geometry = newGeo;
    }
  }
}
