"""Read-only atlas audit: report alpha silhouettes for AI sprite-frame registration."""
import json
import sys
from pathlib import Path
from PIL import Image


def inspect(path):
    image = Image.open(path)
    if image.mode != "RGBA":
        raise ValueError(f"{path}: atlas must have actual RGBA transparency")
    width, height = image.size
    alpha = image.getchannel("A")
    if alpha.getextrema()[0] != 0:
        raise ValueError(f"{path}: atlas has no fully transparent pixels")
    data = bytearray(alpha.point(lambda value: 1 if value > 32 else 0).tobytes())
    boxes = []
    for start in range(len(data)):
        if not data[start]:
            continue
        stack = [start]
        data[start] = 0
        count, left, top, right, bottom = 0, width, height, 0, 0
        while stack:
            position = stack.pop()
            x, y = position % width, position // width
            count += 1
            left, right = min(left, x), max(right, x)
            top, bottom = min(top, y), max(bottom, y)
            neighbors = []
            if x: neighbors.append(position - 1)
            if x + 1 < width: neighbors.append(position + 1)
            if y: neighbors.append(position - width)
            if y + 1 < height: neighbors.append(position + width)
            for neighbor in neighbors:
                if data[neighbor]:
                    data[neighbor] = 0
                    stack.append(neighbor)
        if count > 2000:
            boxes.append([left, top, right - left + 1, bottom - top + 1])
    if len(boxes) != 12:
        raise ValueError(f"{path}: expected 12 isolated silhouettes; found {len(boxes)}")
    boxes.sort(key=lambda box: box[1] + box[3] / 2)
    frames = []
    for start in range(0, 12, 4):
        frames.extend(sorted(boxes[start:start + 4], key=lambda box: box[0]))
    return {
        "src": f"sprites/{Path(path).name}",
        "size": [width, height],
        "referenceHeight": frames[6][3],
        "frames": frames,
    }


print(json.dumps({Path(path).stem.split("-")[1]: inspect(path) for path in sys.argv[1:]}, indent=2))
