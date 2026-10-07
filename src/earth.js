import * as THREE from 'three';
import { EARTH, CLOUDS, ATMOSPHERE } from './config.js';
import { DEG, clamp, smoothstep, createCanvas, canvasTexture } from './utils.js';

/**
 * Tiny equirectangular gradient that PMREMGenerator will mip-blur into a
 * usable ambient cube. Cool sky on top, deep space on the bottom, a soft
 * horizon wash — gives Earth a believable specular lift without needing
 * an HDR.
 */
function buildEnvEquirect() {
  const w = 64;
  const h = 32;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    const v = y / (h - 1);
    const r = v < 0.5 ? 0.06 + (0.5 - v) * 0.18 : 0.03;
    const g = v < 0.5 ? 0.10 + (0.5 - v) * 0.32 : 0.04;
    const b = v < 0.5 ? 0.20 + (0.5 - v) * 0.55 : 0.06;
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const horizon = 1 - Math.abs(v - 0.5) * 2;
      image.data[i] = Math.round((r + horizon * 0.05) * 255);
      image.data[i + 1] = Math.round((g + horizon * 0.04) * 255);
      image.data[i + 2] = Math.round((b + horizon * 0.02) * 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = canvasTexture(canvas, { srgb: true, repeatX: true });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

export function buildEarthEnvironment(renderer) {
  const equirect = buildEnvEquirect();
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(equirect).texture;
  equirect.dispose();
  pmrem.dispose();
  return envMap;
}

/* ------------------------------------------------------------------------- */
/*  Surface                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * NASA Eyes-style photoreal Earth surface.
 *
 *   - Day-side image is the hero. We use MeshStandardMaterial (PBR) so
 *     PMREM env + normal map + roughness combine into a believable ocean.
 *   - Twilight is a soft, low-amplitude warm shift blended over the day
 *     map. No animated FBM stripes (Tier 2.1 looked "printed"); the band
 *     is purely a terminator falloff.
 *   - Night-side city lights are blended into the *surface* itself
 *     (instead of an additive shell) so cities don't pop as a separate
 *     layer and never "leak" past the day terminator.
 *   - A subtle "limb darkening" darkens the very edge of the visible disc
 *     to imply atmospheric scattering without a separate sphere.
 */
function buildSurfaceShader(surfaceUniforms) {
  // Three.js calls this as onBeforeCompile(shader, renderer). The first
  // argument is the shader parameters object (with .uniforms, .vertexShader,
  // .fragmentShader) — *not* the material. The earlier (material, shader)
  // signature caused compileAsync to throw on `shader.uniforms` because the
  // renderer object has no such property.
  return function patch(shader) {
    shader.uniforms.uSunDir = surfaceUniforms.uSunDir;
    shader.uniforms.uNightMap = surfaceUniforms.uNightMap;
    shader.uniforms.uNightStrength = surfaceUniforms.uNightStrength;
    shader.uniforms.uTwilightStrength = surfaceUniforms.uTwilightStrength;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vEarthWorldPos;
         varying vec2 vEarthUv;`
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
         vEarthWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
         vEarthUv = uv;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uSunDir;
         uniform sampler2D uNightMap;
         uniform float uNightStrength;
         uniform float uTwilightStrength;
         varying vec3 vEarthWorldPos;
         varying vec2 vEarthUv;`
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>

         vec3 N_s = normalize(vEarthWorldPos);
         vec3 L_s = normalize(uSunDir);
         float ndl_s = dot(N_s, L_s);

         /* ------------------------------------------------------------------
          * Limb darkening: a smooth falloff toward the visible edge of the
          * disc. Sells the atmosphere by darkening the grazing-angle pixels
          * instead of fading them to black.
          * ------------------------------------------------------------------ */
         vec3 V_s = normalize(cameraPosition - vEarthWorldPos);
         float mu = clamp(dot(N_s, V_s), 0.0, 1.0);
         float limb = smoothstep(0.0, 0.55, mu);
         gl_FragColor.rgb *= mix(0.62, 1.0, limb);

         /* ------------------------------------------------------------------
          * Twilight band: a single, very subtle warm shift over the
          * terminator. No procedural noise, no animated flicker — just a
          * smooth cosine weighting centred at ndl = 0.
          * ------------------------------------------------------------------ */
         float twiBand = pow(clamp(1.0 - abs(ndl_s) * 1.6, 0.0, 1.0), 2.2);
         vec3 warm = vec3(1.0, 0.74, 0.50);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * warm, twiBand * uTwilightStrength);

         /* ------------------------------------------------------------------
          * Night-side city lights: blended into the *surface*, weighted
          * by (1 - day) so they never bleed into the day side. Suppressed
          * near the visible limb to avoid the "halo" artefact.
          * ------------------------------------------------------------------ */
         vec3 lights = texture2D(uNightMap, vEarthUv).rgb;
         float lum = max(max(lights.r, lights.g), lights.b);
         lum = smoothstep(0.025, 0.18, lum);
         // Night mask: 0 on the day side (ndl_s positive), 1 on the night side.
         // smoothstep with edge0 < edge1 is well-defined. The hard step() on
         // ndl_s > 0 is a belt-and-suspenders guard — even if smoothstep
         // somehow returned the wrong value, the day side will still be 0.
         float nightMask = smoothstep(0.05, -0.08, ndl_s) * step(0.0, -ndl_s);
         float lights_a = lum * nightMask * limb * uNightStrength;
         gl_FragColor.rgb += lights * lights_a * 1.3;`
      );
  };
}

/* ------------------------------------------------------------------------- */
/*  Atmosphere                                                                */
/* ------------------------------------------------------------------------- */

const ATMO_VERT = /* glsl */`
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/**
 * Single-shell Rayleigh-ish scattering model.
 *
 *   - The rim glow is a Schlick-style fresnel weighted by sun illumination
 *     so it dies on the night side and blooms on the day side.
 *   - Forward scatter (Mie-ish) gives a soft sun-side halo without a
 *     second shell.
 *   - The twilight tint is just a muted warm shift in the terminator band;
 *     no animated FBM, no separate sphere.
 */
const ATMO_FRAG = /* glsl */`
uniform vec3 uSunPos;
uniform float uIntensity;
uniform float uPower;
varying vec3 vNormalW;
varying vec3 vWorldPos;

const vec3 RAYLEIGH = vec3(0.16, 0.42, 0.95);
const vec3 TWILIGHT = vec3(1.0, 0.66, 0.36);
const vec3 HIGHLIGHT = vec3(0.74, 0.86, 1.0);

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunPos - vWorldPos);
  float ndl = dot(N, L);
  float ndv = abs(dot(N, V));

  // Day / night envelope.
  float lit = smoothstep(-0.55, 0.20, ndl);

  // Schlick-style fresnel for the rim.
  float fres = pow(1.0 - ndv, uPower);

  // Forward (Mie) scatter: brightest near the sun direction.
  float forward = pow(clamp(dot(V, -L), 0.0, 1.0), 6.0);

  // Twilight tint at the terminator, blended with day colour.
  float term = pow(clamp(1.0 - abs(ndl) * 1.9, 0.0, 1.0), 1.8);
  vec3 base = mix(RAYLEIGH, HIGHLIGHT, smoothstep(-0.10, 0.55, ndl));
  vec3 col = mix(base, TWILIGHT, term * 0.55);

  float rimA = fres * (0.20 + 0.80 * lit);
  float glow = forward * lit * 0.35;
  float a = clamp((rimA + glow) * uIntensity, 0.0, 1.0);

  gl_FragColor = vec4(col * (rimA + glow * 0.7) * uIntensity, a);
}
`;

/* ------------------------------------------------------------------------- */
/*  Clouds                                                                   */
/* ------------------------------------------------------------------------- */

const CLOUD_VERT = ATMO_VERT
  .replace(
    'varying vec3 vNormalW;',
    'varying vec3 vNormalW;\nvarying vec2 vCloudUv;'
  )
  .replace(
    'gl_Position = projectionMatrix * viewMatrix * wp;',
    'vCloudUv = uv;\n  gl_Position = projectionMatrix * viewMatrix * wp;'
  );

const CLOUD_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uSunPos;
uniform float uOpacity;
uniform float uEvolve;
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying vec2 vCloudUv;

void main() {
  float a = texture2D(uMap, vCloudUv).a;
  if (a < 0.02) discard;

  // Slowly scroll the cloud map along U for a gentle, never-distracting drift.
  vec2 uv = vec2(vCloudUv.x + uEvolve, vCloudUv.y);
  a *= texture2D(uMap, uv).a * 0.55 + a * 0.45;

  vec3 N = normalize(vNormalW);
  vec3 L = normalize(uSunPos - vWorldPos);
  float ndl = dot(N, L);
  float lit = smoothstep(-0.10, 0.35, ndl);
  // Subtle warm tint at the terminator.
  float term = pow(clamp(1.0 - abs(ndl) * 2.2, 0.0, 1.0), 2.0);
  vec3 col = mix(vec3(0.78, 0.84, 0.96), vec3(1.0, 0.88, 0.74), term * 0.45);
  col *= lit;

  gl_FragColor = vec4(col, clamp(a * uOpacity, 0.0, 1.0));
}
`;

/* ------------------------------------------------------------------------- */
/*  Earth                                                                    */
/* ------------------------------------------------------------------------- */

export class Earth {
  constructor(textures, spinGroup, sunPosition, envMap = null) {
    this.textures = textures;
    this.sunPosition = sunPosition;
    this.envMap = envMap;
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
    this._sunDir = new THREE.Vector3();

    this.buildSurface();
    this.buildClouds();
    this.buildAtmosphere();
  }

  buildSurface() {
    const geometry = new THREE.SphereGeometry(this.radius, 160, 96);
    this.surfaceMaterial = new THREE.MeshStandardMaterial({
      map: this.textures['earth_day.jpg'],
      normalMap: this.textures['earth_normal.jpg'],
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: this.textures['earth_roughness'] || this.textures['earth_specular.jpg'],
      roughness: 1.0,
      metalness: 0.0,
      envMap: this.envMap,
      envMapIntensity: 0.35
    });
    // Override roughnessMap wrap to repeat (asset loader already sets it).
    if (this.surfaceMaterial.roughnessMap) {
      this.surfaceMaterial.roughnessMap.wrapS = THREE.RepeatWrapping;
    }
    this.surfaceUniforms = {
      uSunDir: { value: new THREE.Vector3(0, 0, 1) },
      uNightMap: { value: this.textures['earth_night.jpg'] || null },
      uNightStrength: { value: 1.0 },
      uTwilightStrength: { value: 0.55 }
    };
    this.surfaceMaterial.onBeforeCompile = buildSurfaceShader(this.surfaceUniforms);
    // v4: forces Three.js to discard any cached program compiled with the
    // older shader source (lights on day-side bug).
    this.surfaceMaterial.customProgramCacheKey = () => 'earth-surface-v4';
    this.surface = new THREE.Mesh(geometry, this.surfaceMaterial);
    this.surface.name = 'earth-surface';
    this.spin.add(this.surface);
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
        uEvolve: { value: 0.0 }
      },
      vertexShader: CLOUD_VERT,
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
        uPower: { value: ATMOSPHERE.rimPowerBase }
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
    this.atmoMaterial.uniforms.uIntensity.value = ATMOSPHERE.intensityBase + near * ATMOSPHERE.intensityNear;
    this.atmoMaterial.uniforms.uPower.value = ATMOSPHERE.rimPowerBase + near * ATMOSPHERE.rimPowerNear;

    // Push sun direction in *world* space into the surface shader.
    this._sunDir.copy(this.sunPosition).sub(this._center);
    if (this._sunDir.lengthSq() > 1e-8) this._sunDir.normalize();
    this.surfaceUniforms.uSunDir.value.copy(this._sunDir);
  }

  setNormalScale(value) {
    this.surfaceMaterial.normalScale.set(value, value);
  }

  applyLOD({ surfaceSegments, cloudSegments } = {}) {
    if (surfaceSegments) {
      this.surface.geometry.dispose();
      this.surface.geometry = new THREE.SphereGeometry(this.radius, surfaceSegments[0], surfaceSegments[1]);
    }
    if (cloudSegments && this.clouds) {
      this.clouds.geometry.dispose();
      this.clouds.geometry = new THREE.SphereGeometry(
        this.radius * CLOUDS.scale,
        cloudSegments[0],
        cloudSegments[1]
      );
    }
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