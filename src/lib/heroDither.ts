// Dithered-warp background field — a dependency-free WebGL port of the same
// effect the main Paracausal Telemetry site uses behind its heroes, so the
// Alchemist landing shares the identical "flowing" background. A domain-warped
// fbm noise field drifts slowly and is quantised through a 4x4 Bayer matrix
// for the chunky ordered-dither sweep. The canvas renders one cell per fragment
// (buffer ~= CSS size / CELL_PX) and is upscaled with image-rendering: pixelated,
// so GPU cost stays tiny. Foreground colour is read from the canvas' computed
// CSS `color`, so it follows the theme (cobalt in dark, amber on paper);
// opacity/blend-mode live in CSS. Hovering the card eases the speed up.

const CELL_PX = 3;
const SPEED_REST = 0.2;
const SPEED_HOVER = 0.6;

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_color;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  uv.x *= u_res.x / u_res.y;

  vec2 p = uv * 3.0;
  vec2 w = vec2(
    fbm(p + vec2(0.0, 0.0) + u_time * 0.10),
    fbm(p + vec2(5.2, 1.3) - u_time * 0.13)
  );
  float f = fbm(p + 2.4 * w + vec2(u_time * 0.05, 0.0));
  f = smoothstep(0.32, 0.78, f);

  float d = step(bayer4(gl_FragCoord.xy) + 0.001, f);
  gl_FragColor = vec4(u_color * d, d);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function parseCssColor(value: string): [number, number, number] {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(value || "");
  return m ? [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255] : [0.36, 0.55, 1];
}

function initCanvas(canvas: HTMLCanvasElement, reducedMotion: boolean): void {
  const card = canvas.closest<HTMLElement>(".hero-card, .page-hero-card") ?? canvas.parentElement;
  if (!(card instanceof HTMLElement)) {
    return;
  }

  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: "low-power"
  });
  if (!gl) {
    return; // no WebGL: the card keeps its flat surface
  }

  const vert = compile(gl, gl.VERTEX_SHADER, VERT);
  const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vert || !frag) {
    return;
  }
  const program = gl.createProgram();
  if (!program) {
    return;
  }
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return;
  }
  gl.useProgram(program);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(program, "u_res");
  const uTime = gl.getUniformLocation(program, "u_time");
  const uColor = gl.getUniformLocation(program, "u_color");

  const syncColor = () => gl.uniform3fv(uColor, parseCssColor(getComputedStyle(canvas).color));
  syncColor();
  // The theme toggle swaps body.light-mode; re-read the accent when it does.
  new MutationObserver(syncColor).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(2, Math.round(rect.width / CELL_PX));
    const h = Math.max(2, Math.round(rect.height / CELL_PX));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    }
  };

  let time = 7.0;
  let speed = SPEED_REST;
  let speedTarget = SPEED_REST;
  let prev = 0;
  let frameHandle = 0;

  const draw = () => {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  if (reducedMotion) {
    resize();
    draw();
    window.addEventListener("resize", () => {
      resize();
      draw();
    });
    return;
  }

  const step = (now: number) => {
    frameHandle = window.requestAnimationFrame(step);
    const dt = Math.min(0.1, (now - prev) / 1000 || 0);
    prev = now;
    speed += (speedTarget - speed) * Math.min(1, dt * 5);
    time += dt * speed;
    resize();
    draw();
  };

  const start = () => {
    if (frameHandle) {
      return;
    }
    prev = performance.now();
    frameHandle = window.requestAnimationFrame(step);
  };

  const stop = () => {
    if (!frameHandle) {
      return;
    }
    window.cancelAnimationFrame(frameHandle);
    frameHandle = 0;
  };

  card.addEventListener("mouseenter", () => {
    speedTarget = SPEED_HOVER;
  });
  card.addEventListener("mouseleave", () => {
    speedTarget = SPEED_REST;
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => (entry.isIntersecting ? start() : stop()));
    }).observe(card);
  } else {
    start();
  }
}

/** Initialises every `canvas.hero-dither` on the page. Safe to call once after mount. */
export function initHeroDither(): void {
  const canvases = document.querySelectorAll<HTMLCanvasElement>("canvas.hero-dither");
  if (!canvases.length) {
    return;
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  canvases.forEach((canvas) => initCanvas(canvas, reducedMotion));
}
