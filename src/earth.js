import * as THREE from 'three';
import { EARTH, CLOUDS, ATMOSPHERE } from './config.js';
import { DEG, clamp, smoothstep } from './utils.js';

const NIGHT_VERT = `
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

const NIGHT_FRAG = `
uniform sampler2D uMap;
uniform vec3 uSunPos;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  vec3 L = normalize(uSunPos - vWorldPos);
  float ndl = dot(normalize(vNormalW), L);
  float night = smoothstep(0.18, -0.22, ndl);
  vec3 tex = texture2D(uMap, vUv).rgb;
  float lights = max(tex.r, tex.g);
  lights = smoothstep(0.012, 0.075, lights);
  lights = lights * lights * (0.45 + 0.55 * lights);
  vec3 warm = mix(vec3(1.0, 0.74, 0.42), vec3(1.0, 0.9, 0.72), lights);
  float a = lights * night * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(warm * a, a);
}
`;

const ATMO_VERT = `
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ATMO_FRAG = `
uniform vec3 uSunPos;
uniform float uIntensity;
uniform float uPower;
uniform float uDayBias;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunPos - vWorldPos);
  float ndl = dot(N, L);
  float lit = smoothstep(-0.62, 0.22, ndl);
  float rim = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), uPower);
  float forward = pow(clamp(dot(V, -L), 0.0, 1.0), 4.0);
  vec3 deep = vec3(0.14, 0.36, 0.92);
  vec3 high = vec3(0.62, 0.78, 1.0);
  vec3 sunset = vec3(1.0, 0.72, 0.45);
  vec3 col = mix(deep, high, smoothstep(-0.15, 0.55, ndl));
  col = mix(col, sunset, pow(clamp(1.0 - abs(ndl) * 3.4, 0.0, 1.0), 2.2) * 0.5 * uDayBias);
  float body = rim * (0.28 + 0.72 * lit);
  float glow = forward * lit * 0.55;
  float a = clamp((body * 1.35 + glow) * uIntensity, 0.0, 1.0);
  gl_FragColor = vec4(col * (body + glow * 0.7) * uIntensity, a);
}
`;

const HAZE_FRAG = `
uniform vec3 uSunPos;
uniform float uIntensity;
uniform float uRim;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunPos - vWorldPos);
  float ndl = dot(N, L);
  float lit = smoothstep(-0.35, 0.35, ndl);
  float rim = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), uRim);
  float a = rim * lit * uIntensity;
  vec3 col = mix(vec3(0.2, 0.44, 0.95), vec3(0.78, 0.86, 1.0), smoothstep(0.0, 0.6, ndl));
  gl_FragColor = vec4(col * a, a);
}
`;

const CLOUD_FRAG = `
uniform sampler2D uMap;
uniform vec3 uSunPos;
uniform float uOpacity;
uniform float uEvolve;
uniform float uDetailScale;
uniform float uDetailMix;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  float base = texture2D(uMap, vUv).a;
  float det = texture2D(uMap, vec2(vUv.x * uDetailScale + uEvolve, vUv.y)).a;
  float cover = mix(base, max(base, det), uDetailMix);
  float a = clamp(cover, 0.0, 1.0) * uOpacity;
  if (a < 0.018) discard;
  vec3 L = normalize(uSunPos - vWorldPos);
  float ndl = dot(normalize(vNormalW), L);
  float lit = smoothstep(-0.16, 0.30, ndl);
  float term = pow(clamp(1.0 - abs(ndl) * 2.8, 0.0, 1.0), 2.0);
  vec3 col = mix(vec3(0.84, 0.89, 0.97), vec3(1.0, 0.85, 0.66), term * 0.6);
  gl_FragColor = vec4(col * lit, a);
}
`;

export class Earth {
  constructor(textures, spinGroup, sunPosition) {
    this.textures = textures;
    this.sunPosition = sunPosition;
    this.radius = EARTH.radius;
    this.spin = spinGroup;
    this.tilt = spinGroup.parent;
    this.holder = spinGroup.parent.parent;
    this.orbitPivot = spinGroup.parent.parent.parent;
    this.orbitRoot = spinGroup.parent.parent.parent.parent;
    this.frameNode = spinGroup;
    this.spinRateScale = 0.55;
    this.spinAngle = EARTH.startSpinDeg * DEG;
    this.regionLocalDirection = new THREE.Vector3(0, 1, 0);
    this._center = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    this.buildSurface();
    this.buildNight();
    this.buildClouds();
    this.buildAtmosphere();
  }

  buildSurface() {
    const geometry = new THREE.SphereGeometry(this.radius, 160, 96);
    this.surfaceMaterial = new THREE.MeshStandardMaterial({
      map: this.textures['earth_day.jpg'],
      normalMap: this.textures['earth_normal.jpg'],
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: this.textures.earth_roughness,
      roughness: 1.0,
      metalness: 0.0
    });
    this.surface = new THREE.Mesh(geometry, this.surfaceMaterial);
    this.surface.name = 'earth-surface';
    this.spin.add(this.surface);
  }

  buildNight() {
    const geometry = new THREE.SphereGeometry(this.radius * EARTH.nightScale, 96, 64);
    this.nightMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.textures['earth_night.jpg'] },
        uSunPos: { value: this.sunPosition },
        uOpacity: { value: 0.9 }
      },
      vertexShader: NIGHT_VERT,
      fragmentShader: NIGHT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.night = new THREE.Mesh(geometry, this.nightMaterial);
    this.night.renderOrder = 1;
    this.spin.add(this.night);
  }

  buildClouds() {
    const geometry = new THREE.SphereGeometry(
      this.radius * CLOUDS.scale,
      CLOUDS.segments[0],
      CLOUDS.segments[1]
    );
    this.cloudMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.textures['earth_clouds.png'] },
        uSunPos: { value: this.sunPosition },
        uOpacity: { value: CLOUDS.opacity.solarRest },
        uEvolve: { value: 0.0 },
        uDetailScale: { value: CLOUDS.detailScale },
        uDetailMix: { value: CLOUDS.detailMix }
      },
      vertexShader: NIGHT_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false
    });
    this.clouds = new THREE.Mesh(geometry, this.cloudMaterial);
    this.clouds.renderOrder = 2;
    this.spin.add(this.clouds);
    this.cloudSpin = 0;
  }

  buildAtmosphere() {
    const outer = new THREE.SphereGeometry(this.radius * EARTH.atmosphereScale, 96, 64);
    this.atmoMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSunPos: { value: this.sunPosition },
        uIntensity: { value: ATMOSPHERE.intensityBase },
        uPower: { value: ATMOSPHERE.rimPowerBase },
        uDayBias: { value: ATMOSPHERE.dayBias }
      },
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    });
    this.atmosphere = new THREE.Mesh(outer, this.atmoMaterial);
    this.atmosphere.renderOrder = 3;
    this.spin.add(this.atmosphere);

    const inner = new THREE.SphereGeometry(this.radius * EARTH.atmosphereInnerScale, 96, 64);
    this.hazeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSunPos: { value: this.sunPosition },
        uIntensity: { value: 0.0 },
        uRim: { value: ATMOSPHERE.hazeRim }
      },
      vertexShader: ATMO_VERT,
      fragmentShader: HAZE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.haze = new THREE.Mesh(inner, this.hazeMaterial);
    this.haze.renderOrder = 4;
    this.spin.add(this.haze);
  }

  setSpinRate(scale) {
    this.spinRateScale = scale;
  }

  setSpin(angle) {
    this.spinAngle = angle;
    this.spin.rotation.y = angle;
  }

  setCloudOpacity(value) {
    this.cloudMaterial.uniforms.uOpacity.value = value;
    this.clouds.visible = value > 0.004;
  }

  update(delta, elapsed, cameraDistanceInRadii) {
    this.spinAngle += (Math.PI * 2 / EARTH.spinPeriod) * this.spinRateScale * delta;
    this.spin.rotation.y = this.spinAngle;
    this.cloudSpin += (Math.PI * 2 / EARTH.spinPeriod) * this.spinRateScale * delta * (CLOUDS.spinFactor - 1);
    this.clouds.rotation.y = this.cloudSpin;
    this.cloudMaterial.uniforms.uEvolve.value =
      (this.cloudMaterial.uniforms.uEvolve.value + delta * CLOUDS.evolveRate) % 1;

    const near = smoothstep(ATMOSPHERE.detailDistance, 1.15, cameraDistanceInRadii);
    const veryNear = smoothstep(ATMOSPHERE.hazeOnsetFar, ATMOSPHERE.hazeOnsetNear, cameraDistanceInRadii);
    this.atmoMaterial.uniforms.uIntensity.value = ATMOSPHERE.intensityBase + near * ATMOSPHERE.intensityNear;
    this.atmoMaterial.uniforms.uPower.value = ATMOSPHERE.rimPowerBase + near * ATMOSPHERE.rimPowerNear;
    this.hazeMaterial.uniforms.uIntensity.value = veryNear * ATMOSPHERE.hazeIntensity;
    this.nightMaterial.uniforms.uOpacity.value = 0.85 + near * 0.75;
  }

  setNormalScale(value) {
    this.surfaceMaterial.normalScale.set(value, value);
  }

  setRegionLocalDirection(vector) {
    this.regionLocalDirection.copy(vector);
  }

  refresh() {
    this.frameNode.getWorldPosition(this._center);
  }

  get center() {
    return this._center;
  }

  frameQuaternion(target) {
    return this.frameNode.getWorldQuaternion(target);
  }

  orbitFrameQuaternion(target) {
    this.tilt.updateWorldMatrix(true, false);
    return this.tilt.getWorldQuaternion(target);
  }

  getRegionWorldPosition(target) {
    this.frameNode.getWorldQuaternion(this._q);
    return target
      .copy(this.regionLocalDirection)
      .applyQuaternion(this._q)
      .multiplyScalar(this.radius * 1.001)
      .add(this._center);
  }

  getRegionAzElTilt() {
    this.getRegionWorldPosition(this._v).sub(this._center);
    if (this._v.lengthSq() < 1e-12) return { az: 0, el: 0 };
    this._v.normalize();
    this.orbitFrameQuaternion(this._q).invert();
    this._v.applyQuaternion(this._q);
    return {
      az: Math.atan2(this._v.x, this._v.z),
      el: Math.asin(clamp(this._v.y, -1, 1))
    };
  }

  getLocalSunDirection(target) {
    this.frameNode.getWorldQuaternion(this._q).invert();
    return target.copy(this.sunPosition).sub(this._center).normalize().applyQuaternion(this._q).normalize();
  }

  getLocalSunDirectionTilt(target) {
    this.orbitFrameQuaternion(this._q).invert();
    return target.copy(this.sunPosition).sub(this._center).normalize().applyQuaternion(this._q).normalize();
  }
}
