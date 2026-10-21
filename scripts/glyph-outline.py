"""Outline a short string with a font, for build-signs.mjs.
Usage: python glyph-outline.py <font.ttf> <text> -> JSON {"d": svg path (y down, baseline 0, 100 px em), "bbox": [x1,y1,x2,y2]}
fontTools is used because opentype.js 2.0 produced NaN and mis-oriented outlines on Poppins."""
import json
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

font_path, text = sys.argv[1], sys.argv[2]
font = TTFont(font_path)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
scale = 100 / font["head"].unitsPerEm

svg_pen = SVGPathPen(glyphs, ntos=lambda n: f"{round(n, 2):g}")
bounds = BoundsPen(glyphs)
cursor = 0.0
for ch in text:
    name = cmap.get(ord(ch))
    if name is None:
        sys.exit(f"missing glyph for {ch!r}")
    # font units, y up  ->  px, y down, baseline at 0
    matrix = (scale, 0, 0, -scale, cursor, 0)
    glyphs[name].draw(TransformPen(svg_pen, matrix))
    glyphs[name].draw(TransformPen(bounds, matrix))
    cursor += glyphs[name].width * scale

print(json.dumps({"d": svg_pen.getCommands(), "bbox": bounds.bounds}))
