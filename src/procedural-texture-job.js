import { generateProceduralTextures } from './procedural-textures.js';

function yieldToMain() {
  return globalThis.scheduler?.yield
    ? globalThis.scheduler.yield()
    : new Promise((resolve) => setTimeout(resolve, 0));
}

async function computeCooperatively(job) {
  const computation = generateProceduralTextures(job);
  await yieldToMain();
  let sliceStart = performance.now();
  while (true) {
    const step = computation.next();
    if (step.done) return step.value;
    if (performance.now() - sliceStart >= 8) {
      await yieldToMain();
      sliceStart = performance.now();
    }
  }
}

export async function computeProceduralTextures(job) {
  const start = performance.now();
  try {
    if (typeof Worker === 'undefined') return await computeCooperatively(job);

    return await new Promise((resolve, reject) => {
      let worker;
      let timeout;
      const finish = (error, textures) => {
        globalThis.clearTimeout(timeout);
        if (worker) {
          worker.onmessage = null;
          worker.onerror = null;
          worker.onmessageerror = null;
          worker.terminate();
        }
        if (error) reject(error);
        else resolve(textures);
      };

      try {
        worker = new Worker(new URL('./procedural-texture-worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          if (data?.error) {
            finish(new Error(data.error));
            return;
          }
          const textures = data?.textures;
          const count = job.type === 'nebula' ? 1 : 8;
          if (!Array.isArray(textures) || textures.length !== count || textures.some((texture) =>
            !texture || !Number.isInteger(texture.width) || texture.width <= 0 ||
            !Number.isInteger(texture.height) || texture.height <= 0 ||
            !(texture.data instanceof Uint8ClampedArray) ||
            texture.data.length !== texture.width * texture.height * 4
          )) {
            finish(new Error(`Invalid ${job.type} texture worker response`));
            return;
          }
          finish(null, textures);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          finish(new Error(event.message || `${job.type} texture worker failed`));
        };
        worker.onmessageerror = () => finish(new Error(`${job.type} texture worker message could not be read`));
        // A failed module fetch or a stalled worker must not leave the loader
        // waiting forever with no explanation.
        timeout = globalThis.setTimeout(() => {
          finish(new Error(`${job.type} texture generation timed out`));
        }, 20000);
        worker.postMessage(job, job.brush ? [job.brush.data.buffer] : []);
      } catch (error) {
        finish(error);
      }
    });
  } finally {
    performance.measure(`jukebox:${job.type}`, { start, end: performance.now() });
  }
}
