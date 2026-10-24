import {
  DataTexture,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  WebGLRenderer,
} from 'three';
import type { Texture } from 'three';
import { readViewport } from '../viewport';

/** Per-photo values the app tweens; the renderer copies them into uniforms every frame. */
export interface PhotoState { hover: number; anim: number; opacity: number; order: number }
/** A gallery photo: its image, tweened state and the screen box the scene drew it at this frame. */
export interface Photo { img: HTMLImageElement; state: PhotoState; rect: { x: number; y: number; w: number; h: number }; el: HTMLElement }

interface GalleryImage {
  image: HTMLImageElement;
  photo: Photo;
  state: PhotoState;
  /** Uniform/position values at the last draw: an unchanged scene is not redrawn. */
  drawn: number[];
  opacity: string;
  opacityPriority: string;
  source: string;
  generation: number;
  mesh?: Mesh<PlaneGeometry, ShaderMaterial>;
  hidden: boolean;
}

// Screen-space perspective: z from the original cos(x) bend, projected around the screen centre
// so a photo at rest matches its DOM box exactly under the orthographic camera.
const vertexShader = /* glsl */ `
  #define PI 3.1415926535897932384626433832795
  uniform vec2 uViewport;
  uniform float uSpeed;
  uniform float uAnim;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    world.x += cos(world.y / uViewport.y * PI * 2.6 + uTime * 5.0) * uViewport.y * .04 * uAnim;
    float z = cos(world.x / uViewport.x * PI * 1.8) * uSpeed;
    world.xy *= 1400.0 / (1400.0 - z);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Hover: two rotated displacement lookups cross-faded by uHover; both ends sample the plain photo.
const fragmentShader = /* glsl */ `
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

  void main() {
    vec2 uv = (vUv - 0.5) * uUvScale + 0.5;
    vec2 disp = texture2D(uDisp, uv).rg;
    vec4 color1 = texture2D(uTexture, uv + rotation(PI / 4.0) * disp * .4 * uHover);
    vec4 color2 = texture2D(uTexture, uv + rotation(-PI * .75) * disp * .4 * (1.0 - uHover));
    gl_FragColor = vec4(mix(color1, color2, uHover).rgb, uOpacity);
    #include <colorspace_fragment>
  }
`;

export class GalleryRenderer {
  private readonly canvas = document.createElement('canvas');
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private readonly loader = new TextureLoader();
  // Textures outlive views: Overview/List/return from a series reuse them without a white frame.
  private readonly textures = new Map<string, Promise<Texture>>();
  private images: GalleryImage[] = [];
  private renderer?: WebGLRenderer;
  private geometry?: PlaneGeometry;
  private disp: Texture = new DataTexture(new Uint8Array(4), 1, 1);
  private width = 1;
  private height = 1;
  private active = false;
  private dirty = true;
  disposed = false;

  constructor() {
    try {
      const context = this.canvas.getContext('webgl2', { alpha: true, antialias: true });
      if (!context) {
        this.dispose();
        return;
      }

      this.renderer = new WebGLRenderer({ canvas: this.canvas, context, alpha: true, antialias: true });
      this.renderer.outputColorSpace = SRGBColorSpace;
      this.renderer.toneMapping = NoToneMapping;
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.debug.onShaderError = () => { throw new Error('Gallery shader compilation failed'); };
      this.geometry = new PlaneGeometry(1, 1, 24, 24);
      this.camera.position.z = 100;
      this.disp.needsUpdate = true;
      // A missing displacement map only removes the hover distortion; photos stay visible.
      this.loader.load(`${import.meta.env.BASE_URL}disp.jpg`, texture => {
        if (this.disposed) { texture.dispose(); return; }
        this.disp.dispose();
        this.disp = texture;
        for (const entry of this.images) if (entry.mesh) entry.mesh.material.uniforms.uDisp.value = texture;
        this.dirty = true;
      }, undefined, () => undefined);
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;';
      this.canvas.addEventListener('webglcontextlost', this.onContextLost);
      window.addEventListener('resize', this.onResize);
      window.visualViewport?.addEventListener('resize', this.onResize);
      this.onResize();
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
      hidden: false,
    });
  }

  setActive(active: boolean): void {
    this.active = active;
    this.dirty = true;
    this.canvas.style.visibility = active ? '' : 'hidden';
  }

  /** @param speed z offset in px at the screen centre; @param time seconds. */
  update(speed: number, time: number): void {
    // Hidden canvas (series, Info): no draw and no per-photo work at all.
    if (this.disposed || !this.renderer || !this.active) return;

    try {
      const bend = Number.isFinite(speed) ? Math.max(-260, Math.min(260, speed)) : 0;
      let dirty = this.dirty;

      for (const entry of this.images) {
        const { image, state, photo } = entry;
        const rect = photo.rect;
        const source = image.currentSrc || image.src;

        if (!image.isConnected || entry.source !== source) { if (entry.mesh) dirty = true; this.release(entry); }
        if (!image.isConnected || image.hidden) continue;

        const visible = !photo.el.hidden && rect.w > 0 && rect.h > 0 && state.opacity > 0.001
          && rect.y + rect.h >= -250 && rect.y <= this.height + 250
          && rect.x + rect.w >= -250 && rect.x <= this.width + 250;

        if (visible && !entry.source && image.complete && image.naturalWidth > 0) this.load(entry, source);
        if (!entry.mesh) continue;
        if (entry.mesh.visible !== visible) { entry.mesh.visible = visible; dirty = true; }
        if (!visible) continue;

        // uTime only moves the shape while uAnim > 0, so a resting photo has a constant time.
        const values = [rect.x, rect.y, rect.w, rect.h, state.order, bend, state.anim ? time : 0, state.anim, state.hover, state.opacity];
        if (values.every((value, index) => value === entry.drawn[index])) continue;
        entry.drawn = values;
        dirty = true;
        entry.mesh.position.set(rect.x + rect.w / 2 - this.width / 2, this.height / 2 - rect.y - rect.h / 2, 0);
        entry.mesh.scale.set(rect.w, rect.h, 1);
        entry.mesh.renderOrder = state.order;
        const { uniforms } = entry.mesh.material;
        uniforms.uSpeed.value = bend;
        uniforms.uTime.value = time;
        uniforms.uAnim.value = state.anim;
        uniforms.uHover.value = state.hover;
        uniforms.uOpacity.value = state.opacity;
        uniforms.uViewport.value = [this.width, this.height];
        const imageAspect = image.naturalWidth / image.naturalHeight;
        const boxAspect = rect.w / rect.h;
        uniforms.uUvScale.value = [Math.min(1, boxAspect / imageAspect), Math.min(1, imageAspect / boxAspect)];
      }

      // A static gallery keeps its last frame: the compositor reuses the canvas instead of a redraw each vsync.
      if (!dirty) return;
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
    } catch {
      this.dispose();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    for (const entry of this.images) this.release(entry);
    for (const texture of this.textures.values()) void texture.then(item => item.dispose(), () => undefined);
    this.textures.clear();
    this.disp.dispose();
    this.geometry?.dispose();
    this.scene.clear();
    try {
      this.renderer?.dispose();
      this.renderer?.forceContextLoss();
    } catch {
      // Context loss must leave navigation and the DOM fallback usable.
    } finally {
      this.canvas.remove();
      this.renderer = undefined;
    }
  }

  private texture(source: string): Promise<Texture> {
    let texture = this.textures.get(source);
    if (!texture) {
      texture = this.loader.loadAsync(source).then(item => { item.colorSpace = SRGBColorSpace; return item; });
      this.textures.set(source, texture);
    }
    return texture;
  }

  private load(entry: GalleryImage, source: string): void {
    entry.source = source;
    const generation = ++entry.generation;
    this.texture(source).then(texture => {
      if (this.disposed || generation !== entry.generation || !this.geometry) return;
      try {
        const material = new ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms: {
            uTexture: { value: texture },
            uDisp: { value: this.disp },
            uSpeed: { value: 0 },
            uTime: { value: 0 },
            uAnim: { value: 0 },
            uHover: { value: 0 },
            uOpacity: { value: 1 },
            uViewport: { value: [this.width, this.height] },
            uUvScale: { value: [1, 1] },
          },
          transparent: true,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        });
        entry.mesh = new Mesh(this.geometry, material);
        entry.mesh.visible = false;
        entry.drawn = [];
        this.scene.add(entry.mesh);
        // data-gl: the DOM frame behind loses its placeholder fill, so a bent (shrunk) photo never shows a grey box.
        entry.image.style.setProperty('opacity', '0', 'important');
        entry.image.dataset.gl = '';
        entry.hidden = true;
      } catch {
        this.dispose();
      }
    }, () => {
      if (!this.disposed && generation === entry.generation) this.dispose();
    });
  }

  private release(entry: GalleryImage): void {
    entry.generation++;
    if (entry.hidden) {
      if (entry.opacity) entry.image.style.setProperty('opacity', entry.opacity, entry.opacityPriority);
      else entry.image.style.removeProperty('opacity');
      entry.hidden = false;
      delete entry.image.dataset.gl;
    }
    if (entry.mesh) {
      this.scene.remove(entry.mesh);
      entry.mesh.material.dispose();
      entry.mesh = undefined;
    }
    entry.source = '';
  }

  private readonly onResize = (): void => {
    if (this.disposed || !this.renderer) return;
    try {
      const view = readViewport();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      if (this.width === view.width && this.height === view.height && this.renderer.getPixelRatio() === ratio) return;
      this.width = view.width;
      this.height = view.height;
      this.camera.left = -this.width / 2;
      this.camera.right = this.width / 2;
      this.camera.top = this.height / 2;
      this.camera.bottom = -this.height / 2;
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(this.width, this.height, false);
      this.canvas.style.height = `${this.height}px`;
      this.dirty = true;
    } catch {
      this.dispose();
    }
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.dispose();
  };
}
