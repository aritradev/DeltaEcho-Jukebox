// Full-screen WebGL2 "light speed" loading effect.
// Fragment shader by Matthias Hurrle (@atzedent), ported to vanilla JS.
//
// The effect is intentionally short-lived: it renders while the textures load,
// then `stop()` deletes the program, buffer, and context so the main Three.js
// scene owns the only WebGL context again.

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
out vec4 O;
uniform float time;
uniform vec2 resolution;

#define FC gl_FragCoord.xy
#define R  resolution
#define T  time
#define hue(a) (.6+.6*cos(6.3*(a)+vec3(0,83,21)))

float rnd(float a) {
  vec2 p = fract(a * vec2(12.9898, 78.233));
  p += dot(p, p*345.);
  return fract(p.x * p.y);
}
vec3 pattern(vec2 uv) {
  vec3 col = vec3(0.);
  for (float i=.0; i++<20.;) {
    float a = rnd(i);
    vec2 n = vec2(a, fract(a*34.56));
    vec2 p = sin(n*(T+7.) + T*.5);
    float d = dot(uv-p, uv-p);
    col += .00125/d * hue(dot(uv,uv) + i*.125 + T);
  }
  return col;
}
void main(void) {
  vec2 uv = (FC - .5 * R) / min(R.x, R.y);
  vec3 col = vec3(0.);
  float s = 2.4;
  float a = atan(uv.x, uv.y);
  float b = length(uv);
  uv = vec2(a * 5. / 6.28318, .05 / tan(b) + T);
  uv = fract(uv) - .5;
  col += pattern(uv * s);
  O = vec4(col, 1.);
}`;

const VERTEX_SOURCE = `#version 300 es
precision highp float;
in vec2 position;
void main(){
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// Keep the loader cheap: the effect is soft, so a small buffer upscaled by CSS
// looks the same while costing a fraction of a native-resolution shader.
const MAX_PIXELS = 520000;
const MAX_DPR = 1.25;
const FPS = 30;

export class SpaceDive {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.program = null;
    this.vbo = null;
    this.timeLoc = null;
    this.resolutionLoc = null;
    this.raf = 0;
    this.running = false;
    this.supported = false;
    this.disposed = false;
    this.disposeScheduled = false;
    this.idleHandle = 0;
    this.disposeTimer = 0;
    this.speed = 1;
    this.elapsed = 0;
    this.lastDraw = 0;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.onResize = () => this.resize();
    this.onVisibility = () => this.handleVisibility();
    this.onContextLost = (event) => {
      event.preventDefault();
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.canvas) this.canvas.style.display = 'none';
    };
  }

  start() {
    if (this.running) return true;
    this.disposed = false;
    this.disposeScheduled = false;
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power'
    });
    if (!gl) return this.fallback();

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader) || 'shader compile error';
        gl.deleteShader(shader);
        throw new Error(info);
      }
      return shader;
    };

    try {
      const vertex = compile(gl.VERTEX_SHADER, VERTEX_SOURCE);
      const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
      const program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || 'program link error';
        gl.deleteProgram(program);
        throw new Error(info);
      }
      this.gl = gl;
      this.program = program;
      this.timeLoc = gl.getUniformLocation(program, 'time');
      this.resolutionLoc = gl.getUniformLocation(program, 'resolution');
    } catch (error) {
      console.warn('loader effect unavailable:', error.message);
      return this.fallback();
    }

    gl.useProgram(this.program);

    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.running = true;
    this.supported = true;
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.resize();

    if (this.reducedMotion) {
      this.elapsed = 7;
      this.render(performance.now());
      return true;
    }

    this.raf = requestAnimationFrame(this.frame);
    return true;
  }

  fallback() {
    this.supported = false;
    this.running = false;
    if (this.canvas) this.canvas.style.display = 'none';
    return false;
  }

  resize() {
    const gl = this.gl;
    if (!gl) return;
    const cssWidth = this.canvas.clientWidth || window.innerWidth;
    const cssHeight = this.canvas.clientHeight || window.innerHeight;
    const scale = Math.min(MAX_DPR, Math.sqrt(MAX_PIXELS / (cssWidth * cssHeight)));
    const width = Math.max(1, Math.round(cssWidth * scale));
    const height = Math.max(1, Math.round(cssHeight * scale));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.uniform2f(this.resolutionLoc, width, height);
  }

  // Rushes the tunnel during the reveal, then `stop()` disposes the context.
  boost(multiplier = 2.4) {
    this.speed = multiplier;
  }

  render(now) {
    const gl = this.gl;
    if (!gl || !this.program) return;
    const delta = this.lastDraw ? Math.min((now - this.lastDraw) * 0.001, 0.1) : 0;
    this.lastDraw = now;
    this.elapsed += delta * this.speed;
    gl.useProgram(this.program);
    gl.uniform1f(this.timeLoc, this.elapsed);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  frame = (now) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    if (now - this.lastDraw < 1000 / FPS) return;
    this.render(now);
  };

  handleVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else if (this.running && !this.reducedMotion && !this.raf) {
      this.lastDraw = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  // Stop drawing right away, but tear down the GL objects during idle. Calling
  // `WEBGL_lose_context` synchronously can block long enough to hitch the
  // reveal, and the canvas is already hidden by the time this runs.
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.canvas) {
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
      this.canvas.style.display = 'none';
    }
    this.scheduleDispose();
  }

  scheduleDispose() {
    if (this.disposed || this.disposeScheduled) return;
    this.disposeScheduled = true;
    const run = () => {
      this.disposeScheduled = false;
      this.dispose();
    };
    if ('requestIdleCallback' in window) {
      this.idleHandle = window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      this.disposeTimer = window.setTimeout(run, 600);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    if (gl) {
      if (this.program) {
        const shaders = gl.getAttachedShaders(this.program) || [];
        for (const shader of shaders) gl.deleteShader(shader);
        gl.deleteProgram(this.program);
      }
      if (this.vbo) gl.deleteBuffer(this.vbo);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
    this.gl = null;
    this.program = null;
    this.vbo = null;
  }
}
