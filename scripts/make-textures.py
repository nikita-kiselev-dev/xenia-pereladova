"""Generate the site's own grain and displacement textures (public/grain.png, public/disp.jpg).

The original site's files in docs/research are only a reference for contrast and scale;
these textures are generated from seeded noise so the build never ships third-party assets.
"""
from pathlib import Path

import numpy as np
from PIL import Image

root = Path(__file__).resolve().parent.parent / 'public'
rng = np.random.default_rng(88)  # grain; the displacement map has its own seed below

# Grain: independent pixels tile seamlessly. Reference noise2.png: about half the pixels fully transparent,
# the rest mid-tone colour noise (channels independent) at alpha ~12/255; on white that is std ~3.8 levels.
size = 128
visible = rng.random((size, size)) > 0.49
colour = rng.integers(64, 200, (size, size, 3))
alpha = np.where(visible, np.clip(rng.exponential(11, (size, size)), 0, 52), 0)
grain = np.dstack([colour, alpha]).astype(np.uint8)
Image.fromarray(grain, 'RGBA').save(root / 'grain.png', optimize=True)

# Displacement: periodic 1/f^2 noise (FFT keeps it tileable) with contrast close to disp88.jpeg.
size = 512
rng = np.random.default_rng(89)
spectrum = np.fft.fft2(rng.standard_normal((size, size)))
fy = np.fft.fftfreq(size)[:, None]
fx = np.fft.fftfreq(size)[None, :]
radius = np.sqrt(fx * fx + fy * fy)
radius[0, 0] = 1
field = np.real(np.fft.ifft2(spectrum / radius ** 1.8))
field = (field - field.mean()) / field.std()
speckle = rng.random((size, size)) < 0.015
field = 1 / (1 + np.exp(-1.6 * field))
field[speckle] = np.minimum(1, field[speckle] + 0.5)
Image.fromarray((field * 255).astype(np.uint8), 'L').convert('RGB').save(root / 'disp.jpg', quality=82)
print('grain', (root / 'grain.png').stat().st_size, 'disp', (root / 'disp.jpg').stat().st_size)
