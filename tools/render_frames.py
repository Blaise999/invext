"""
Renders the strand-bundle -> iris morph as a numbered frame sequence.

This is a stand-in for what the reference almost certainly used (Blender /
Octane). The point is that the *output contract* is identical: N numbered
stills that a canvas scrubs through on scroll. Swap these for real renders
and nothing on the web side changes.
"""

import math, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

import os

# Two variants. A 900x630 landscape frame letterboxes badly on a 390px portrait
# phone, and 420 hair-thin strands turn to grey mush at that size — so mobile
# gets its own portrait render with fewer, thicker strands and lighter files.
VARIANT = os.environ.get("VARIANT", "desktop")

if VARIANT == "mobile":
    W, H     = 760, 960       # portrait, higher res so it is not soft on 3x screens
    STRANDS  = 250            # fewer, so each one still reads
    WIDTH_K  = 1.55           # and thicker
    FRAMES   = 60
    DOF      = 0.10           # near-zero: phone screens punish any softness
else:
    W, H     = 900, 630
    STRANDS  = 400
    WIDTH_K  = 1.0
    FRAMES   = 96
    DOF      = 0.40

SS = 2
SEGS = 36

# Keeps the iris circular in screen space whatever the frame aspect.
ASPECT_X = H / W
BG = (9, 9, 11)
FOCAL = 900.0

random.seed(7)

# ---------------------------------------------------------------- strands
strands = []
for i in range(STRANDS):
    th = (i / STRANDS) * math.tau + random.uniform(-0.03, 0.03)
    strands.append({
        # bundle state
        "ax": random.uniform(-0.055, 0.055),
        "az": random.uniform(-160, 160),
        "fan": random.uniform(-1, 1),
        "fanz": random.uniform(-1, 1),
        # iris state
        "th": th,
        "len": random.uniform(0.10, 0.205),
        "curl": random.uniform(-0.5, 0.5),
        "ez": random.uniform(-70, 70),
        # transition
        "delay": random.random() ** 1.6 * 0.34,
        "arc": (random.uniform(-0.30, 0.30) * ASPECT_X, random.uniform(-0.34, -0.02)),
        "spin": random.uniform(-1.4, 1.4),
        "w": random.uniform(0.8, 1.6),
    })


def ease(x):
    x = max(0.0, min(1.0, x))
    return 1 - pow(1 - x, 3)


def bundle_point(s, st):
    """Strand hanging from above, fanning slightly as it falls."""
    x = 0.5 + st["ax"] * ASPECT_X + st["fan"] * 0.19 * ASPECT_X * s * s
    y = -0.28 + s * 1.30
    z = st["az"] + st["fanz"] * 190 * s * s
    return x, y, z


def iris_point(s, st):
    """Strand radiating outward from a ring."""
    r0 = 0.135 if VARIANT == 'mobile' else 0.155
    r = r0 + s * st["len"]
    th = st["th"] + st["curl"] * 0.16 * s * s
    x = 0.5 + r * math.cos(th) * ASPECT_X
    y = 0.5 + r * math.sin(th)
    z = st["ez"] + math.sin(th) * 40
    return x, y, z


def strand_points(st, p):
    """p = 0..1 global progress. Returns projected screen points + depth."""
    e = ease((p - st["delay"]) / max(1e-6, 1 - st["delay"]))
    rot = (1 - e) * (-0.12 if VARIANT == "mobile" else -0.22) + st["spin"] * e * (1 - e) * 0.9
    ca, sa = math.cos(rot), math.sin(rot)
    arc = math.sin(math.pi * e)  # 0 at both ends, 1 mid-flight

    pts = []
    for k in range(SEGS + 1):
        s = k / SEGS
        bx, by, bz = bundle_point(s, st)
        ix, iy, iz = iris_point(s, st)

        x = bx + (ix - bx) * e + st["arc"][0] * arc * (0.35 + s)
        y = by + (iy - by) * e + st["arc"][1] * arc * (0.35 + s)
        z = bz + (iz - bz) * e

        # rotate about frame centre so the whole system settles into place
        dx, dy = x - 0.5, y - 0.5
        x, y = 0.5 + dx * ca - dy * sa, 0.5 + dx * sa + dy * ca

        # perspective
        k2 = FOCAL / (FOCAL + z)
        sx = (0.5 + (x - 0.5) * k2) * W * SS
        sy = (0.5 + (y - 0.5) * k2) * H * SS
        pts.append((sx, sy, z, s))
    return pts, e


# ------------------------------------------------------------------ colour
def strand_color(s):
    """Dark chocolate at the root, saturated amber, near-white at the tip."""
    if VARIANT == "mobile":
        stops = [(0.00, (16, 20, 28)),  (0.32, (48, 66, 88)),
                 (0.58, (112, 142, 176)),(0.76, (182, 204, 226)),
                 (0.90, (226, 238, 250)),(1.00, (255, 255, 255))]
    else:
        stops = [(0.00, (28, 15, 7)),   (0.38, (96, 40, 10)),
                 (0.66, (198, 100, 18)), (0.82, (250, 168, 44)),
                 (0.93, (255, 214, 120)),(1.00, (255, 250, 238))]
    for i in range(len(stops) - 1):
        a, ca = stops[i]
        b, cb = stops[i + 1]
        if s <= b:
            t = (s - a) / (b - a)
            return tuple(int(ca[j] + (cb[j] - ca[j]) * t) for j in range(3))
    return stops[-1][1]


def render(p):
    layers = [Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0)) for _ in range(3)]
    draws = [ImageDraw.Draw(l) for l in layers]
    glow = Image.new("RGB", (W * SS, H * SS), (0, 0, 0))
    gd = ImageDraw.Draw(glow)

    order = sorted(strands, key=lambda st: strand_points(st, p)[0][0][2])
    for st in order:
        pts, e = strand_points(st, p)
        z = pts[0][2]
        slot = 0 if z < -55 else (2 if z > 55 else 1)
        for k in range(SEGS):
            x0, y0, _, s0 = pts[k]
            x1, y1, _, s1 = pts[k + 1]
            c = strand_color(s0) + (255,)
            w = max(1, int((5.4 - 2.4 * s0) * st["w"] * WIDTH_K * SS * 0.62))
            draws[slot].line([x0, y0, x1, y1], fill=c, width=w)
            if s0 > 0.70:
                gd.line([x0, y0, x1, y1], fill=((120, 150, 185) if VARIANT == "mobile" else (226, 146, 42)), width=w + SS)

    # depth of field: back and front slices sit out of focus
    layers[0] = layers[0].filter(ImageFilter.GaussianBlur(6.0 * SS * DOF))
    layers[2] = layers[2].filter(ImageFilter.GaussianBlur(2.5 * SS * DOF))

    out = Image.new("RGBA", (W * SS, H * SS), BG + (255,))
    for l in layers:
        out = Image.alpha_composite(out, l)

    # restrained bloom: only the hot tips, screened back at partial strength
    glow = glow.filter(ImageFilter.GaussianBlur(4.0 * SS))
    rgb = out.convert("RGB")
    rgb = Image.blend(rgb, ImageChops.screen(rgb, glow), 0.92)
    out = rgb.resize((W, H), Image.LANCZOS)
    # Recover the micro-contrast the downsample softens. This is what makes
    # individual filaments legible rather than a glowing mass.
    return out.filter(ImageFilter.UnsharpMask(radius=1.6, percent=115, threshold=2))


if __name__ == "__main__":
    import sys
    outdir = sys.argv[1] if len(sys.argv) > 1 else "out"
    only = [float(a) for a in sys.argv[2:]] or None
    os.makedirs(outdir, exist_ok=True)
    if only:
        for i, p in enumerate(only):
            render(p).save(f"{outdir}/test{i}.jpg", quality=90)
    else:
        for f in range(FRAMES):
            render(f / (FRAMES - 1)).save(
                f"{outdir}/iris_{f:04d}.webp", quality=68, method=6
            )
            if f % 20 == 0:
                print("frame", f, flush=True)
    print("done")
