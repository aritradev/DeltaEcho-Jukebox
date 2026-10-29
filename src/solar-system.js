import * as THREE from 'three';
import { PLANETS, SUN } from './config.js';
import { DEG, TAU, createCanvas, canvasTexture } from './utils.js';
import { createSun } from './sun.js';

const SUN_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SUN_FRAG = `
uniform sampler2D uMap;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec3 base = texture2D(uMap, vUv).rgb;
  float cell = texture2D(uMap, vUv * 2.1 + vec2(0.13, -0.07)).g;
  float cell2 = texture2D(uMap, vUv * 4.7 - vec2(0.05, 0.21)).r;
  vec3 hot = vec3(1.0, 0.94, 0.82);
  vec3 warm = vec3(1.0, 0.68, 0.32);
  vec3 col = mix(warm, hot, clamp(base.r * 1.05 + cell * 0.3, 0.0, 1.0));
  col *= 0.88 + 0.22 * cell2;
  col += warm * 0.1 * (0.5 + 0.5 * sin(uTime * 0.4 + vUv.x * 9.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

const RING_VERT = `
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying float vT;
void main() {
  vT = uv.y;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RING_FRAG = `
uniform sampler2D uMap;
uniform vec3 uSunPos;
uniform float uInner;
uniform float uOuter;
uniform float uOpacity;
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying float vT;

float bandNoise(float x) {
  return 0.42 + 0.2 * sin(x * 43.0) + 0.16 * sin(x * 17.0 + 1.7) + 0.12 * sin(x * 7.0 - 0.6);
}

void main() {
  float t = vT;
  float density = smoothstep(0.0, 0.09, t) * (1.0 - smoothstep(0.87, 1.0, t));
  density *= clamp(bandNoise(t * 9.0), 0.18, 1.0);
  density *= 1.0 - 0.88 * smoothstep(0.045, 0.0, abs(t - 0.575));
  density *= 1.0 - 0.45 * smoothstep(0.022, 0.0, abs(t - 0.34));
  density *= 1.0 - 0.5 * smoothstep(0.02, 0.0, abs(t - 0.87));
  vec3 col = texture2D(uMap, vec2(0.5, t)).rgb;
  col = mix(col, col * 0.7, smoothstep(0.45, 0.78, t));
  vec3 L = normalize(uSunPos - vWorldPos);
  float lit = 0.4 + 0.6 * clamp(dot(normalize(vNormalW), L) * 0.5 + 0.66, 0.0, 1.0);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float grazing = pow(1.0 - abs(dot(V, vNormalW)), 0.6);
  float alpha = clamp(density, 0.0, 1.0) * uOpacity * lit * (0.26 + 0.74 * grazing);
  gl_FragColor = vec4(col * lit, alpha);
}
`;

function buildCoronaTexture() {
  const size = 256;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(255,246,226,0.9)');
  grad.addColorStop(0.14, 'rgba(255,226,172,0.5)');
  grad.addColorStop(0.36, 'rgba(248,190,116,0.17)');
  grad.addColorStop(0.66, 'rgba(222,164,98,0.045)');
  grad.addColorStop(1.0, 'rgba(196,146,86,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(canvas);
}

function orbitCurve(radius) {
  const segments = 720;
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * TAU;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

export class SolarSystem {
  constructor(textures, renderer) {
    this.textures = textures;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.planets = [];
    this.orbitLines = [];
    this.sunPosition = new THREE.Vector3(0, 0, 0);

    this.buildSun();
    for (const def of PLANETS) this.buildPlanet(def);
    this.buildOrbitLines();
  }

  buildSun() {
    this.sunRoot = new THREE.Group();
    this.group.add(this.sunRoot);

    if (SUN.procedural) {
      this.sunRig = createSun({
        radius: SUN.radius,
        renderer: this.renderer,
        quality: SUN.quality
      });
      this.sunRoot.add(this.sunRig.group);
      this.sun = this.sunRig.disc;
      this.sunMaterial = null;
      this.coronas = [];
      return;
    }

    this.sunRig = null;
    this.sunMaterial = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.textures['sun.jpg'] }, uTime: { value: 0 } },
      vertexShader: SUN_VERT,
      fragmentShader: SUN_FRAG
    });
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(SUN.radius, 64, 48), this.sunMaterial);
    this.sunRoot.add(this.sun);

    const corona = buildCoronaTexture();
    const layers = [
      { scale: 1.42, opacity: 0.95, test: true },
      { scale: 2.1, opacity: 0.26, test: true },
      { scale: 3.6, opacity: 0.075, test: true }
    ];
    this.coronas = layers.map((layer) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: corona,
          color: 0xffdcae,
          transparent: true,
          depthWrite: false,
          depthTest: layer.test,
          blending: THREE.AdditiveBlending,
          opacity: layer.opacity
        })
      );
      sprite.scale.setScalar(SUN.radius * layer.scale);
      this.sunRoot.add(sprite);
      return sprite;
    });
  }

  buildPlanet(def) {
    const root = new THREE.Group();
    root.rotation.x = def.inclination * DEG;
    this.group.add(root);

    const pivot = new THREE.Group();
    root.add(pivot);

    const holder = new THREE.Group();
    holder.position.set(def.orbit, 0, 0);
    pivot.add(holder);

    const tiltGroup = new THREE.Group();
    if (def.axialTilt) tiltGroup.rotation.z = def.axialTilt * DEG;
    holder.add(tiltGroup);

    const spin = new THREE.Group();
    tiltGroup.add(spin);

    let mesh = null;
    let material = null;
    if (def.key !== 'earth') {
      material = new THREE.MeshStandardMaterial({
        map: this.textures[def.map] || null,
        color: this.textures[def.map] ? 0xffffff : def.color,
        roughness: def.roughness,
        metalness: def.metalness
      });
      mesh = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 48, 32), material);
      spin.add(mesh);
    }

    if (def.ring) {
      const inner = def.radius * def.ring.inner;
      const outer = def.radius * def.ring.outer;
      const geometry = new THREE.RingGeometry(inner, outer, 160, 6);
      const uv = geometry.attributes.uv;
      const pos = geometry.attributes.position;
      for (let i = 0; i < uv.count; i += 1) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const rad = Math.hypot(x, y);
        uv.setXY(i, 0.5, (rad - inner) / (outer - inner));
      }
      uv.needsUpdate = true;
      const ringMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: this.textures[def.ring.map] },
          uSunPos: { value: this.sunPosition },
          uInner: { value: inner },
          uOuter: { value: outer },
          uOpacity: { value: 1 }
        },
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const ring = new THREE.Mesh(geometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      spin.add(ring);
    }

    this.planets.push({
      def,
      root,
      pivot,
      holder,
      tiltGroup,
      spin,
      mesh,
      material
    });
  }

  buildOrbitLines() {
    for (const def of PLANETS) {
      const root = new THREE.Group();
      root.rotation.x = def.inclination * DEG;
      this.group.add(root);

      const line = new THREE.LineLoop(
        orbitCurve(def.orbit),
        new THREE.LineBasicMaterial({
          color: 0x93aed0,
          transparent: true,
          opacity: 0.07,
          depthWrite: false
        })
      );
      root.add(line);
      this.orbitLines.push({ line, def });
    }
  }

  setOrbitLines(emphasis) {
    for (const entry of this.orbitLines) {
      const base = entry.def.key === 'earth' ? 0.1 : entry.def.orbit <= 95 ? 0.08 : 0.06;
      entry.line.material.opacity = base * (1 - emphasis);
    }
  }

  setCorona(scale) {
    if (this.sunRig) {
      this.sunRig.setCorona(scale);
      return;
    }
    const base = [0.95, 0.26, 0.075];
    this.coronas.forEach((sprite, index) => {
      sprite.material.opacity = base[index] * scale;
    });
  }

  update(elapsed) {
    for (const record of this.planets) {
      const def = record.def;
      record.pivot.rotation.y = -(def.startAngle * DEG) - (TAU / def.period) * elapsed;
      if (record.mesh) record.spin.rotation.y = def.startAngle * DEG + elapsed * 0.06;
    }
    if (this.sunRig) this.sunRig.update(elapsed);
    else if (this.sunMaterial) this.sunMaterial.uniforms.uTime.value = elapsed;
    this.sunRoot.rotation.y = elapsed * 0.006;
  }
}
