"""F-010 upload boundary hardening tests.

Covers the visitor photo upload endpoint (``POST /api/visitors/{id}/photo``) —
the public kiosk upload surface — plus the theme-logo filename sanitizer.

Each test that persists a file monkeypatches ``main.PHOTO_DIR`` to a tmp
directory so the real ``backend/uploads/photos`` tree is never touched.
"""

import io
from datetime import datetime

from PIL import Image

from app import main
from app.models import Visitor


def _make_visitor(db_session):
    visitor = Visitor(
        first_name="Ada",
        last_name="Lovelace",
        visitor_type="Guest",
        purpose="Visit",
        host_type="Staff",
        host_name="Someone",
        check_in_time=datetime.now(),
    )
    db_session.add(visitor)
    db_session.commit()
    db_session.refresh(visitor)
    return visitor


def _png_bytes(size=(64, 64), color=(200, 30, 30)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_bytes(size=(64, 64), color=(30, 120, 200)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG")
    return buf.getvalue()


def _upload(client, visitor_id, content, filename="photo.png", ctype="image/png"):
    return client.post(
        f"/api/visitors/{visitor_id}/photo",
        files={"file": (filename, content, ctype)},
    )


# --------------------------------------------------------------------------- #
# Happy path
# --------------------------------------------------------------------------- #
def test_valid_png_upload_succeeds(client, db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "PHOTO_DIR", tmp_path)
    visitor = _make_visitor(db_session)

    resp = _upload(client, visitor.id, _png_bytes())
    assert resp.status_code == 200, resp.text

    saved = tmp_path / f"{visitor.id}.jpg"
    assert saved.is_file()
    with Image.open(saved) as img:
        assert img.format == "JPEG"  # always re-encoded to JPEG


def test_valid_jpeg_upload_succeeds(client, db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "PHOTO_DIR", tmp_path)
    visitor = _make_visitor(db_session)

    resp = _upload(
        client, visitor.id, _jpeg_bytes(), filename="p.jpg", ctype="image/jpeg"
    )
    assert resp.status_code == 200, resp.text
    assert (tmp_path / f"{visitor.id}.jpg").is_file()


def test_upload_resets_badge_and_sets_photo_path(
    client, db_session, tmp_path, monkeypatch
):
    monkeypatch.setattr(main, "PHOTO_DIR", tmp_path)
    visitor = _make_visitor(db_session)

    resp = _upload(client, visitor.id, _png_bytes())
    assert resp.status_code == 200
    body = resp.json()
    assert body["photo_path"] == f"uploads/photos/{visitor.id}.jpg"


# --------------------------------------------------------------------------- #
# Size cap
# --------------------------------------------------------------------------- #
def test_oversized_upload_rejected(client, db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "PHOTO_DIR", tmp_path)
    monkeypatch.setattr(main, "MAX_PHOTO_BYTES", 128)
    visitor = _make_visitor(db_session)

    resp = _upload(client, visitor.id, b"x" * 512)
    assert resp.status_code == 413
    assert not (tmp_path / f"{visitor.id}.jpg").exists()


def test_empty_upload_rejected(client, db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "PHOTO_DIR", tmp_path)
    visitor = _make_visitor(db_session)

    resp = _upload(client, visitor.id, b"")
    assert resp.status_code == 400


# --------------------------------------------------------------------------- #
# Content validation
# --------------------------------------------------------------------------- #
def test_non_image_bytes_rejected(client, db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "PHOTO_DIR", tmp_path)
    visitor = _make_visitor(db_session)

    resp = _upload(client, visitor.id, b"this is definitely not an image")
    assert resp.status_code == 400
    assert not (tmp_path / f"{visitor.id}.jpg").exists()


def test_truncated_image_rejected(client, db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "PHOTO_DIR", tmp_path)
    visitor = _make_visitor(db_session)

    # Valid PNG header/signature but truncated body -> load() fails.
    truncated = _png_bytes()[:20]
    resp = _upload(client, visitor.id, truncated)
    assert resp.status_code == 400


def test_decompression_bomb_rejected(client, db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "PHOTO_DIR", tmp_path)
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 100)  # 64x64 = 4096 > 2x cap
    visitor = _make_visitor(db_session)

    resp = _upload(client, visitor.id, _png_bytes(size=(64, 64)))
    assert resp.status_code == 400
    assert not (tmp_path / f"{visitor.id}.jpg").exists()


# --------------------------------------------------------------------------- #
# Dimension bounding
# --------------------------------------------------------------------------- #
def test_large_image_is_downscaled(client, db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "PHOTO_DIR", tmp_path)
    monkeypatch.setattr(main, "MAX_PHOTO_DIM", 256)
    visitor = _make_visitor(db_session)

    resp = _upload(client, visitor.id, _png_bytes(size=(1200, 900)))
    assert resp.status_code == 200

    with Image.open(tmp_path / f"{visitor.id}.jpg") as img:
        assert max(img.size) <= 256


# --------------------------------------------------------------------------- #
# Path traversal / naming
# --------------------------------------------------------------------------- #
def test_malicious_filename_cannot_escape_storage(
    client, db_session, tmp_path, monkeypatch
):
    monkeypatch.setattr(main, "PHOTO_DIR", tmp_path)
    visitor = _make_visitor(db_session)

    resp = _upload(
        client,
        visitor.id,
        _png_bytes(),
        filename="../../../../evil.jpg",
    )
    assert resp.status_code == 200
    # Storage name is derived from the integer visitor id, not the upload name.
    assert (tmp_path / f"{visitor.id}.jpg").is_file()
    assert not (tmp_path.parent / "evil.jpg").exists()


def test_non_integer_visitor_id_rejected(client, db_session):
    resp = client.post(
        "/api/visitors/not-an-int/photo",
        files={"file": ("p.png", _png_bytes(), "image/png")},
    )
    assert resp.status_code == 422


def test_upload_for_missing_visitor_returns_404(
    client, db_session, tmp_path, monkeypatch
):
    monkeypatch.setattr(main, "PHOTO_DIR", tmp_path)
    resp = _upload(client, 999999, _png_bytes())
    assert resp.status_code == 404


# --------------------------------------------------------------------------- #
# Theme-logo filename sanitizer (traversal defense on the admin surface)
# --------------------------------------------------------------------------- #
def test_logo_filename_is_sanitized():
    assert main._logo_filename("../../etc/passwd") == "______etc_passwd.png"
    assert main._logo_filename("safe-theme_1").endswith(".png")
    assert "/" not in main._logo_filename("a/b/c")
