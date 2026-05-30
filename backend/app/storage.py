"""Depolama: .env birimleri + panelden oluşturulan kayıt yolları + disk gezintisi."""

from __future__ import annotations

import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app import models

_FOLDER_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,126}$")


@dataclass(frozen=True)
class StorageVolume:
    id: str
    container_path: str
    label: str
    host_path: str
    custom: bool = False

    @property
    def path(self) -> Path:
        return Path(self.container_path)


@dataclass(frozen=True)
class BrowseRoot:
    id: str
    container_path: str
    host_path: str
    label: str

    @property
    def path(self) -> Path:
        return Path(self.container_path)


def _parse_volumes_spec(spec: str) -> list[StorageVolume]:
    volumes: list[StorageVolume] = []
    for entry in spec.split(";"):
        entry = entry.strip()
        if not entry:
            continue
        host_path = ""
        if "|" in entry:
            entry, host_path = entry.rsplit("|", 1)
            host_path = host_path.strip()
        parts = entry.split(":", 2)
        if len(parts) < 3:
            raise ValueError(
                f"Geçersiz STORAGE_VOLUMES girdisi: {entry!r}. "
                "Biçim: id:container_path:etiket|host_yol"
            )
        vid, container_path, label = (
            parts[0].strip(),
            parts[1].strip(),
            parts[2].strip(),
        )
        if not vid or not container_path.startswith("/"):
            raise ValueError(f"Geçersiz volume: {entry!r}")
        volumes.append(
            StorageVolume(
                id=vid,
                container_path=container_path.rstrip("/"),
                label=label,
                host_path=host_path or container_path,
                custom=False,
            )
        )
    if not volumes:
        raise ValueError("STORAGE_VOLUMES boş")
    return volumes


def _parse_browse_roots_spec(spec: str) -> list[BrowseRoot]:
    roots: list[BrowseRoot] = []
    for entry in spec.split(";"):
        entry = entry.strip()
        if not entry:
            continue
        host_path = ""
        if "|" in entry:
            entry, host_path = entry.rsplit("|", 1)
            host_path = host_path.strip()
        parts = entry.split(":", 2)
        if len(parts) < 3:
            raise ValueError(
                f"Geçersiz STORAGE_BROWSE_ROOTS: {entry!r}. "
                "Biçim: id:konteyner_yolu:etiket|pc_yolu"
            )
        rid, container_path, label = (
            parts[0].strip(),
            parts[1].strip(),
            parts[2].strip(),
        )
        if not rid or not container_path.startswith("/"):
            raise ValueError(f"Geçersiz browse root: {entry!r}")
        roots.append(
            BrowseRoot(
                id=rid,
                container_path=container_path.rstrip("/"),
                host_path=host_path or container_path,
                label=label,
            )
        )
    return roots


def load_env_volumes() -> dict[str, StorageVolume]:
    spec = os.getenv(
        "STORAGE_VOLUMES",
        "default:/videos:Varsayılan (data/videos)|./data/videos",
    )
    return {v.id: v for v in _parse_volumes_spec(spec)}


def load_browse_roots() -> dict[str, BrowseRoot]:
    spec = os.getenv(
        "STORAGE_BROWSE_ROOTS",
        "media:/host/media:/media;mnt:/host/mnt:/mnt",
    )
    try:
        return {r.id: r for r in _parse_browse_roots_spec(spec)}
    except ValueError:
        return {}


ENV_VOLUMES = load_env_volumes()
DEFAULT_VOLUME_ID = (
    "default" if "default" in ENV_VOLUMES else next(iter(ENV_VOLUMES))
)
BROWSE_ROOTS = load_browse_roots()


def _location_to_volume(loc: models.StorageLocation) -> StorageVolume:
    return StorageVolume(
        id=loc.id,
        container_path=loc.container_path,
        label=loc.label,
        host_path=pc_path_for_container(loc.container_path),
        custom=True,
    )


def all_volumes(db: Session | None = None) -> dict[str, StorageVolume]:
    merged = dict(ENV_VOLUMES)
    if db is not None:
        for loc in db.query(models.StorageLocation).all():
            merged[loc.id] = _location_to_volume(loc)
    return merged


def get_volume(volume_id: str | None, db: Session | None = None) -> StorageVolume:
    vid = (volume_id or DEFAULT_VOLUME_ID).strip()
    vol = all_volumes(db).get(vid)
    if not vol:
        known = ", ".join(sorted(all_volumes(db)))
        raise KeyError(f"Bilinmeyen depolama: {vid!r}. Tanımlı: {known}")
    return vol


def list_volumes(db: Session | None = None) -> list[StorageVolume]:
    return list(all_volumes(db).values())


def pc_path_for_container(container_path: str) -> str:
    """Konteyner yolunu PC (host) yoluna çevirir — mount eşlemesine göre."""
    normalized = container_path.rstrip("/")
    for root in BROWSE_ROOTS.values():
        base = root.container_path.rstrip("/")
        if normalized == base or normalized.startswith(base + "/"):
            rel = Path(normalized).relative_to(base)
            host_base = root.host_path.rstrip("/")
            if host_base != base:
                if str(rel) == ".":
                    return host_base
                return f"{host_base}/{rel.as_posix()}"
    return container_path


def get_browse_root(root_id: str) -> BrowseRoot:
    root = BROWSE_ROOTS.get(root_id.strip())
    if not root:
        known = ", ".join(sorted(BROWSE_ROOTS)) or "(yok)"
        raise KeyError(f"Bilinmeyen disk kökü: {root_id!r}. Tanımlı: {known}")
    return root


def _safe_relative(rel: str) -> str:
    rel = rel.strip().replace("\\", "/").strip("/")
    if ".." in rel.split("/"):
        raise ValueError("Geçersiz yol")
    return rel


def _resolve_under(root: BrowseRoot, relative: str) -> Path:
    base = root.path.resolve()
    target = (root.path / _safe_relative(relative)).resolve()
    if not str(target).startswith(str(base)):
        raise ValueError("Yol izin verilen disk dışında")
    return target


def sanitize_folder_name(name: str) -> str:
    name = name.strip()
    if not _FOLDER_RE.match(name):
        raise ValueError(
            "Klasör adı harf/rakam ile başlamalı; yalnızca harf, rakam, . _ - kullanın"
        )
    return name


@dataclass
class BrowseEntry:
    name: str
    path: str


@dataclass
class BrowseResult:
    root_id: str
    root_label: str
    current_path: str
    parent_path: str | None
    host_prefix: str
    entries: list[BrowseEntry]


def browse_directory(root_id: str, relative_path: str = "") -> BrowseResult:
    root = get_browse_root(root_id)
    rel = _safe_relative(relative_path)
    current = _resolve_under(root, rel)

    if not current.exists():
        raise FileNotFoundError(f"Klasör bulunamadı: {rel or '/'}")
    if not current.is_dir():
        raise NotADirectoryError("Hedef bir klasör değil")

    entries: list[BrowseEntry] = []
    try:
        for child in sorted(current.iterdir(), key=lambda p: p.name.lower()):
            if child.is_dir() and not child.name.startswith("."):
                child_rel = f"{rel}/{child.name}" if rel else child.name
                entries.append(BrowseEntry(name=child.name, path=child_rel))
    except OSError as exc:
        raise PermissionError(f"Klasör listelenemedi: {exc}") from exc

    parent_path: str | None = None
    if rel:
        parts = rel.split("/")
        parent_path = "/".join(parts[:-1]) if len(parts) > 1 else ""

    return BrowseResult(
        root_id=root.id,
        root_label=root.label,
        current_path=rel,
        parent_path=parent_path,
        host_prefix=root.host_path.rstrip("/"),
        entries=entries,
    )


def create_storage_location(
    db: Session,
    *,
    root_id: str,
    browse_path: str,
    folder_name: str,
    label: str,
) -> StorageVolume:
    root = get_browse_root(root_id)
    rel = _safe_relative(browse_path)
    folder = sanitize_folder_name(folder_name)
    label = label.strip() or folder

    parent = _resolve_under(root, rel)
    if not parent.exists():
        raise FileNotFoundError("Üst klasör bulunamadı; önce gezinerek klasöre gidin")
    if not parent.is_dir():
        raise NotADirectoryError("Üst yol bir klasör değil")

    target = (parent / folder).resolve()
    base = root.path.resolve()
    if not str(target).startswith(str(base)):
        raise ValueError("Hedef yol izin dışında")

    target.mkdir(parents=True, exist_ok=True)
    os.chmod(target, 0o777)

    container_path = str(target)
    host_path = pc_path_for_container(container_path)

    existing = (
        db.query(models.StorageLocation)
        .filter(models.StorageLocation.container_path == container_path)
        .first()
    )
    if existing:
        return _location_to_volume(existing)

    loc_id = f"loc-{uuid.uuid4().hex[:10]}"
    row = models.StorageLocation(
        id=loc_id,
        label=label,
        container_path=container_path,
        host_path=host_path,
        root_id=root_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _location_to_volume(row)


def delete_storage_location(db: Session, location_id: str) -> None:
    if location_id in ENV_VOLUMES:
        raise ValueError("Varsayılan depolama silinemez")
    loc = db.get(models.StorageLocation, location_id)
    if not loc:
        raise KeyError("Kayıt yeri bulunamadı")
    in_use = (
        db.query(models.Video).filter(models.Video.storage_id == location_id).count()
    )
    if in_use:
        raise ValueError(f"Bu kayıt yerinde {in_use} video var; önce silin veya taşıyın")
    db.delete(loc)
    db.commit()
