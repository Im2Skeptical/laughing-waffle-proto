"""Luminance keying for the generated class-picker frames: flat black -> real alpha."""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

def key_black(img, thresh=6, min_hole=1500, ramp=(2, 30), halo=2):
    """Return RGBA. Black connected to the image border is the outside; other large
    black regions are the aperture. The outside gets a morphologically cleaned,
    lightly blurred silhouette (the stone shades into black at some edges, so a
    luminance ramp there tears). The aperture keeps a luminance ramp so the amber
    glow on the selected tab fades out instead of ending in a hard dark ring."""
    rgb = np.asarray(img.convert('RGB')).astype(np.float32)
    lum = rgb.max(axis=2)
    dark = lum < thresh
    lab, n = ndi.label(dark)
    sizes = ndi.sum(dark, lab, index=np.arange(1, n + 1))
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, [i + 1 for i in range(n) if (i + 1) in border])
    aperture = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= min_hole and (i + 1) not in border])
    solid = ~outside
    solid = ndi.binary_closing(solid, iterations=3)
    solid = ndi.binary_opening(solid, iterations=2)
    solid = ndi.binary_fill_holes(solid) | ~aperture & solid
    a_out = ndi.gaussian_filter(solid.astype(np.float32), 0.8)
    zone = ndi.binary_dilation(aperture, iterations=halo + 1)
    a_ap = np.where(aperture, 0.0, 1.0)
    a_ap = np.where(zone & ~aperture, np.clip((lum - ramp[0]) / (ramp[1] - ramp[0]), 0, 1), a_ap)
    a_ap = np.where(zone, ndi.gaussian_filter(a_ap, 0.6), a_ap)
    a = np.clip(np.minimum(a_out, a_ap), 0, 1)
    a[aperture] = 0
    out = rgb.copy()
    m = zone & ~aperture & (a > 0.02)
    out[m] = np.clip(rgb[m] / np.maximum(a[m, None], 0.35), 0, 255)
    return Image.fromarray(np.dstack([out, a * 255]).astype(np.uint8), 'RGBA')

def crop_alpha(im, pad=1):
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 8)
    box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + 1 + pad, im.width), min(ys.max() + 1 + pad, im.height))
    return im.crop(box), box

def preview(im, path, bg=(70, 62, 58)):
    base = Image.new('RGBA', im.size, bg + (255,))
    base.alpha_composite(im); base.convert('RGB').save(path)
