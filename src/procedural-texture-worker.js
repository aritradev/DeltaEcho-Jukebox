import { generateProceduralTextures } from './procedural-textures.js';

self.onmessage = ({ data: job }) => {
  try {
    const computation = generateProceduralTextures(job);
    let step;
    do {
      step = computation.next();
    } while (!step.done);
    const textures = step.value;
    self.postMessage({ textures }, textures.map((texture) => texture.data.buffer));
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
