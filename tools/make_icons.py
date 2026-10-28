"""Erzeugt die App-Icons (PNG) in icons/. Aufruf: python tools/make_icons.py"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
BLUE = (42, 111, 219)
WHITE = (255, 255, 255)
LIGHT = (180, 205, 245)


def draw_icon(size: int, maskable: bool, rounded: bool) -> Image.Image:
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BLUE)
    else:
        d.rectangle([0, 0, s, s], fill=BLUE)
    pad = s * (0.24 if maskable else 0.18)
    left, right, top, bottom = pad, s - pad, pad, s - pad
    w = right - left
    h = bottom - top
    # gestrichelte Soll-Linie
    steps = 9
    for i in range(0, steps, 2):
        x0 = left + w * i / steps
        x1 = left + w * (i + 1) / steps
        y0 = bottom - h * i / steps
        y1 = bottom - h * (i + 1) / steps
        d.line([(x0, y0), (x1, y1)], fill=LIGHT, width=int(s * 0.035))
    # tatsächlicher Verlauf (unter Kurs)
    pts = [(0.0, 0.0), (0.22, 0.08), (0.38, 0.28), (0.55, 0.33), (0.72, 0.5), (0.88, 0.58)]
    line = [(left + w * x, bottom - h * y) for x, y in pts]
    d.line(line, fill=WHITE, width=int(s * 0.07), joint="curve")
    ex, ey = line[-1]
    r = s * 0.06
    d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    draw_icon(192, False, True).save(OUT / "icon-192.png")
    draw_icon(512, False, True).save(OUT / "icon-512.png")
    draw_icon(512, True, False).save(OUT / "icon-maskable-512.png")
    draw_icon(180, False, False).convert("RGB").save(OUT / "apple-touch-icon.png")
    print("Icons erstellt in", OUT)


if __name__ == "__main__":
    main()
