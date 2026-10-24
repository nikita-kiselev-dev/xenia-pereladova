import type { Viewport } from '../viewport';

/** Per-photo values the app tweens; the renderer copies them into uniforms every frame. */
export interface PhotoState { hover: number; anim: number; opacity: number; order: number }
/** A gallery photo: its image, tweened state and the screen box the scene drew it at this frame. */
export interface Photo { img: HTMLImageElement; state: PhotoState; rect: { x: number; y: number; w: number; h: number }; el: HTMLElement }

interface GalleryImage {
  image: HTMLImageElement;
  photo: Photo;
  state: PhotoState;
  /** Box/state values at the last draw: an unchanged scene is not redrawn. */
  drawn: number[];
  opacity: string;
  opacityPriority: string;
  source: string;
  generation: number;
  texture?: WebGLTexture;
  visible: boolean;
  hidden: boolean;
}

const segments = 24;

// aPosition is the unit quad with y down; vUv keeps the original bottom-up uv, so the shaders below are unchanged.
// Screen-space perspective: z from the original cos(x) bend, projected around the screen centre
// so a photo at rest matches its DOM box exactly.
const vertexShader = /* glsl */ `
  #define PI 3.1415926535897932384626433832795
  attribute vec2 aPosition;
  uniform vec4 uRect;
  uniform vec2 uViewport;
  uniform float uSpeed;
  uniform float uAnim;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vUv = vec2(aPosition.x, 1.0 - aPosition.y);
    vec2 world = vec2(uRect.x + aPosition.x * uRect.z - uViewport.x * .5, uViewport.y * .5 - uRect.y - aPosition.y * uRect.w);
    world.x += cos(world.y / uViewport.y * PI * 2.6 + uTime * 5.0) * uViewport.y * .04 * uAnim;
    float z = cos(world.x / uViewport.x * PI * 1.8) * uSpeed;
    world *= 1400.0 / (1400.0 - z);
    gl_Position = vec4(world / (uViewport * .5), 0.0, 1.0);
  }
`;

// Hover: two rotated displacement lookups cross-faded by uHover; both ends sample the plain photo.
// Images are uploaded top row first, so sampling flips v back.
const fragmentShader = /* glsl */ `
  precision highp float;
  #define PI 3.1415926535897932384626433832795
  uniform sampler2D uTexture;
  uniform sampler2D uDisp;
  uniform vec2 uUvScale;
  uniform float uHover;
  uniform float uOpacity;
  varying vec2 vUv;

  mat2 rotation(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }

  vec4 tex(sampler2D map, vec2 uv) { return texture2D(map, vec2(uv.x, 1.0 - uv.y)); }

  void main() {
    vec2 uv = (vUv - 0.5) * uUvScale + 0.5;
    vec2 disp = tex(uDisp, uv).rg;
    vec4 color1 = tex(uTexture, uv + rotation(PI / 4.0) * disp * .4 * uHover);
    vec4 color2 = tex(uTexture, uv + rotation(-PI * .75) * disp * .4 * (1.0 - uHover));
    gl_FragColor = vec4(mix(color1, color2, uHover).rgb, uOpacity);
  }
`;

/**
 * Draws the gallery photos with one shader program and one shared grid on a raw WebGL2 context.
 * No scene graph: a full engine would cost ~130 KB gzip of JS to parse on phones for a single quad shader.
 */
export class GalleryRenderer {
  private readonly canvas = document.createElement('canvas');
  // Textures outlive views: Overview/List/return from a series reuse them without a white frame.
  private readonly textures = new Map<string, Promise<WebGLTexture>>();
  private images: GalleryImage[] = [];
  private queue: GalleryImage[] = [];
  private gl?: WebGL2RenderingContext;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private disp?: WebGLTexture;
  private dispRequested = false;
  private width = 0;
  private height = 0;
  private ratio = 0;
  private active = false;
  private dirty = true;
  disposed = false;

  constructor(view: Viewport) {
    try {
      const gl = this.canvas.getContext('webgl2', { alpha: true, antialias: true, depth: false, stencil: false, premultipliedAlpha: true });
      if (!gl) {
        this.dispose();
        return;
      }
      this.gl = gl;
      const program = gl.createProgram()!;
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexShader], [gl.FRAGMENT_SHADER, fragmentShader]] as const) {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        gl.attachShader(program, shader);
      }
      gl.bindAttribLocation(program, 0, 'aPosition');
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Gallery shader compilation failed');
      gl.useProgram(program);
      for (const name of ['uRect', 'uViewport', 'uSpeed', 'uAnim', 'uTime', 'uTexture', 'uDisp', 'uUvScale', 'uHover', 'uOpacity']) this.uniforms[name] = gl.getUniformLocation(program, name);
      gl.uniform1i(this.uniforms.uTexture, 0);
      gl.uniform1i(this.uniforms.uDisp, 1);

      // One grid for every photo: the bend and the open wave need vertices inside the quad.
      const positions = new Float32Array((segments + 1) ** 2 * 2);
      const indices = new Uint16Array(segments * segments * 6);
      for (let y = 0, i = 0; y <= segments; y++) for (let x = 0; x <= segments; x++) { positions[i++] = x / segments; positions[i++] = y / segments; }
      for (let y = 0, i = 0; y < segments; y++) {
        for (let x = 0; x < segments; x++) {
          const a = y * (segments + 1) + x;
          indices.set([a, a + segments + 1, a + 1, a + 1, a + segments + 1, a + segments + 2], i);
          i += 6;
        }
      }
      gl.bindVertexArray(gl.createVertexArray());
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      // No displacement until a photo is hovered: touch devices never download the map.
      this.disp = this.upload(gl.TEXTURE1);

      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;';
      this.canvas.addEventListener('webglcontextlost', this.onContextLost);
      this.resize(view);
      if (!this.disposed) document.body.append(this.canvas);
    } catch {
      this.dispose();
    }
  }

  /** Tracks these images with the state objects the app tweens; textures stay cached across calls. */
  bind(photos: Photo[]): void {
    for (const entry of this.images) if (!photos.some(photo => photo.img === entry.image)) this.release(entry);
    const known = new Map(this.images.map(entry => [entry.image, entry]));
    this.images = photos.map(photo => known.get(photo.img) || {
      image: photo.img,
      photo,
      state: photo.state,
      drawn: [],
      opacity: photo.img.style.getPropertyValue('opacity'),
      opacityPriority: photo.img.style.getPropertyPriority('opacity'),
      source: '',
      generation: 0,
      visible: false,
      hidden: false,
    });
  }

  setActive(active: boolean): void {
    this.active = active;
    this.dirty = true;
    this.canvas.style.visibility = active ? '' : 'hidden';
  }

  /** Called from the app's frame-throttled resize (window and visual viewport). */
  resize(view: Viewport): void {
    const gl = this.gl;
    if (this.disposed || !gl) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    if (this.width === view.width && this.height === view.height && this.ratio === ratio) return;
    this.width = view.width;
    this.height = view.height;
    this.ratio = ratio;
    this.canvas.width = Math.floor(view.width * ratio);
    this.canvas.height = Math.floor(view.height * ratio);
    this.canvas.style.height = `${view.height}px`;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uniforms.uViewport, view.width, view.height);
    this.dirty = true;
  }

  /** @param speed z offset in px at the screen centre; @param time seconds. */
  update(speed: number, time: number): void {
    // Hidden canvas (series, Info): no draw and no per-photo work at all.
    const gl = this.gl;
    if (this.disposed || !gl || !this.active) return;

    try {
      const bend = Number.isFinite(speed) ? Math.max(-260, Math.min(260, speed)) : 0;
      let dirty = this.dirty;

      for (const entry of this.images) {
        const { image, state, photo } = entry;
        const rect = photo.rect;
        const source = image.currentSrc || image.src;

        if (entry.source && (!image.isConnected || entry.source !== source)) { dirty ||= entry.visible; this.release(entry); }
        if (!image.isConnected || image.hidden) continue;

        const visible = !photo.el.hidden && rect.w > 0 && rect.h > 0 && state.opacity > 0.001
          && rect.y + rect.h >= -250 && rect.y <= this.height + 250
          && rect.x + rect.w >= -250 && rect.x <= this.width + 250;

        if (visible && !entry.source && image.complete && image.naturalWidth > 0) this.load(entry, source);
        if (!entry.texture) continue;
        if (entry.visible !== visible) { entry.visible = visible; dirty = true; }
        if (!visible) continue;
        if (state.hover > 0 && !this.dispRequested) this.loadDisp();

        // uTime only moves the shape while uAnim > 0, so a resting photo has a constant time.
        const t = state.anim ? time : 0;
        const d = entry.drawn;
        if (d[0] === rect.x && d[1] === rect.y && d[2] === rect.w && d[3] === rect.h && d[4] === state.order
          && d[5] === bend && d[6] === t && d[7] === state.anim && d[8] === state.hover && d[9] === state.opacity) continue;
        d[0] = rect.x; d[1] = rect.y; d[2] = rect.w; d[3] = rect.h; d[4] = state.order;
        d[5] = bend; d[6] = t; d[7] = state.anim; d[8] = state.hover; d[9] = state.opacity;
        dirty = true;
      }

      // A static gallery keeps its last frame: the compositor reuses the canvas instead of a redraw each vsync.
      if (!dirty) return;
      this.dirty = false;
      gl.clear(gl.COLOR_BUFFER_BIT);
      const queue = this.queue;
      queue.length = 0;
      for (const entry of this.images) if (entry.texture && entry.visible) queue.push(entry);
      // Stable sort: the opened/returning photo (order 2) is drawn over its neighbours.
      queue.sort((a, b) => a.state.order - b.state.order);
      const u = this.uniforms;
      gl.uniform1f(u.uSpeed, bend);
      for (const { image, photo: { rect }, state, texture } of queue) {
        const imageAspect = image.naturalWidth / image.naturalHeight;
        const boxAspect = rect.w / rect.h;
        gl.bindTexture(gl.TEXTURE_2D, texture!);
        gl.uniform4f(u.uRect, rect.x, rect.y, rect.w, rect.h);
        gl.uniform1f(u.uTime, state.anim ? time : 0);
        gl.uniform1f(u.uAnim, state.anim);
        gl.uniform1f(u.uHover, state.hover);
        gl.uniform1f(u.uOpacity, state.opacity);
        gl.uniform2f(u.uUvScale, Math.min(1, boxAspect / imageAspect), Math.min(1, imageAspect / boxAspect));
        gl.drawElements(gl.TRIANGLES, segments * segments * 6, gl.UNSIGNED_SHORT, 0);
      }
    } catch {
      this.dispose();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    for (const entry of this.images) this.release(entry);
    this.textures.clear();
    try {
      // Frees every texture and buffer at once.
      this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      // Context loss must leave navigation and the DOM fallback usable.
    } finally {
      this.canvas.remove();
      this.gl = undefined;
    }
  }

  /** Texture from a decoded image (or one empty pixel), mipmapped: gallery tiles are much smaller than their thumbnails. */
  private upload(unit: number, image?: TexImageSource): WebGLTexture {
    const gl = this.gl!;
    const texture = gl.createTexture()!;
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (image) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
    return texture;
  }

  // A missing displacement map only removes the hover distortion; photos stay visible.
  private loadDisp(): void {
    this.dispRequested = true;
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}disp.jpg`;
    image.decode().then(() => {
      if (this.disposed || !this.gl) return;
      this.gl.deleteTexture(this.disp!);
      this.disp = this.upload(this.gl.TEXTURE1, image);
      this.dirty = true;
    }, () => undefined);
  }

  // The <img> already holds these bytes: decode() off the main thread, then one upload; no second request or decode.
  private texture(image: HTMLImageElement, source: string): Promise<WebGLTexture> {
    let texture = this.textures.get(source);
    if (!texture) {
      texture = image.decode().then(() => {
        if (this.disposed) throw new Error('Renderer disposed');
        return this.upload(this.gl!.TEXTURE0, image);
      });
      this.textures.set(source, texture);
      texture.catch(() => { if (this.textures.get(source) === texture) this.textures.delete(source); });
    }
    return texture;
  }

  private load(entry: GalleryImage, source: string): void {
    entry.source = source;
    const generation = ++entry.generation;
    // A failed decode leaves this one photo to the DOM image underneath; the rest stay in WebGL.
    this.texture(entry.image, source).then(texture => {
      if (this.disposed || generation !== entry.generation) return;
      entry.texture = texture;
      entry.drawn.length = 0;
      // data-gl: the DOM frame behind loses its placeholder fill, so a bent (shrunk) photo never shows a grey box.
      entry.image.style.setProperty('opacity', '0', 'important');
      entry.image.dataset.gl = '';
      entry.hidden = true;
    }, () => undefined);
  }

  private release(entry: GalleryImage): void {
    entry.generation++;
    if (entry.hidden) {
      if (entry.opacity) entry.image.style.setProperty('opacity', entry.opacity, entry.opacityPriority);
      else entry.image.style.removeProperty('opacity');
      entry.hidden = false;
      delete entry.image.dataset.gl;
    }
    entry.texture = undefined;
    entry.visible = false;
    entry.drawn.length = 0;
    entry.source = '';
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.dispose();
  };
}
