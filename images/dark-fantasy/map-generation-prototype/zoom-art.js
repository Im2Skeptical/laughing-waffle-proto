// Disposable colour renderer. Categorical water indices never enter this path.
// Resolve colours first, then prefilter shrinking art and sharpen enlargement.
const cache = new Map();
const vertex = `
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;
varying vec2 vUV;
void main() {
  vUV = aTextureCoord;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}`;
const fragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUV;
uniform sampler2D uFine;
uniform sampler2D uCoarse;
uniform vec2 uFineSize;
uniform vec2 uCoarseSize;
uniform vec2 uFineFootprint;
uniform vec2 uCoarseFootprint;
uniform float uBlend;
uniform float uAlpha;
vec2 sharpUV(vec2 size, vec2 footprint) {
  vec2 p = vUV * size;
  vec2 seam = floor(p + 0.5);
  vec2 uv = (seam + clamp((p - seam) / clamp(footprint, vec2(0.0001), vec2(1.0)), -0.5, 0.5)) / size;
  return clamp(uv, 0.5 / size, 1.0 - 0.5 / size);
}
void main() {
  vec4 a = texture2D(uFine, sharpUV(uFineSize, uFineFootprint));
  vec4 b = texture2D(uCoarse, sharpUV(uCoarseSize, uCoarseFootprint));
  gl_FragColor = mix(a, b, uBlend) * uAlpha;
}`;

function levelsFor(texture) {
  if (cache.has(texture)) return cache.get(texture);
  const levels = [], { frame } = texture;
  const source = texture.baseTexture.resource.source;
  if (frame.x || frame.y || frame.width !== texture.baseTexture.width || frame.height !== texture.baseTexture.height) {
    const canvas = document.createElement('canvas'); canvas.width = texture.width; canvas.height = texture.height;
    canvas.getContext('2d').drawImage(source, frame.x, frame.y, frame.width, frame.height, 0, 0, canvas.width, canvas.height);
    levels.push(PIXI.Texture.from(canvas));
  } else levels.push(texture);
  let previous = null;
  // Separate frame textures avoid atlas bleed and work with non-POT WebGL1 art.
  for (let n = 1; n <= 4 && Math.min(texture.width, texture.height) / 2 ** n >= 2; n++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(texture.width / 2 ** n));
    canvas.height = Math.max(1, Math.ceil(texture.height / 2 ** n));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (previous) ctx.drawImage(previous, 0, 0, canvas.width, canvas.height);
    else ctx.drawImage(source, frame.x, frame.y, frame.width, frame.height, 0, 0, canvas.width, canvas.height);
    const reduced = PIXI.Texture.from(canvas);
    reduced.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
    reduced.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
    levels.push(reduced); previous = canvas;
  }
  for (const level of levels) { level.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR; level.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF; }
  cache.set(texture, levels);
  return levels;
}

export function createZoomArt(texture) {
  const levels = levelsFor(texture);
  const geometry = new PIXI.Geometry().addAttribute('aVertexPosition',
    [0, 0, texture.width, 0, texture.width, texture.height, 0, texture.height], 2)
    .addAttribute('aTextureCoord', [0, 0, 1, 0, 1, 1, 0, 1], 2).addIndex([0, 1, 2, 0, 2, 3]);
  const shader = PIXI.Shader.from(vertex, fragment, {
    uFine: texture, uCoarse: texture, uFineSize: [texture.width, texture.height],
    uCoarseSize: [texture.width, texture.height], uFineFootprint: [1, 1], uCoarseFootprint: [1, 1], uBlend: 0, uAlpha: 1,
  });
  const mesh = new PIXI.Mesh(geometry, shader);
  mesh.sourceWidth = texture.width; mesh.sourceHeight = texture.height;
  mesh.eventMode = 'none';
  const render = mesh._render.bind(mesh);
  mesh._render = renderer => { shader.uniforms.uAlpha = mesh.worldAlpha; render(renderer); };
  mesh.sampleZoom = (pixelsPerWorldUnit, smooth = true, minimumLod = 0) => {
    const sx = Math.max(.001, Math.abs(mesh.scale.x) * pixelsPerWorldUnit);
    const sy = Math.max(.001, Math.abs(mesh.scale.y) * pixelsPerWorldUnit);
    const lod = Math.min(levels.length - 1, Math.max(minimumLod, smooth ? Math.log2(1 / Math.min(sx, sy)) : 0, 0));
    const lo = Math.floor(lod), hi = Math.min(levels.length - 1, lo + 1), a = levels[lo], b = levels[hi];
    Object.assign(shader.uniforms, { uFine: a, uCoarse: b, uFineSize: [a.width, a.height], uCoarseSize: [b.width, b.height],
      uFineFootprint: smooth ? [1 / sx / 2 ** lo, 1 / sy / 2 ** lo] : [.0001, .0001],
      uCoarseFootprint: smooth ? [1 / sx / 2 ** hi, 1 / sy / 2 ** hi] : [.0001, .0001],
      uBlend: lod - lo, uAlpha: mesh.worldAlpha });
  };
  // Default Mesh destroy does not own these private shader/geometry objects.
  const destroy = mesh.destroy.bind(mesh);
  mesh.destroy = options => { destroy(options); geometry.destroy(); shader.destroy(); };
  return mesh;
}

export function releaseZoomArt(textures) {
  for (const texture of textures) {
    const levels = cache.get(texture);
    if (levels) { levels.filter(level => level !== texture).forEach(level => level.destroy(true)); cache.delete(texture); }
  }
}

export const smoothRange = (lo, hi, value) => {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

export function zoomArtStats() {
  let bytes = 0, textures = 0;
  for (const [source, levels] of cache) for (const level of levels) if (level !== source) {
    bytes += level.width * level.height * 4; textures++;
  }
  return { prefilteredTextures: textures, prefilteredMiB: +(bytes / 1048576).toFixed(1) };
}

export async function prepareLandmarkLods() {
  const image = new Image();
  image.src = new URL('./assets/landmark-lod-v1.png', import.meta.url).href;
  await image.decode();
  const source = document.createElement('canvas'); source.width = image.width; source.height = image.height;
  const ctx = source.getContext('2d'); ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
  // Regional artwork reduces the same composition; only the overview is a symbolic replacement.
  const rows = [[0, 447, 96], [0, 447, 48], [810, 1024, 20]], result = {};
  for (const [col, kind] of ['player', 'neutral', 'monster'].entries()) {
    result[kind] = rows.map(([top, bottom, width]) => {
      let left = (col + 1) * 512, right = col * 512, upper = bottom, lower = top;
      for (let y = top; y < bottom; y++) for (let x = col * 512; x < (col + 1) * 512; x++) {
        if (pixels[(y * image.width + x) * 4 + 3] < 100) continue;
        left = Math.min(left, x); right = Math.max(right, x); upper = Math.min(upper, y); lower = Math.max(lower, y);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = Math.max(1, Math.round(width * (lower - upper + 1) / (right - left + 1)));
      const target = canvas.getContext('2d'); target.imageSmoothingQuality = 'high';
      target.drawImage(image, left, upper, right - left + 1, lower - upper + 1, 0, 0, canvas.width, canvas.height);
      const data = target.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.data.length; i += 4) {
        if (data.data[i + 3] < 95) { data.data[i + 3] = 0; continue; }
        data.data[i + 3] = 255;
        for (let c = 0; c < 3; c++) data.data[i + c] = Math.min(255, Math.round(data.data[i + c] / 12) * 12);
      }
      target.putImageData(data, 0, 0);
      const texture = PIXI.Texture.from(canvas); texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
      return texture;
    });
  }
  return result;
}
