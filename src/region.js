import * as THREE from 'three';
import { REGION } from './config.js';
import { latLonToVector3, mulberry32, clamp } from './utils.js';

const FOOTPRINT_VERT = `
attribute float aRad;
attribute float aAz;
varying float vRad;
varying float vAz;
void main() {
  vRad = aRad;
  vAz = aAz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FOOTPRINT_FRAG = `
uniform float uTime;
uniform float uIntensity;
uniform float uEdge;
uniform float uHover;
uniform float uPulse;
uniform float uPulseAmp;
uniform vec3 uWarm;
uniform vec3 uCool;
varying float vRad;
varying float vAz;

float band(float x, float center, float width) {
  return smoothstep(width, 0.0, abs(x - center));
}

void main() {
  float r = vRad;
  float a = vAz;

  float outer = 1.0 - smoothstep(uEdge * 0.82, uEdge, r);
  if (outer <= 0.002) discard;

  float body = (1.0 - smoothstep(0.0, uEdge, r));
  float core = exp(-r * r * 11.0);

  float contours = 0.0;
  for (int i = 1; i < 6; i++) {
    float rr = float(i) / 6.0;
    contours += band(r, rr * uEdge, 0.011) * (0.35 + 0.65 * (0.5 + 0.5 * sin(a * 3.0 + float(i) * 1.7 + uTime * 0.25)));
  }

  float rings = 0.0;
  float phase = fract(uTime * 0.11);
  for (int i = 0; i < 3; i++) {
    float rr = phase + float(i) * 0.3333;
    rings += band(r, rr * uEdge, 0.028) * (1.0 - float(i) * 0.3);
  }

  float pulse = band(r, uPulse, 0.055) * uPulseAmp;
  float scan = band(r, uEdge * 0.55, 0.42) * (0.5 + 0.5 * sin(a - uTime * 0.8)) * 0.14;

  float amp = uIntensity * (1.0 + uHover * 0.55);
  float alpha = (body * 0.3 + core * 0.85 + contours * 0.14 + rings * 0.3 + scan) * outer * amp;
  alpha += (rings * 0.45 + pulse) * outer * amp;

  vec3 col = mix(uWarm, uCool, smoothstep(0.0, uEdge * 0.95, r));
  col = mix(col, uWarm, clamp(core * 0.8 + pulse * 1.4, 0.0, 1.0));

  alpha = clamp(alpha, 0.0, 1.0);
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

const BEAM_VERT = `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BEAM_FRAG = `
uniform float uTime;
uniform float uIntensity;
uniform float uHover;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  float h = vUv.y;
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float edge = pow(1.0 - abs(dot(N, V)), 1.35);
  float fall = pow(1.0 - h, 1.9);
  float flicker = 0.9 + 0.1 * sin(uTime * 1.7 + h * 9.0);
  float alpha = (0.16 + edge * 0.84) * fall * flicker * uIntensity * (1.0 + uHover * 0.4);
  if (alpha < 0.003) discard;
  vec3 col = mix(vec3(0.98, 0.94, 0.86), vec3(0.6, 0.78, 1.0), h);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const CORE_FRAG = `
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float h = vUv.y;
  float fall = pow(1.0 - h, 2.6);
  float alpha = fall * uIntensity * 0.34 * (0.86 + 0.14 * sin(uTime * 2.1));
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(vec3(0.92, 0.95, 1.0) * alpha, alpha);
}
`;

const PARTICLE_VERT = `
attribute float aSeed;
attribute float aSpeed;
attribute float aSize;
uniform float uTime;
uniform float uHeight;
uniform float uPixelRatio;
uniform float uIntensity;
varying float vAlpha;
varying float vSeed;
void main() {
  float life = fract(aSeed + uTime * aSpeed);
  vec3 p = position;
  p.y = life * uHeight;
  float swirl = life * life;
  p.x += sin(uTime * 0.55 + aSeed * 31.0) * 0.055 * swirl;
  p.z += cos(uTime * 0.47 + aSeed * 24.0) * 0.055 * swirl;
  vAlpha = sin(life * 3.14159265) * uIntensity;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uPixelRatio * (1.0 + 2.6 / max(0.4, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const PARTICLE_FRAG = `
varying float vAlpha;
varying float vSeed;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float a = smoothstep(0.5, 0.05, r) * vAlpha;
  if (a < 0.004) discard;
  vec3 col = mix(vec3(0.72, 0.85, 1.0), vec3(1.0, 0.96, 0.9), vSeed);
  gl_FragColor = vec4(col * a, a);
}
`;

const RETICLE_FRAG = `
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float a = uIntensity * (0.55 + 0.45 * sin(uTime * 1.4));
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(0.92, 0.95, 1.0) * a, a);
}
`;

function buildCapGeometry(radius, capAngle, segments, rings) {
  const geometry = new THREE.SphereGeometry(radius, segments, rings, 0, Math.PI * 2, 0, capAngle);
  const pos = geometry.attributes.position;
  const rad = new Float32Array(pos.count);
  const az = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const theta = Math.acos(clamp(y / radius, -1, 1));
    rad[i] = theta / capAngle;
    az[i] = Math.atan2(x, z);
  }
  geometry.setAttribute('aRad', new THREE.BufferAttribute(rad, 1));
  geometry.setAttribute('aAz', new THREE.BufferAttribute(az, 1));
  return geometry;
}

export class RegionMarker {
  constructor(earth) {
    this.earth = earth;
    this.config = REGION;
    this.time = 0;
    this.intensity = 0;
    this.hover = 0;
    this.pulse = 0;
    this.pulseAmp = 0;
    this.pulseVelocity = 0;
    this.hoverTarget = 0;
    this._q = new THREE.Quaternion();
    this._scratch = new THREE.Vector3();
    this._scratchNormal = new THREE.Vector3();

    this.root = new THREE.Group();
    const dir = latLonToVector3(REGION.lat, REGION.lon, 1);
    this.localDirection = dir.clone();
    this.root.position.copy(dir.clone().multiplyScalar(earth.radius * REGION.shellScale));
    this.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    earth.spin.add(this.root);

    this.anchor = new THREE.Object3D();
    this.anchor.position.set(0, 0, 0);
    this.root.add(this.anchor);

    this.buildFootprint();
    this.buildBeam();
    this.buildParticles();
    this.buildReticle();
    this.buildHitTarget();
  }

  buildFootprint() {
    const radius = this.earth.radius * REGION.shellScale;
    this.footprintMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uEdge: { value: 0.86 },
        uHover: { value: 0 },
        uPulse: { value: 2 },
        uPulseAmp: { value: 0 },
        uWarm: { value: new THREE.Color(0xfff0dc) },
        uCool: { value: new THREE.Color(0x8fb6ee) }
      },
      vertexShader: FOOTPRINT_VERT,
      fragmentShader: FOOTPRINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.footprint = new THREE.Mesh(
      buildCapGeometry(radius, REGION.capAngle, 128, 64),
      this.footprintMaterial
    );
    this.footprint.renderOrder = 5;
    this.root.add(this.footprint);
  }

  buildBeam() {
    const height = this.earth.radius * REGION.beamHeight;
    const radius = this.earth.radius * REGION.beamRadius;
    this.beamMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uHover: { value: 0 }
      },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const geometry = new THREE.CylinderGeometry(radius * 0.34, radius, height, 56, 1, true);
    this.beam = new THREE.Mesh(geometry, this.beamMaterial);
    this.beam.position.y = height / 2;
    this.beam.renderOrder = 6;
    this.root.add(this.beam);

    this.coreMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 } },
      vertexShader: BEAM_VERT,
      fragmentShader: CORE_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.16, radius * 0.42, height, 32, 1, true),
      this.coreMaterial
    );
    core.position.y = height / 2;
    core.renderOrder = 6;
    this.root.add(core);
    this.beamHeight = height;
  }

  buildParticles() {
    const rng = mulberry32(90210);
    const count = REGION.particleCount;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const speeds = new Float32Array(count);
    const sizes = new Float32Array(count);
    const spread = this.earth.radius * REGION.beamRadius * 1.15;
    for (let i = 0; i < count; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * spread;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = Math.sin(a) * r;
      seeds[i] = rng();
      speeds[i] = 0.045 + rng() * 0.06;
      sizes[i] = 0.7 + Math.pow(rng(), 2) * 1.9;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    this.particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHeight: { value: this.earth.radius * REGION.particleHeight },
        uPixelRatio: { value: 1 },
        uIntensity: { value: 0 }
      },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.particles = new THREE.Points(geometry, this.particleMaterial);
    this.particles.renderOrder = 7;
    this.root.add(this.particles);
  }

  buildReticle() {
    this.reticleMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: RETICLE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const size = this.earth.radius * 0.036;
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(size * 0.72, size, 48), this.reticleMaterial);
    this.reticle.position.y = this.beamHeight;
    this.reticle.renderOrder = 8;
    this.root.add(this.reticle);

    this.reticleDot = new THREE.Mesh(
      new THREE.CircleGeometry(size * 0.16, 20),
      this.reticleMaterial
    );
    this.reticleDot.position.y = this.beamHeight;
    this.reticleDot.renderOrder = 8;
    this.root.add(this.reticleDot);
  }

  buildHitTarget() {
    const radius = this.earth.radius * REGION.hitRadius;
    this.hitTarget = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 12),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 })
    );
    this.hitTarget.position.y = radius * 0.55;
    this.hitTarget.renderOrder = -1;
    this.root.add(this.hitTarget);
  }

  setPixelRatio(ratio) {
    this.particleMaterial.uniforms.uPixelRatio.value = ratio;
  }

  setHover(value) {
    this.hoverTarget = value;
  }

  triggerPulse(strength = 1) {
    this.pulse = 0;
    this.pulseAmp = strength;
    this.pulseVelocity = 1.35;
  }

  getWorldPosition(target = new THREE.Vector3()) {
    return this.anchor.getWorldPosition(target);
  }

  getSurfaceWorldPosition(target = new THREE.Vector3()) {
    return this.root.getWorldPosition(target);
  }

  facingScore(cameraWorldPosition) {
    this.root.getWorldPosition(this._scratch);
    this._scratchNormal.copy(this.localDirection).transformDirection(this.earth.spin.matrixWorld).normalize();
    this._scratch.subVectors(cameraWorldPosition, this._scratch).normalize();
    return this._scratchNormal.dot(this._scratch);
  }

  update(delta, elapsed, camera, visibility) {
    this.time = elapsed;
    this.intensity += (visibility - this.intensity) * clamp(delta * 3.4, 0, 1);
    this.hover += ((this.hoverTarget ?? 0) - this.hover) * clamp(delta * 7, 0, 1);

    this.pulseAmp = Math.max(0, this.pulseAmp - delta * 0.55);
    this.pulse += this.pulseVelocity * delta;
    if (this.pulse > 1.5) {
      this.pulse = 2;
      this.pulseAmp = 0;
    }

    const base = this.intensity;
    this.footprintMaterial.uniforms.uTime.value = elapsed;
    this.footprintMaterial.uniforms.uIntensity.value = base;
    this.footprintMaterial.uniforms.uHover.value = this.hover;
    this.footprintMaterial.uniforms.uPulse.value = this.pulse;
    this.footprintMaterial.uniforms.uPulseAmp.value = this.pulseAmp * 0.9;

    this.beamMaterial.uniforms.uTime.value = elapsed;
    this.beamMaterial.uniforms.uIntensity.value = base * (0.6 + this.hover * 0.35);
    this.beamMaterial.uniforms.uHover.value = this.hover;
    this.coreMaterial.uniforms.uTime.value = elapsed;
    this.coreMaterial.uniforms.uIntensity.value = base;

    this.particleMaterial.uniforms.uTime.value = elapsed;
    this.particleMaterial.uniforms.uIntensity.value = base * (0.7 + this.hover * 0.5);

    this.reticleMaterial.uniforms.uTime.value = elapsed;
    this.reticleMaterial.uniforms.uIntensity.value = base * 0.85;
    if (camera) {
      this.root.getWorldQuaternion(this._q).invert();
      this.reticle.quaternion.copy(this._q).multiply(camera.quaternion);
      this.reticle.rotation.z += elapsed * 0.35;
      this.reticleDot.quaternion.copy(this.reticle.quaternion);
    }
  }
}
