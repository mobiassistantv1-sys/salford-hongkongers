"""Blur faces in new SHK event photos and mirror the published ones onto the website.

1. New photos in Drive "1 原圖" → faces blurred (scripts/blur_faces.py) → saved in Drive "2 已模糊".
2. Everything in "2 已模糊" → images/gallery/<id>.jpg + data/gallery.json (read by the homepage).
   A photo deleted from "2 已模糊" is removed from the website too.
Needs GitHub secrets PHOTO_API (Apps Script web app URL, see photo-sync/Code.gs) and PHOTO_TOKEN.
"""
import base64
import json
import os
import pathlib
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from blur_faces import blur  # noqa: E402

API, TOKEN = os.environ.get("PHOTO_API"), os.environ.get("PHOTO_TOKEN")
ROOT = pathlib.Path(__file__).resolve().parent.parent
GALLERY_DIR, GALLERY_JSON = ROOT / "images" / "gallery", ROOT / "data" / "gallery.json"
PER_RUN = 25


def call(action, **kw):
    body = json.dumps({"action": action, "token": TOKEN, **kw}).encode()
    req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:  # Apps Script answers via a redirect; urllib follows it
        res = json.loads(r.read())
    if "error" in res:
        raise RuntimeError(f"{action}: {res['error']}")
    return res


def blur_new():
    pending = call("list")["pending"]
    print(f"{len(pending)} new photo(s) waiting")
    for p in pending[:PER_RUN]:
        try:
            data = base64.b64decode(call("get", id=p["id"])["data"])
            out, faces = blur(data)
            name = pathlib.Path(p["name"]).stem + ".jpg"
            call("put", sourceId=p["id"], album=p["album"], name=name, faces=faces, data=base64.b64encode(out).decode())
            print(f"  blurred {p['album']}/{p['name']} ({faces} face detections)")
        except Exception as e:  # one bad file must not stop the rest
            print(f"  FAILED {p['name']}: {e}")
            try:
                call("fail", id=p["id"], msg=str(e))
            except Exception:
                pass


def mirror():
    files = call("published")["files"]
    GALLERY_DIR.mkdir(parents=True, exist_ok=True)
    keep = {f["id"] for f in files}
    for f in files:
        path = GALLERY_DIR / f"{f['id']}.jpg"
        if not path.exists():
            path.write_bytes(base64.b64decode(call("get", id=f["id"], tree="out")["data"]))
            print(f"  published {f['album']}/{f['name']}")
    for path in GALLERY_DIR.glob("*.jpg"):
        if path.stem not in keep:
            path.unlink()
            print(f"  removed {path.name}")
    photos = sorted(({"id": f["id"], "album": f["album"], "name": f["name"], "date": f["date"]} for f in files),
                    key=lambda x: (x["album"], x["date"]), reverse=True)
    old = json.loads(GALLERY_JSON.read_text()) if GALLERY_JSON.exists() else {}
    if old.get("photos") != photos:
        GALLERY_JSON.write_text(json.dumps({"photos": photos}, ensure_ascii=False, indent=1) + "\n")
        print(f"gallery.json: {len(photos)} photo(s)")


if __name__ == "__main__":
    if not API or not TOKEN:
        print("PHOTO_API / PHOTO_TOKEN not set — skipping.")
        sys.exit(0)
    blur_new()
    mirror()
