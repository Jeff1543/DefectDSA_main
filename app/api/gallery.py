import json
import re
import struct
from pathlib import Path

from fastapi import APIRouter

from app.api.core.config import STATIC_DIR

router = APIRouter(prefix="/api", tags=["Gallery"])

GALLERY_DIR = STATIC_DIR / "img" / "dokumentasi"
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}


def _image_size(path: Path):
    """Lebar & tinggi dari header file (tanpa pustaka gambar). None bila tidak terbaca."""

    try:
        with open(path, "rb") as fh:
            head = fh.read(32)
            ext = path.suffix.lower()

            if head[:8] == b"\x89PNG\r\n\x1a\n":
                return struct.unpack(">II", head[16:24])

            if head[:6] in (b"GIF87a", b"GIF89a"):
                return struct.unpack("<HH", head[6:10])

            if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
                kind = head[12:16]
                if kind == b"VP8X":
                    w = 1 + int.from_bytes(head[24:27], "little")
                    h = 1 + int.from_bytes(head[27:30], "little")
                    return w, h
                if kind == b"VP8 ":
                    w, h = struct.unpack("<HH", head[26:30])
                    return w & 0x3FFF, h & 0x3FFF
                if kind == b"VP8L":
                    bits = int.from_bytes(head[21:25], "little")
                    return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
                return None

            if ext in (".jpg", ".jpeg") or head[:2] == b"\xff\xd8":
                fh.seek(2)
                while True:
                    marker = fh.read(2)
                    if len(marker) < 2 or marker[0] != 0xFF:
                        return None
                    code = marker[1]
                    if code in (0xD8, 0x01) or 0xD0 <= code <= 0xD7:
                        continue
                    size = struct.unpack(">H", fh.read(2))[0]
                    if 0xC0 <= code <= 0xCF and code not in (0xC4, 0xC8, 0xCC):
                        fh.read(1)
                        h, w = struct.unpack(">HH", fh.read(4))
                        return w, h
                    fh.seek(size - 2, 1)
    except (OSError, struct.error):
        return None
    return None


def _natural_key(name: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name)]


@router.get("/gallery")
def gallery():
    """
    Daftar foto di static/img/dokumentasi/ (otomatis; cukup letakkan fotonya).
    Keterangan opsional dibaca dari captions.json di folder yang sama:
    {"foto-01.jpg": "Keterangan foto"}.
    """

    captions = {}
    caption_file = GALLERY_DIR / "captions.json"
    if caption_file.exists():
        try:
            data = json.loads(caption_file.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                captions = {str(k): str(v) for k, v in data.items()}
        except (OSError, ValueError):
            captions = {}

    items = []
    if GALLERY_DIR.is_dir():
        files = [
            p for p in GALLERY_DIR.iterdir()
            if p.is_file() and p.suffix.lower() in IMAGE_EXT and not p.name.startswith(".")
        ]
        for p in sorted(files, key=lambda x: _natural_key(x.name)):
            size = _image_size(p)
            items.append({
                "src": f"/static/img/dokumentasi/{p.name}",
                "name": p.name,
                "caption": captions.get(p.name, ""),
                "w": size[0] if size else None,
                "h": size[1] if size else None,
            })

    return {"success": True, "items": items}
