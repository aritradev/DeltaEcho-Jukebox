// Lightweight backdrop for the Sonification Lab.
//
// The main app bakes its nebula in a worker from the same smoke brush and
// renders the stars in Three.js. The lab does not need a full 3D scene, so it
// bakes the same nebula once, paints it as the canvas background, and drifts a
// small field of stars on top. If the worker or WebGL-free canvas path fails,
// studio.css still provides a radial nebula fallback behind the transparent
// canvas.

import { computeProceduralTextures } from './procedural-texture-job.js';
import { textureRandom } from './procedural-textures.js';

const TAU = Math.PI * 2;
const STAR_COUNT = 220;

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function readSmokePixels(image) {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    data: ctx.getImageData(0, 0, image.width, image.height).data
  };
}

async function loadSmokeBrush() {
  const image = new Image();
  image.src = './assets/textures/smoke.png';
  await image.decode();
  return readSmokePixels(image);
}

async function bakeNebula(canvas) {
  const brush = await loadSmokeBrush();
  const rng = textureRandom(20260925);
  const [pixels] = await computeProceduralTextures({
    type: 'nebula',
    seed: rng.getState(),
    brush
  });
  const source = createCanvas(pixels.width, pixels.height);
  const ctx = source.getContext('2d');
  const image = ctx.createImageData(pixels.width, pixels.height);
  image.data.set(pixels.data);
  ctx.putImageData(image, 0, 0);
  canvas.style.backgroundImage = `url(${source.toDataURL('image/jpeg', 0.82)})`;
  canvas.style.backgroundSize = 'cover';
  canvas.style.backgroundPosition = 'center 42%';
  canvas.style.backgroundRepeat = 'no-repeat';
}

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

function makeStars() {
  const rand = mulberry32(20261113);
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const warm = rand();
    stars.push({
      x: rand(),
      y: rand(),
      radius: 0.35 + Math.pow(rand(), 2.2) * 1.25,
      alpha: 0.18 + Math.pow(rand(), 1.6) * 0.72,
      phase: rand() * TAU,
      twinkle: 0.25 + rand() * 1.1,
      drift: 0.0015 + rand() * 0.004,
      color: warm > 0.78 ? '255, 244, 226' : warm > 0.4 ? '214, 230, 255' : '190, 214, 255'
    });
  }
  return stars;
}

export function initStudioSky(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const stars = makeStars();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let ratio = 1;
  let raf = 0;
  let last = 0;
  let elapsed = 0;

  const resize = () => {
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(1, Math.round(window.innerWidth * ratio));
    height = Math.max(1, Math.round(window.innerHeight * ratio));
    canvas.width = width;
    canvas.height = height;
    draw(0);
  };

  const draw = (delta) => {
    elapsed += delta;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    for (const star of stars) {
      const x = ((star.x + star.drift * elapsed) % 1 + 1) % 1;
      const y = ((star.y + star.drift * 0.22 * elapsed) % 1 + 1) % 1;
      const twinkle = 0.62 + 0.38 * Math.sin(elapsed * star.twinkle + star.phase);
      ctx.globalAlpha = Math.min(1, star.alpha * twinkle);
      ctx.fillStyle = `rgb(${star.color})`;
      ctx.beginPath();
      ctx.arc(x * width, y * height, star.radius * ratio, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  const step = (time) => {
    const seconds = time / 1000;
    const delta = last ? Math.min(0.1, seconds - last) : 0;
    last = seconds;
    draw(delta);
    raf = window.requestAnimationFrame(step);
  };

  const start = () => {
    if (raf || reduced.matches || document.hidden) return;
    last = 0;
    raf = window.requestAnimationFrame(step);
  };

  const stop = () => {
    if (!raf) return;
    window.cancelAnimationFrame(raf);
    raf = 0;
  };

  resize();
  if (!reduced.matches) start();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
  reduced.addEventListener?.('change', () => {
    if (reduced.matches) {
      stop();
      draw(0);
    } else {
      start();
    }
  });

  // The nebula is the expensive part and is not needed for the stars to show.
  bakeNebula(canvas).catch((error) => {
    console.warn('Studio nebula backdrop unavailable', error);
  });

  return { stop, start };
}
