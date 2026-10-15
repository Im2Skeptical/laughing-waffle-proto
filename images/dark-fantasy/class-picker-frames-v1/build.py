#!/usr/bin/env python3
"""Rebuild the class-picker frame sources and atlas from the generated JPG sheets.

  python3 images/dark-fantasy/class-picker-frames-v1/build.py

1. generated/*.jpg (flat black backgrounds) -> luminance-keyed RGBA pieces, written
   beside this file as the named, registered source images (lossless PNG).
2. The pieces are downscaled (per-piece `STORE` scale), packed with 2 px of extruded
   padding and written to images/sprite-sheets/class-picker-frames.webp + .json in
   TexturePacker's JSON-hash format, so chronicle-art.js loads them like any atlas.
Needs numpy, scipy and Pillow. TexturePacker is not required.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from key_lib import crop_alpha, key_black  # noqa: E402

OUT = HERE.parents[1] / 'sprite-sheets'

# Stored scale (stored px per source px) for each piece. The runtime's display scale
# lives in src/views/painted-frames.js; a test checks the two agree.
STORE = {'window': 0.5, 'panel': 0.35, 'banner': 0.9, 'tab': 0.45, 'socket': 0.4}


def load_keyed(name, single=True):
    im = key_black(Image.open(HERE / 'generated' / f'{name}-source.jpg'))
    if not single:
        return im
    arr = np.asarray(im)
    lab, n = ndi.label(arr[..., 3] > 8)
    sizes = ndi.sum(arr[..., 3] > 8, lab, range(1, n + 1))
    keep = lab == 1 + int(np.argmax(sizes))  # drops stray specks
    im = Image.fromarray(np.dstack([arr[..., :3], (arr[..., 3] * keep).astype(np.uint8)]), 'RGBA')
    return im


def feather(im, left=0, right=0, top=0, bottom=0):
    """Fade alpha to 0 along the named edges so an overlay dissolves into what is under it."""
    a = np.asarray(im).astype(np.float32)
    h, w = a.shape[:2]
    m = np.ones((h, w), np.float32)
    for amount, ramp in ((left, np.linspace(0, 1, left or 1)), (right, np.linspace(1, 0, right or 1))):
        if amount:
            sl = slice(0, amount) if ramp[0] == 0 else slice(w - amount, w)
            m[:, sl] *= ramp[None, :]
    for amount, ramp in ((top, np.linspace(0, 1, top or 1)), (bottom, np.linspace(1, 0, bottom or 1))):
        if amount:
            sl = slice(0, amount) if ramp[0] == 0 else slice(h - amount, h)
            m[sl, :] *= ramp[:, None]
    a[..., 3] *= m
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def dissolve_join(a, b, overlap, axis):
    """Concatenate two RGBA strips with a cross-dissolve over `overlap` px."""
    a = np.asarray(a).astype(np.float32)
    b = np.asarray(b).astype(np.float32)
    if axis == 1:
        a, b = a.transpose(1, 0, 2), b.transpose(1, 0, 2)
    ramp = np.linspace(0, 1, overlap)[:, None, None]
    mid = a[-overlap:] * (1 - ramp) + b[:overlap] * ramp
    out = np.concatenate([a[:-overlap], mid, b[overlap:]])
    if axis == 1:
        out = out.transpose(1, 0, 2)
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def seamless(im, overlap, axis):
    """Make a strip wrap: the last `overlap` px dissolve into the first ones."""
    arr = np.asarray(im).astype(np.float32)
    if axis == 1:
        arr = arr.transpose(1, 0, 2)
    ramp = np.linspace(0, 1, overlap)[:, None, None]
    head, tail = arr[:overlap], arr[-overlap:]
    mid = tail * (1 - ramp) + head * ramp
    out = np.concatenate([mid, arr[overlap:-overlap]])
    if axis == 1:
        out = out.transpose(1, 0, 2)
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def build_window():
    im = load_keyed('window')
    im, _ = crop_alpha(im)
    w, h = im.size
    pieces = {}
    cw, ch, fx, fy = 362, 214, 16, 24  # corner width/height and the feathered overlap
    pieces['window-corner-tl'] = feather(im.crop((0, 0, cw, ch)), right=fx, bottom=fy)
    pieces['window-corner-tr'] = feather(im.crop((w - cw, 0, w, ch)), left=fx, bottom=fy)
    pieces['window-corner-bl'] = feather(im.crop((0, h - ch, cw, h)), right=fx, top=fy)
    pieces['window-corner-br'] = feather(im.crop((w - cw, h - ch, w, h)), left=fx, top=fy)
    top = (22, 96); bot = (h - 93, h - 28)
    def hstrip(y0, y1):
        a = im.crop((372, y0, 516, y1)); b = im.crop((664, y0, 808, y1))
        return seamless(dissolve_join(a, b, 20, 1), 24, 1)
    pieces['window-edge-top'] = hstrip(*top)
    pieces['window-edge-bottom'] = hstrip(*bot)
    left = (20, 92); right = (w - 92, w - 20)
    def vstrip(x0, x1):
        a = im.crop((x0, ch + 4, x1, h - ch - 4))
        return seamless(a, 24, 0)
    pieces['window-edge-left'] = vstrip(*left)
    pieces['window-edge-right'] = vstrip(*right)
    gx0, gx1 = 536, 650
    pieces['window-gem-top'] = feather(im.crop((gx0, top[0], gx1, top[1])), left=14, right=14)
    pieces['window-gem-bottom'] = feather(im.crop((gx0, bot[0], gx1, bot[1])), left=14, right=14)
    meta = {'sourceSize': [w, h], 'corner': [cw, ch], 'top': list(top), 'bottom': list(bot), 'left': list(left),
            'right': list(right), 'gemX': [gx0, gx1]}
    return pieces, {name: 'window' for name in pieces}, meta


def build_panel():
    im, _ = crop_alpha(load_keyed('panel'))
    w, h = im.size
    c, m = 46, 64
    out = Image.new('RGBA', (2 * c + m, 2 * c + m), (0, 0, 0, 0))
    cx, cy = (w - m) // 2, (h - m) // 2
    out.paste(im.crop((0, 0, c, c)), (0, 0))
    out.paste(im.crop((w - c, 0, w, c)), (c + m, 0))
    out.paste(im.crop((0, h - c, c, h)), (0, c + m))
    out.paste(im.crop((w - c, h - c, w, h)), (c + m, c + m))
    out.paste(im.crop((cx, 0, cx + m, c)), (c, 0))
    out.paste(im.crop((cx, h - c, cx + m, h)), (c, c + m))
    out.paste(im.crop((0, cy, c, cy + m)), (0, c))
    out.paste(im.crop((w - c, cy, w, cy + m)), (c + m, c))
    return {'panel': out}, {'panel': 'panel'}, {'sourceSize': [w, h], 'inset': c}


def build_banner():
    im, _ = crop_alpha(load_keyed('banner'))
    return {'banner': im}, {'banner': 'banner'}, {'sourceSize': list(im.size), 'insets': [64, 62, 64, 170]}


def build_tabs():
    im = load_keyed('tabs', single=False)
    arr = np.asarray(im)
    lab, n = ndi.label(arr[..., 3] > 8)
    sizes = ndi.sum(arr[..., 3] > 8, lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1][:4]
    found = []
    for idx in order:
        ys, xs = np.where(lab == idx + 1)
        found.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    found.sort(key=lambda b: (round(b[1] / 300), b[0]))
    names = ['tab', 'tab-selected', 'tab-locked', 'socket']
    pieces = {}
    for name, (x0, y0, x1, y1) in zip(names, found):
        pad = 14 if name == 'tab-selected' else 1  # keep the glow's soft falloff
        pieces[name] = im.crop((max(x0 - pad, 0), max(y0 - pad, 0), x1 + pad, y1 + pad))
    return pieces, {n: ('socket' if n == 'socket' else 'tab') for n in pieces}, {'sizes': {n: list(p.size) for n, p in pieces.items()}}


def pack(pieces, groups, pad=2, max_w=1024):
    items = []
    for name, im in pieces.items():
        f = STORE[groups[name]]
        small = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
        # Premultiply while resizing was avoided on purpose: dark fringe stays dark anyway.
        items.append((name, small))
    items.sort(key=lambda it: -it[1].height)
    x = y = row = 0
    placed = []
    for name, im in items:
        w, h = im.size
        if x + w + 2 * pad > max_w:
            x, y, row = 0, y + row, 0
        placed.append((name, im, x + pad, y + pad))
        x += w + 2 * pad
        row = max(row, h + 2 * pad)
    height = y + row
    atlas = Image.new('RGBA', (max_w, height), (0, 0, 0, 0))
    frames = {}
    for name, im, px, py in placed:
        atlas.paste(im, (px, py))
        a = np.asarray(atlas).copy()
        w, h = im.size
        for k in range(1, pad + 1):  # extrude edges so linear filtering never bleeds a neighbour
            a[py - k:py + h + k, px - k, :] = a[py - k:py + h + k, px, :]
            a[py - k:py + h + k, px + w - 1 + k, :] = a[py - k:py + h + k, px + w - 1, :]
        atlas = Image.fromarray(a, 'RGBA')
        a = np.asarray(atlas).copy()
        for k in range(1, pad + 1):
            a[py - k, px - pad:px + w + pad, :] = a[py, px - pad:px + w + pad, :]
            a[py + h - 1 + k, px - pad:px + w + pad, :] = a[py + h - 1, px - pad:px + w + pad, :]
        atlas = Image.fromarray(a, 'RGBA')
        frames[f'{name}.png'] = {
            'frame': {'x': px, 'y': py, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'sourceSize': {'w': w, 'h': h},
        }
    return atlas, frames


def main():
    pieces, groups, meta = {}, {}, {}
    for fn in (build_window, build_panel, build_banner, build_tabs):
        p, g, m = fn()
        pieces.update(p); groups.update(g); meta[fn.__name__.replace('build_', '')] = m
    for name, im in pieces.items():
        im.save(HERE / f'{name}.png', optimize=True)
    atlas, frames = pack(pieces, groups)
    OUT.mkdir(exist_ok=True)
    atlas.save(OUT / 'class-picker-frames.webp', 'WEBP', quality=90, alpha_quality=100, method=6)
    data = {'frames': frames, 'meta': {'app': 'images/dark-fantasy/class-picker-frames-v1/build.py', 'version': '1.0',
            'image': 'class-picker-frames.webp', 'format': 'RGBA8888', 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': '1'}}
    (OUT / 'class-picker-frames.json').write_text(json.dumps(data, indent=1) + '\n')
    (HERE / 'layout.json').write_text(json.dumps({'store': STORE, 'groups': groups, 'stored': {n: [f['frame']['w'], f['frame']['h']] for n, f in ((k[:-4], v) for k, v in frames.items())}, 'source': meta}, indent=1, default=int) + '\n')
    print('atlas', atlas.size, 'webp KB', (OUT / 'class-picker-frames.webp').stat().st_size // 1024)
    for name in pieces: print(name, pieces[name].size)


if __name__ == '__main__':
    main()
