import * as THREE from 'three';

const NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec4 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec4 i = floor(v + dot(v, C.yyyy));
  vec4 x0 = v - i + dot(i, C.xxxx);

  vec4 i0;
  vec3 isX = step(x0.yzw, x0.xxx);
  vec3 isYZ = step(x0.zww, x0.yyz);
  i0.x = isX.x + isX.y + isX.z;
  i0.yzw = 1.0 - isX;
  i0.y += isYZ.x + isYZ.y;
  i0.zw += 1.0 - isYZ.xy;
  i0.z += isYZ.z;
  i0.w += 1.0 - isYZ.z;

  vec4 i3 = clamp(i0, 0.0, 1.0);
  vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
  vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);

  vec4 x1 = x0 - i1 + C.x;
  vec4 x2 = x0 - i2 + C.y * 2.0;
  vec4 x3 = x0 - i3 + C.z * 3.0;

  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0.xyz), dot(p1, x1.xyz), dot(p2, x2.xyz), dot(p3, x3.xyz)));
}
`;

const BAKE_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BAKE_FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uSpatialFrequency;
uniform float uH;
uniform float uContrast;
uniform float uFlatten;
${NOISE_GLSL}

vec2 fbm(vec4 p) {
  float amp = 1.0;
  float freq = 1.0;
  vec2 sum = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    sum.x += snoise(p * freq) * amp;
    p.w += 100.0;
    sum.y += snoise(p * freq) * amp;
    amp *= uH;
    freq *= 2.0;
  }
  return sum;
}

void main() {
  vec3 d = normalize(vDir) + 12.45;
  vec4 p = vec4(d * uSpatialFrequency, 0.0);
  vec2 f = fbm(p) * uContrast + 0.5;
  float modulate = max(snoise(vec4(d * 2.0, 0.0)), 0.0);
  float x = mix(f.x, f.x * modulate, uFlatten);
  gl_FragColor = vec4(x, f.y, f.y, x);
}
`;

const DISC_VERT = `
varying vec3 vWorld;
varying vec3 vNormalView;
varying vec3 vNormalWorld;
varying vec3 vLayer0;
varying vec3 vLayer1;
varying vec3 vLayer2;
uniform float uTime;

mat2 rot(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }

void setLayers(vec3 p) {
  vec3 p1 = p;
  p1.yz = rot(uTime) * p1.yz;
  vLayer0 = p1;
  p1 = p;
  p1.zx = rot(uTime + 2.094) * p1.zx;
  vLayer1 = p1;
  p1 = p;
  p1.xy = rot(uTime - 4.188) * p1.xy;
  vLayer2 = p1;
}

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalView = normalize(normalMatrix * normal);
  vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  setLayers(normalize(normal));
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const DISC_FRAG = `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormalView;
varying vec3 vNormalWorld;
varying vec3 vLayer0;
varying vec3 vLayer1;
varying vec3 vLayer2;

uniform samplerCube uNoise;
uniform float uFresnelPower;
uniform float uFresnelInfluence;
uniform float uTint;
uniform float uBase;
uniform float uBrightnessOffset;
uniform float uBrightness;

vec3 brightnessToColor(float b) {
  b *= uTint;
  return (vec3(b, b * b, b * b * b * b) / uTint) * uBrightness;
}

float field() {
  float s = 0.0;
  s += textureCube(uNoise, vLayer0).r;
  s += textureCube(uNoise, vLayer1).r;
  s += textureCube(uNoise, vLayer2).r;
  return s * 0.3333333;
}

void main() {
  vec3 viewDir = normalize((viewMatrix * vec4(vWorld - cameraPosition, 0.0)).xyz);
  float nDotV = dot(vNormalView, -viewDir);
  float fresnel = pow(1.0 - nDotV, uFresnelPower) * uFresnelInfluence;
  float brightness = field() * uBase + uBrightnessOffset + fresnel;
  vec3 col = clamp(brightnessToColor(brightness), 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

const GLOW_VERT = `
attribute vec4 aDisc;
varying float vAlpha;
uniform float uInner;
uniform float uOuter;
void main() {
  vAlpha = aDisc.w;
  vec3 centerW = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = normalize(cameraPosition - centerW);
  vec3 upRef = abs(toCam.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 side = normalize(cross(upRef, toCam));
  vec3 up = cross(toCam, side);
  float s = mix(uInner, uOuter, aDisc.z);
  vec3 pW = centerW + (aDisc.x * side + aDisc.y * up) * s;
  gl_Position = projectionMatrix * viewMatrix * vec4(pW, 1.0);
}
`;

const GLOW_FRAG = `
precision highp float;
varying float vAlpha;
uniform float uOpacity;
uniform float uTint;
uniform float uBrightness;
uniform float uFalloff;

vec3 brightnessToColor(float b) {
  b *= uTint;
  return (vec3(b, b * b, b * b * b * b) / uTint) * uBrightness;
}

void main() {
  float alpha = vAlpha * uOpacity;
  float brightness = 1.0 + alpha * uFalloff;
  gl_FragColor = vec4(brightnessToColor(brightness) * alpha, alpha);
}
`;

const RAYS_VERT = `
attribute vec3 aOrigin;
attribute vec4 aSeed;
varying float vAcross;
varying float vOpacity;
varying vec3 vColor;
varying vec3 vNormal;
uniform float uHue;
uniform float uHueSpread;
uniform float uLength;
uniform float uWidth;
uniform float uTime;
uniform float uNoiseFrequency;
uniform float uNoiseAmplitude;
uniform float uOpacity;
uniform float uRadius;

vec3 warp(vec3 p, float t) {
  vec3 q = p * uNoiseFrequency;
  vec3 acc = vec3(0.0);
  float a = 1.0;
  for (int i = 0; i < 3; i++) {
    acc += sin(q.yzx * (1.0 + t * 0.35) + vec3(0.0, 2.1, 4.2)) * a;
    q = q * 1.7 + acc * 0.4;
    a *= 0.55;
  }
  return acc;
}

vec3 rayPoint(float phase, float anim) {
  float size = aSeed.z + 0.2;
  float d = phase * uLength * size;
  vec3 p = aOrigin + aOrigin * d;
  p += warp(p, anim) * (d * uNoiseAmplitude);
  return p * uRadius;
}

vec3 spectrum(float s) {
  return smoothstep(0.25, 0.0, abs(s + vec3(-0.375, -0.5, -0.625)));
}

void main() {
  float anim = fract(uTime * 0.3 * (aSeed.y * 0.5) + aSeed.x);
  vAcross = position.z;

  vec3 p0 = rayPoint(position.x, anim);
  vec3 p1 = rayPoint(min(position.x + 0.01, 1.0), anim);
  vec3 p0W = (modelMatrix * vec4(p0, 1.0)).xyz;
  vec3 p1W = (modelMatrix * vec4(p1, 1.0)).xyz;

  vec3 dirW = normalize(p1W - p0W);
  vec3 vW = normalize(p0W - cameraPosition);
  vec3 sideW = normalize(cross(vW, dirW));
  if (length(sideW) < 1e-6) {
    vec3 up = abs(dirW.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    sideW = normalize(cross(up, dirW));
  }

  float width = uWidth * position.z * (1.0 - position.x) * uRadius;
  vec3 pW = p0W + sideW * width;

  vec3 centerW = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vNormal = normalize(pW - centerW);
  vOpacity = uOpacity * (0.5 + aSeed.w);
  vColor = spectrum(aSeed.w * uHueSpread + uHue);
  gl_Position = projectionMatrix * viewMatrix * vec4(pW, 1.0);
}
`;

const RAYS_FRAG = `
precision highp float;
varying float vAcross;
varying float vOpacity;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  float alpha = 1.0 - smoothstep(0.0, 1.0, abs(vAcross));
  alpha *= alpha;
  alpha *= vOpacity;
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;

const FLARES_VERT = `
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec4 aSeed;
varying float vAcross;
varying float vOpacity;
varying vec3 vColor;
uniform float uHue;
uniform float uHueSpread;
uniform float uWidth;
uniform float uAmp;
uniform float uTime;
uniform float uNoiseFrequency;
uniform float uNoiseAmplitude;
uniform float uOpacity;
uniform float uRadius;

vec3 warp(vec3 p, float t) {
  vec3 q = p * uNoiseFrequency;
  vec3 acc = vec3(0.0);
  float a = 1.0;
  for (int i = 0; i < 3; i++) {
    acc += sin(q.yzx * (1.0 + t * 0.35) + vec3(0.0, 2.1, 4.2)) * a;
    q = q * 1.7 + acc * 0.4;
    a *= 0.55;
  }
  return acc;
}

vec3 arcPoint(float phase, float anim) {
  float size = distance(aStart, aEnd);
  vec3 n = normalize((aStart + aEnd) * 0.5);
  vec3 p = mix(aStart, aEnd, phase);
  float amp = sin(phase * 3.14159265) * size * uAmp;
  amp *= anim;
  p += n * amp;
  p += warp(p, anim) * (amp * uNoiseAmplitude);
  return p * uRadius;
}

vec3 hue(float v) {
  return 0.6 + 0.6 * cos(6.3 * v + vec3(0.0, 23.0, 21.0));
}

void main() {
  float anim = fract(uTime * 0.3 * (aSeed.y * 0.5) + aSeed.x);
  vAcross = position.z;

  vec3 pW = (modelMatrix * vec4(arcPoint(position.x, anim), 1.0)).xyz;
  vec3 p1W = (modelMatrix * vec4(arcPoint(min(position.x + 0.01, 1.0), anim), 1.0)).xyz;
  vec3 dirW = normalize(p1W - pW);
  vec3 vW = normalize(pW - cameraPosition);
  vec3 sideW = normalize(cross(vW, dirW));
  if (length(sideW) < 1e-6) {
    vec3 up = abs(dirW.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    sideW = normalize(cross(up, dirW));
  }

  vec3 centerW = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float R = length((modelMatrix * vec4(aStart, 1.0)).xyz - centerW);
  float width = uWidth * position.z * (1.0 + anim) * R;
  pW += sideW * width;

  float lenW = length(pW - centerW);
  vOpacity = smoothstep(R, R * 1.18, lenW);
  vOpacity *= 1.0 - anim;
  vOpacity *= uOpacity;
  vColor = hue(aSeed.w * uHueSpread + uHue);
  gl_Position = projectionMatrix * viewMatrix * vec4(pW, 1.0);
}
`;

const FLARES_FRAG = `
precision highp float;
varying float vAcross;
varying float vOpacity;
varying vec3 vColor;
uniform float uAlphaBlended;
void main() {
  float alpha = smoothstep(1.0, 0.0, abs(vAcross));
  alpha *= alpha;
  alpha *= vOpacity;
  gl_FragColor = vec4(vColor * alpha, alpha * uAlphaBlended);
}
`;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomDirection(rand, target) {
  const z = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return target.set(r * Math.cos(a), r * Math.sin(a), z);
}

function buildNoiseCube(renderer, size) {
  const target = new THREE.WebGLCubeRenderTarget(size, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter
  });
  const material = new THREE.ShaderMaterial({
    vertexShader: BAKE_VERT,
    fragmentShader: BAKE_FRAG,
    uniforms: {
      uSpatialFrequency: { value: 6 },
      uH: { value: 0.55 },
      uContrast: { value: 0.6 },
      uFlatten: { value: 0.55 }
    },
    side: THREE.BackSide
  });
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  scene.add(mesh);
  const camera = new THREE.CubeCamera(0.1, 10, target);

  const previous = renderer.getRenderTarget();
  camera.update(renderer, scene);
  renderer.setRenderTarget(previous);

  mesh.geometry.dispose();
  material.dispose();

  return target.texture;
}

function buildGlowGeometry(segments) {
  const rings = [
    { r: 0.0, a: 0.0 },
    { r: 0.0, a: 1.0 },
    { r: 0.42, a: 0.3 },
    { r: 1.0, a: 0.0 }
  ];
  const total = 1 + segments * (rings.length - 1);
  const data = new Float32Array(total * 4);
  data[0] = 0; data[1] = 0; data[2] = rings[0].r; data[3] = rings[0].a;
  for (let g = 1; g < rings.length; g += 1) {
    for (let i = 0; i < segments; i += 1) {
      const ang = (i / segments) * Math.PI * 2;
      const o = (1 + (g - 1) * segments + i) * 4;
      data[o] = Math.cos(ang);
      data[o + 1] = Math.sin(ang);
      data[o + 2] = rings[g].r;
      data[o + 3] = rings[g].a;
    }
  }

  const indices = [];
  const at = (g, i) => 1 + (g - 1) * segments + (i % segments);
  for (let i = 0; i < segments; i += 1) {
    indices.push(0, at(1, i), at(1, i + 1));
    for (let g = 1; g < rings.length - 1; g += 1) {
      const a = at(g, i), b = at(g, i + 1);
      const c = at(g + 1, i), d = at(g + 1, i + 1);
      indices.push(a, c, d, a, d, b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('aDisc', new THREE.BufferAttribute(data, 4));
  geometry.setIndex(indices);
  return geometry;
}

function buildRibbonIndices(strands, segments) {
  const indices = [];
  const stride = (segments + 1) * 2;
  for (let s = 0; s < strands; s += 1) {
    const base = s * stride;
    for (let i = 0; i < segments; i += 1) {
      const a = base + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  return indices;
}

function buildRayGeometry(count, segments, rand) {
  const positions = new Float32Array(count * (segments + 1) * 2 * 3);
  const origins = new Float32Array(count * (segments + 1) * 2 * 3);
  const seeds = new Float32Array(count * (segments + 1) * 2 * 4);
  const dir = new THREE.Vector3();
  let p = 0;
  let q = 0;
  let s = 0;

  for (let n = 0; n < count; n += 1) {
    randomDirection(rand, dir);
    const seed = [rand(), rand(), rand(), rand()];
    for (let i = 0; i <= segments; i += 1) {
      const phase = i / segments;
      for (const across of [-1, 1]) {
        positions[p] = phase;
        positions[p + 1] = 0;
        positions[p + 2] = across;
        p += 3;
        origins[q] = dir.x;
        origins[q + 1] = dir.y;
        origins[q + 2] = dir.z;
        q += 3;
        seeds[s] = seed[0];
        seeds[s + 1] = seed[1];
        seeds[s + 2] = seed[2];
        seeds[s + 3] = seed[3];
        s += 4;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.setIndex(buildRibbonIndices(count, segments));
  return geometry;
}

function buildFlareGeometry(chains, stepsPerChain, segments, rand) {
  const arcs = [];
  const dir = new THREE.Vector3();
  const next = new THREE.Vector3();
  const axis = new THREE.Vector3();

  for (let c = 0; c < chains; c += 1) {
    randomDirection(rand, dir);
    const start = dir.clone();
    for (let s = 0; s < stepsPerChain; s += 1) {
      axis.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0);
      axis.normalize();
      next.copy(dir).applyAxisAngle(axis, 0.34 + rand() * 0.26).normalize();
      if (rand() < 0.02) {
        randomDirection(rand, next);
      }
      arcs.push([dir.clone(), next.clone(), rand(), rand(), rand(), rand()]);
      dir.copy(next);
    }
    dir.copy(start);
  }

  const total = arcs.length;
  const positions = new Float32Array(total * (segments + 1) * 2 * 3);
  const starts = new Float32Array(total * (segments + 1) * 2 * 3);
  const ends = new Float32Array(total * (segments + 1) * 2 * 3);
  const seeds = new Float32Array(total * (segments + 1) * 2 * 4);
  let p = 0;
  let a = 0;
  let b = 0;
  let s = 0;

  for (const arc of arcs) {
    for (let i = 0; i <= segments; i += 1) {
      const phase = i / segments;
      for (const across of [-1, 1]) {
        positions[p] = phase;
        positions[p + 1] = 0;
        positions[p + 2] = across;
        p += 3;
        starts[a] = arc[0].x;
        starts[a + 1] = arc[0].y;
        starts[a + 2] = arc[0].z;
        a += 3;
        ends[b] = arc[1].x;
        ends[b + 1] = arc[1].y;
        ends[b + 2] = arc[1].z;
        b += 3;
        seeds[s] = arc[2];
        seeds[s + 1] = arc[3];
        seeds[s + 2] = arc[4];
        seeds[s + 3] = arc[5];
        s += 4;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aStart', new THREE.BufferAttribute(starts, 3));
  geometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.setIndex(buildRibbonIndices(total, segments));
  return geometry;
}

export function createSun({ radius, renderer, quality = {} }) {
  const rays = quality.rays ?? 1800;
  const raySegments = quality.raySegments ?? 6;
  const flareChains = quality.flareChains ?? 90;
  const flareSteps = quality.flareSteps ?? 10;
  const flareSegments = quality.flareSegments ?? 10;
  const bakeSize = quality.bakeSize ?? 256;

  const group = new THREE.Group();
  const noiseCube = buildNoiseCube(renderer, bakeSize);

  const discMaterial = new THREE.ShaderMaterial({
    vertexShader: DISC_VERT,
    fragmentShader: DISC_FRAG,
    uniforms: {
      uNoise: { value: noiseCube },
      uFresnelPower: { value: 1 },
      uFresnelInfluence: { value: 0.8 },
      uTint: { value: 0.2 },
      uBase: { value: 6 },
      uBrightnessOffset: { value: 1 },
      uBrightness: { value: 0.72 },
      uTime: { value: 0 }
    }
  });
  const disc = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), discMaterial);
  disc.frustumCulled = false;
  group.add(disc);

  const flareMaterial = new THREE.ShaderMaterial({
    vertexShader: FLARES_VERT,
    fragmentShader: FLARES_FRAG,
    uniforms: {
      uHue: { value: 0.0 },
      uHueSpread: { value: 0.16 },
      uWidth: { value: 0.012 },
      uAmp: { value: 0.9 },
      uTime: { value: 0 },
      uNoiseFrequency: { value: 8 },
      uNoiseAmplitude: { value: 0.4 },
      uOpacity: { value: 1.6 },
      uRadius: { value: radius },
      uAlphaBlended: { value: 0.65 }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    premultipliedAlpha: true
  });
  const flares = new THREE.Mesh(
    buildFlareGeometry(flareChains, flareSteps, flareSegments, mulberry32(9137)),
    flareMaterial
  );
  flares.frustumCulled = false;
  flares.renderOrder = 1;
  group.add(flares);

  const glowMaterial = new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: {
      uInner: { value: radius * 0.98 },
      uOuter: { value: radius * 1.2 },
      uOpacity: { value: 1 },
      uTint: { value: 0.4 },
      uBrightness: { value: 1.06 },
      uFalloff: { value: 0.5 }
    },
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true
  });
  const glow = new THREE.Mesh(buildGlowGeometry(134), glowMaterial);
  glow.frustumCulled = false;
  glow.renderOrder = 2;
  group.add(glow);

  const rayMaterial = new THREE.ShaderMaterial({
    vertexShader: RAYS_VERT,
    fragmentShader: RAYS_FRAG,
    uniforms: {
      uHue: { value: 0.5 },
      uHueSpread: { value: 0.16 },
      uLength: { value: 0.17 },
      uWidth: { value: 0.04 },
      uTime: { value: 0 },
      uNoiseFrequency: { value: 8 },
      uNoiseAmplitude: { value: 0.4 },
      uOpacity: { value: 0.045 },
      uRadius: { value: radius }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true
  });
  const rayMesh = new THREE.Mesh(
    buildRayGeometry(rays, raySegments, mulberry32(4421)),
    rayMaterial
  );
  rayMesh.frustumCulled = false;
  rayMesh.renderOrder = 3;
  group.add(rayMesh);

  let coronaScale = 1;

  return {
    group,
    setCorona(scale) {
      coronaScale = scale;
      glowMaterial.uniforms.uOpacity.value = scale;
      flareMaterial.uniforms.uOpacity.value = 1.6 * scale;
      rayMaterial.uniforms.uOpacity.value = 0.045 * scale;
    },
    update(elapsed) {
      discMaterial.uniforms.uTime.value = elapsed * 0.04;
      glow.rotation.z = elapsed * 0.02;
      rayMaterial.uniforms.uTime.value = elapsed;
      flareMaterial.uniforms.uTime.value = elapsed;
    },
    get disc() {
      return disc;
    },
    get coronaScale() {
      return coronaScale;
    }
  };
}
