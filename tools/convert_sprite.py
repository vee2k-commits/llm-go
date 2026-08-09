#!/usr/bin/env python3
"""
Simple sprite sheet converter.
Usage: python3 tools/convert_sprite.py input.png output_sheet.png --cols 4 --rows 1 --frame-w 64 --frame-h 64
Generates a combined sprite sheet and prints metadata JSON to stdout.
"""
import sys
import argparse
from PIL import Image
import json

def main():
    p = argparse.ArgumentParser()
    p.add_argument('input')
    p.add_argument('output')
    p.add_argument('--cols', type=int, default=4)
    p.add_argument('--rows', type=int, default=1)
    p.add_argument('--frame-w', type=int, default=64)
    p.add_argument('--frame-h', type=int, default=64)
    args = p.parse_args()

    img = Image.open(args.input).convert('RGBA')
    cols, rows = args.cols, args.rows
    fw, fh = args.frame_w, args.frame_h
    sheet_w = cols * fw
    sheet_h = rows * fh
    sheet = Image.new('RGBA', (sheet_w, sheet_h), (0,0,0,0))

    # naive slicing: tile input across frames
    i = 0
    for y in range(rows):
        for x in range(cols):
            sx = (i * fw) % img.width
            sy = ((i * fw) // img.width) * fh
            frame = img.crop((sx, sy, sx+fw, sy+fh))
            sheet.paste(frame, (x*fw, y*fh), frame)
            i += 1

    sheet.save(args.output)
    metadata = {
        'sheet': args.output,
        'cols': cols,
        'rows': rows,
        'frameWidth': fw,
        'frameHeight': fh
    }
    print(json.dumps(metadata, indent=2))

if __name__ == '__main__':
    main()
