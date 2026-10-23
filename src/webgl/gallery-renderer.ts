import {
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

interface GalleryImage {
  image: HTMLImageElement;
  opacity: string;
  opacityPriority: string;
  source: string;
  generation: number;
  texture?: Texture;
  mesh?: Mesh<PlaneGeometry, ShaderMaterial>;
  hidden: boolean;
}

const vertexShader = /* glsl */ `
  uniform float uBend;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    float edgeArc = position.x * position.x * 4.0;
    worldPosition.y += edgeArc * uBend;
    worldPosition.z += edgeArc * abs(uBend) * 0.5;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uUvScale;
  varying vec2 vUv;

  void main() {
    vec2 coverUv = (vUv - 0.5) * uUvScale + 0.5;
    gl_FragColor = texture2D(uTexture, coverUv);
    #include <colorspace_fragment>
  }
`;

export class GalleryRenderer {
  private readonly canvas = document.createElement('canvas');
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private readonly loader = new TextureLoader();
  private readonly images: GalleryImage[];
  private renderer?: WebGLRenderer;
  private geometry?: PlaneGeometry;
  private width = 1;
  private height = 1;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.images = Array.from(container.querySelectorAll<HTMLImageElement>('img[data-webgl]'), (image) => ({
      image,
      opacity: image.style.getPropertyValue('opacity'),
      opacityPriority: image.style.getPropertyPriority('opacity'),
      source: '',
      generation: 0,
      hidden: false,
    }));

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
      this.geometry = new PlaneGeometry(1, 1, 20, 20);
      this.camera.position.z = 100;
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;';
      this.canvas.addEventListener('webglcontextlost', this.onContextLost);
      window.addEventListener('resize', this.onResize);
      this.onResize();
      if (!this.disposed) document.body.append(this.canvas);
    } catch {
      this.dispose();
    }
  }

  update(velocity: number): void {
    if (this.disposed || !this.renderer) return;

    try {
      const bend = Number.isFinite(velocity) ? Math.max(-28, Math.min(28, velocity * 0.55)) : 0;

      for (const entry of this.images) {
        const { image } = entry;
        const rect = image.getBoundingClientRect();
        const source = image.currentSrc || image.src;
        const farAway = rect.bottom < -this.height * 2 || rect.top > this.height * 3
          || rect.right < -this.width * 2 || rect.left > this.width * 3;

        if (!image.isConnected || farAway || entry.source !== source) this.release(entry);
        if (!image.isConnected || farAway) continue;

        const visible = rect.width > 0 && rect.height > 0
          && rect.bottom >= -250 && rect.top <= this.height + 250
          && rect.right >= -250 && rect.left <= this.width + 250;

        if (visible && !entry.texture && image.complete && image.naturalWidth > 0) {
          this.load(entry, source);
        }

        if (!entry.mesh) continue;
        entry.mesh.visible = visible;
        if (!visible) continue;

        entry.mesh.position.set(rect.left + rect.width / 2 - this.width / 2,
          this.height / 2 - rect.top - rect.height / 2, 0);
        entry.mesh.scale.set(rect.width, rect.height, 1);
        entry.mesh.material.uniforms.uBend.value = bend;

        const imageAspect = image.naturalWidth / image.naturalHeight;
        const boxAspect = rect.width / rect.height;
        entry.mesh.material.uniforms.uUvScale.value = [
          Math.min(1, boxAspect / imageAspect),
          Math.min(1, imageAspect / boxAspect),
        ];
      }

      this.renderer.render(this.scene, this.camera);
    } catch {
      this.dispose();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    for (const entry of this.images) this.release(entry);
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

  private load(entry: GalleryImage, source: string): void {
    entry.source = source;
    const generation = ++entry.generation;
    entry.texture = this.loader.load(source, (texture) => {
      if (this.disposed || generation !== entry.generation || !this.geometry) {
        texture.dispose();
        return;
      }

      try {
        texture.colorSpace = SRGBColorSpace;
        const material = new ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms: {
            uTexture: { value: texture },
            uBend: { value: 0 },
            uUvScale: { value: [1, 1] },
          },
          transparent: true,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        });
        entry.mesh = new Mesh(this.geometry, material);
        entry.mesh.visible = false;
        this.scene.add(entry.mesh);
        entry.image.style.setProperty('opacity', '0', 'important');
        entry.hidden = true;
      } catch {
        this.dispose();
      }
    }, undefined, () => {
      if (!this.disposed && generation === entry.generation) this.dispose();
    });
  }

  private release(entry: GalleryImage): void {
    entry.generation++;
    if (entry.hidden) {
      if (entry.opacity) entry.image.style.setProperty('opacity', entry.opacity, entry.opacityPriority);
      else entry.image.style.removeProperty('opacity');
      entry.hidden = false;
    }
    if (entry.mesh) {
      this.scene.remove(entry.mesh);
      entry.mesh.material.dispose();
      entry.mesh = undefined;
    }
    entry.texture?.dispose();
    entry.texture = undefined;
    entry.source = '';
  }

  private readonly onResize = (): void => {
    if (this.disposed || !this.renderer) return;
    try {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.camera.left = -this.width / 2;
      this.camera.right = this.width / 2;
      this.camera.top = this.height / 2;
      this.camera.bottom = -this.height / 2;
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.setSize(this.width, this.height, false);
    } catch {
      this.dispose();
    }
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.dispose();
  };
}
