"""Saving uploaded photos and certificates."""
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

IMAGES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
DOCUMENTS = {**IMAGES, "application/pdf": ".pdf"}


def _looks_like(ext: str, data: bytes) -> bool:
    """Check the first bytes, so a renamed HTML file can't pretend to be a photo."""
    if ext == ".jpg":
        return data.startswith(b"\xff\xd8\xff")
    if ext == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == ".webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if ext == ".pdf":
        return data.startswith(b"%PDF")
    return False


def save_upload(file: UploadFile, folder: Path, allowed: dict[str, str], max_mb: int) -> tuple[str, int]:
    """Validate and store the file under a random name. Returns (file name, size in bytes)."""
    ext = allowed.get(file.content_type or "")
    if ext is None:
        kinds = ", ".join(sorted({e.lstrip(".").upper() for e in allowed.values()}))
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"Upload {kinds}")
    limit = max_mb * 1024 * 1024
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"The file is larger than {max_mb} MB")
    if not _looks_like(ext, data):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "The file content doesn't match its type")
    folder.mkdir(parents=True, exist_ok=True)
    name = uuid.uuid4().hex + ext
    (folder / name).write_bytes(data)
    return name, len(data)


def delete_file(folder: Path, name: str | None) -> None:
    if name:
        (folder / name).unlink(missing_ok=True)
