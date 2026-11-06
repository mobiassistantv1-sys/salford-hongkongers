"""Blur every face in a photo, for publishing SHK event photos.

blur(src_bytes) -> (jpeg_bytes, face_count)
- reads JPEG / PNG / HEIC (iPhone), applies the EXIF rotation, then drops all metadata (GPS, camera, time)
- finds faces with OpenCV's YuNet detector at two scales plus 2x tiles, so small faces in group photos are found too
- covers each face (box grown 40%) with a pixelated + blurred patch, then resizes to 1600 px on the long side
"""
import io
import os
import urllib.request

import cv2
import numpy as np
from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:  # HEIC support is optional
    pass

MODEL_URL = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
MODEL = os.path.join(os.path.dirname(__file__), ".face_detection_yunet.onnx")
MAX_SIDE = 1600
SCORE = 0.55  # lower than OpenCV's 0.9 default: a false blur is better than a missed face


def _model():
    if not os.path.exists(MODEL):
        urllib.request.urlretrieve(MODEL_URL, MODEL)
    return MODEL


def _detect(img, scale):
    h, w = img.shape[:2]
    sw, sh = max(1, int(w * scale)), max(1, int(h * scale))
    small = cv2.resize(img, (sw, sh), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    det = cv2.FaceDetectorYN.create(_model(), "", (sw, sh), SCORE, 0.3, 5000)
    _, faces = det.detect(small)
    out = []
    if faces is not None:
        for f in faces:
            x, y, fw, fh = (f[:4] / scale).tolist()
            out.append((x, y, fw, fh))
    return out


def find_faces(img):
    h, w = img.shape[:2]
    boxes = []
    for target in (1280, 2400):  # whole picture at two sizes
        boxes += _detect(img, min(4.0, target / max(h, w)))
    # overlapping tiles enlarged 2x catch the small faces at the back of a group photo
    t = max(200, min(900, max(h, w) // 2))
    step = int(t * 0.75)
    for ty in range(0, max(1, h - t // 3), step):
        for tx in range(0, max(1, w - t // 3), step):
            tile = img[ty:ty + t, tx:tx + t]
            if min(tile.shape[:2]) < 40:
                continue
            boxes += [(x + tx, y + ty, fw, fh) for (x, y, fw, fh) in _detect(tile, 2.0)]
    return boxes


def _cover(img, box):
    h, w = img.shape[:2]
    x, y, fw, fh = box
    gx, gy = fw * 0.4, fh * 0.4
    x0, y0 = max(0, int(x - gx)), max(0, int(y - gy * 1.2))
    x1, y1 = min(w, int(x + fw + gx)), min(h, int(y + fh + gy))
    if x1 - x0 < 2 or y1 - y0 < 2:
        return
    roi = img[y0:y1, x0:x1]
    px = cv2.resize(roi, (max(1, (x1 - x0) // 12), max(1, (y1 - y0) // 12)), interpolation=cv2.INTER_LINEAR)
    px = cv2.resize(px, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)
    k = max(3, ((x1 - x0) // 4) | 1)
    px = cv2.GaussianBlur(px, (k, k), 0)
    mask = np.zeros((y1 - y0, x1 - x0), np.uint8)
    cv2.ellipse(mask, ((x1 - x0) // 2, (y1 - y0) // 2), ((x1 - x0) // 2, (y1 - y0) // 2), 0, 0, 360, 255, -1)
    mask = cv2.GaussianBlur(mask, (k, k), 0)[..., None] / 255.0
    img[y0:y1, x0:x1] = (px * mask + roi * (1 - mask)).astype(np.uint8)


def blur(src_bytes):
    pil = ImageOps.exif_transpose(Image.open(io.BytesIO(src_bytes))).convert("RGB")
    img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    faces = find_faces(img)
    for b in faces:
        _cover(img, b)
    h, w = img.shape[:2]
    s = min(1.0, MAX_SIDE / max(h, w))
    if s < 1:
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 84, cv2.IMWRITE_JPEG_OPTIMIZE, 1])
    if not ok:
        raise RuntimeError("could not encode JPEG")
    return buf.tobytes(), len(faces)
