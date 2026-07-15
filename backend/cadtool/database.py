from __future__ import annotations

import json
import re
import shutil
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from .storage import ensure_app_storage, ensure_project_storage


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'mm',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS components (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    source_filename TEXT,
    storage_path TEXT,
    visible INTEGER NOT NULL DEFAULT 1,
    locked INTEGER NOT NULL DEFAULT 0,
    transform_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS measurements (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    component_id TEXT,
    measurement_type TEXT NOT NULL,
    label TEXT,
    value_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS joints (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    component_a_id TEXT NOT NULL,
    component_b_id TEXT NOT NULL,
    joint_type TEXT NOT NULL,
    params_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (component_a_id) REFERENCES components(id) ON DELETE CASCADE,
    FOREIGN KEY (component_b_id) REFERENCES components(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS simulation_configs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
"""


VALID_UNITS = {"mm", "cm", "m", "in"}
LARGE_FILE_WARNING_BYTES = 20 * 1024 * 1024


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Database:
    def __init__(self, database_path: Path, data_dir: Path, projects_dir: Path) -> None:
        self.database_path = database_path
        self.data_dir = data_dir
        self.projects_dir = projects_dir

    def initialize(self) -> None:
        ensure_app_storage(self.data_dir, self.projects_dir)
        with self.connect() as connection:
            connection.executescript(SCHEMA)
            self.apply_migrations(connection)

    def apply_migrations(self, connection: sqlite3.Connection) -> None:
        component_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(components)").fetchall()
        }

        migrations = {
            "unit": "ALTER TABLE components ADD COLUMN unit TEXT NOT NULL DEFAULT 'mm'",
            "file_size": "ALTER TABLE components ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0",
            "validation_status": "ALTER TABLE components ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'pending'",
            "validation_warnings_json": "ALTER TABLE components ADD COLUMN validation_warnings_json TEXT NOT NULL DEFAULT '[]'",
            "mesh_format": "ALTER TABLE components ADD COLUMN mesh_format TEXT NOT NULL DEFAULT 'unknown'",
        }

        for column_name, statement in migrations.items():
            if column_name not in component_columns:
                connection.execute(statement)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON;")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def list_projects(self) -> list[dict[str, object]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT id, name, unit, created_at, updated_at
                FROM projects
                ORDER BY updated_at DESC
                """
            ).fetchall()

        return [dict(row) for row in rows]

    def create_project(self, name: str, unit: str = "mm") -> dict[str, object]:
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Project name is required.")

        if unit not in VALID_UNITS:
            raise ValueError(f"Unit must be one of: {', '.join(sorted(VALID_UNITS))}.")

        project_id = str(uuid.uuid4())
        timestamp = utc_now()
        project_dir = ensure_project_storage(self.projects_dir, project_id)

        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO projects (id, name, unit, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (project_id, clean_name, unit, timestamp, timestamp),
            )

        project = self.get_project(project_id)
        project["storagePath"] = str(project_dir)
        return project

    def delete_project(self, project_id: str) -> None:
        project_dir = (self.projects_dir / project_id).resolve()
        projects_root = self.projects_dir.resolve()
        if projects_root not in project_dir.parents:
            raise LookupError("Project not found.")

        with self.connect() as connection:
            result = connection.execute(
                """
                DELETE FROM projects
                WHERE id = ?
                """,
                (project_id,),
            )

            if result.rowcount == 0:
                raise LookupError("Project not found.")

        if project_dir.exists():
            shutil.rmtree(project_dir)

    def update_project_unit(self, project_id: str, unit: str) -> dict[str, object]:
        if unit not in VALID_UNITS:
            raise ValueError(f"Unit must be one of: {', '.join(sorted(VALID_UNITS))}.")

        timestamp = utc_now()

        with self.connect() as connection:
            result = connection.execute(
                """
                UPDATE projects
                SET unit = ?, updated_at = ?
                WHERE id = ?
                """,
                (unit, timestamp, project_id),
            )

            if result.rowcount == 0:
                raise LookupError("Project not found.")

        return self.get_project(project_id)

    def import_component(self, project_id: str, filename: str, unit: str, body: bytes) -> dict[str, object]:
        clean_filename = sanitize_filename(filename)
        if not clean_filename:
            raise ValueError("Filename is required.")

        if unit not in VALID_UNITS:
            raise ValueError(f"Unit must be one of: {', '.join(sorted(VALID_UNITS))}.")

        project = self.get_project(project_id)
        analysis = analyze_stl_bytes(clean_filename, body)
        component_id = str(uuid.uuid4())
        timestamp = utc_now()
        component_name = Path(clean_filename).stem or f"component-{component_id[:8]}"
        asset_relative_path = Path("assets") / f"{component_id}-{clean_filename}"
        asset_absolute_path = self.projects_dir / project_id / asset_relative_path
        asset_absolute_path.write_bytes(body)
        default_transform = self.default_import_transform(project)

        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO components (
                    id,
                    project_id,
                    name,
                    source_filename,
                    storage_path,
                    unit,
                    file_size,
                    validation_status,
                    validation_warnings_json,
                    mesh_format,
                    visible,
                    locked,
                    transform_json,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)
                """,
                (
                    component_id,
                    project["id"],
                    component_name,
                    clean_filename,
                    str(asset_relative_path).replace("\\", "/"),
                    unit,
                    analysis["fileSize"],
                    analysis["validationStatus"],
                    json.dumps(analysis["warnings"]),
                    analysis["meshFormat"],
                    json.dumps(default_transform),
                    timestamp,
                    timestamp,
                ),
            )

            connection.execute(
                """
                UPDATE projects
                SET updated_at = ?
                WHERE id = ?
                """,
                (timestamp, project["id"]),
            )

        return self.get_component(project_id, component_id)

    def update_component_visibility(
        self,
        project_id: str,
        component_id: str,
        visible: bool,
    ) -> dict[str, object]:
        timestamp = utc_now()

        with self.connect() as connection:
            result = connection.execute(
                """
                UPDATE components
                SET visible = ?, updated_at = ?
                WHERE id = ? AND project_id = ?
                """,
                (1 if visible else 0, timestamp, component_id, project_id),
            )

            if result.rowcount == 0:
                raise LookupError("Component not found.")

            connection.execute(
                """
                UPDATE projects
                SET updated_at = ?
                WHERE id = ?
                """,
                (timestamp, project_id),
            )

        return self.get_component(project_id, component_id)

    def update_component_state(
        self,
        project_id: str,
        component_id: str,
        *,
        locked: bool | None = None,
        transform: dict[str, object] | None = None,
    ) -> dict[str, object]:
        updates: list[str] = []
        values: list[object] = []
        timestamp = utc_now()

        if locked is not None:
            updates.append("locked = ?")
            values.append(1 if locked else 0)

        if transform is not None:
            updates.append("transform_json = ?")
            values.append(json.dumps(normalize_transform(transform)))

        if not updates:
            raise ValueError("No component state changes were provided.")

        updates.append("updated_at = ?")
        values.append(timestamp)
        values.extend([component_id, project_id])

        with self.connect() as connection:
            result = connection.execute(
                f"""
                UPDATE components
                SET {", ".join(updates)}
                WHERE id = ? AND project_id = ?
                """,
                values,
            )

            if result.rowcount == 0:
                raise LookupError("Component not found.")

            connection.execute(
                """
                UPDATE projects
                SET updated_at = ?
                WHERE id = ?
                """,
                (timestamp, project_id),
            )

        return self.get_component(project_id, component_id)

    def get_component_asset_path(self, project_id: str, component_id: str) -> Path:
        component = self.get_component(project_id, component_id)
        storage_path = component.get("storage_path")
        if not isinstance(storage_path, str) or not storage_path:
            raise LookupError("Component asset not found.")

        asset_path = (self.projects_dir / project_id / storage_path).resolve()
        project_root = (self.projects_dir / project_id).resolve()
        if project_root not in asset_path.parents:
            raise LookupError("Component asset not found.")
        if not asset_path.exists():
            raise LookupError("Component asset not found.")
        return asset_path

    def get_component(self, project_id: str, component_id: str) -> dict[str, object]:
        with self.connect() as connection:
            component = connection.execute(
                """
                SELECT
                    id,
                    project_id,
                    name,
                    source_filename,
                    storage_path,
                    unit,
                    file_size,
                    validation_status,
                    validation_warnings_json,
                    mesh_format,
                    visible,
                    locked,
                    transform_json,
                    created_at,
                    updated_at
                FROM components
                WHERE project_id = ? AND id = ?
                """,
                (project_id, component_id),
            ).fetchone()

            if component is None:
                raise LookupError("Component not found.")

        return self.serialize_component(component)

    def get_project(self, project_id: str) -> dict[str, object]:
        with self.connect() as connection:
            project = connection.execute(
                """
                SELECT id, name, unit, created_at, updated_at
                FROM projects
                WHERE id = ?
                """,
                (project_id,),
            ).fetchone()

            if project is None:
                raise LookupError("Project not found.")

            components = connection.execute(
                """
                SELECT
                    id,
                    project_id,
                    name,
                    source_filename,
                    storage_path,
                    unit,
                    file_size,
                    validation_status,
                    validation_warnings_json,
                    mesh_format,
                    visible,
                    locked,
                    transform_json,
                    created_at,
                    updated_at
                FROM components
                WHERE project_id = ?
                ORDER BY created_at ASC
                """,
                (project_id,),
            ).fetchall()

            joints = connection.execute(
                """
                SELECT id, component_a_id, component_b_id, joint_type, params_json
                FROM joints
                WHERE project_id = ?
                ORDER BY created_at ASC
                """,
                (project_id,),
            ).fetchall()

            measurements = connection.execute(
                """
                SELECT id, component_id, measurement_type, label, value_json
                FROM measurements
                WHERE project_id = ?
                ORDER BY created_at ASC
                """,
                (project_id,),
            ).fetchall()

        return {
            **dict(project),
            "storagePath": str(self.projects_dir / project_id),
            "components": [self.serialize_component(row) for row in components],
            "joints": [dict(row) for row in joints],
            "measurements": [dict(row) for row in measurements],
        }

    def serialize_component(self, row: sqlite3.Row) -> dict[str, object]:
        payload = dict(row)
        payload["visible"] = bool(payload["visible"])
        payload["locked"] = bool(payload["locked"])
        payload["validationWarnings"] = json.loads(payload.pop("validation_warnings_json"))
        payload["transform"] = normalize_transform(json.loads(payload.pop("transform_json") or "{}"))
        payload["fileSizeLabel"] = format_file_size(int(payload["file_size"]))
        return payload

    def default_import_transform(self, project: dict[str, object]) -> dict[str, object]:
        count = len(project.get("components", []))
        spacing = 140.0
        return normalize_transform(
            {
                "position": {"x": float(count) * spacing, "y": 0.0, "z": 0.0},
                "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
            }
        )


def sanitize_filename(filename: str) -> str:
    base_name = Path(filename).name.strip()
    if not base_name:
        return ""

    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", base_name)
    return sanitized[:120]


def analyze_stl_bytes(filename: str, body: bytes) -> dict[str, object]:
    if Path(filename).suffix.lower() != ".stl":
        raise ValueError("Only .stl files can be imported in Stage 2.")

    if not body:
        raise ValueError("The uploaded STL file is empty.")

    warnings: list[str] = []
    mesh_format = "binary"
    validation_status = "ready"
    lower_prefix = body[:512].lower()

    if len(body) > LARGE_FILE_WARNING_BYTES:
        warnings.append("Large STL file; preview performance may be slower.")

    if lower_prefix.startswith(b"solid") and b"facet" in lower_prefix:
        mesh_format = "ascii"
        if b"vertex" not in lower_prefix:
            warnings.append("ASCII STL markers look incomplete near the file header.")
        if b"endsolid" not in body[-512:].lower():
            warnings.append("ASCII STL footer was not found; the file may be incomplete.")
    else:
        mesh_format = "binary"
        if len(body) < 84:
            warnings.append("Binary STL header is shorter than expected.")
        else:
            triangle_count = int.from_bytes(body[80:84], "little")
            expected_size = 84 + (triangle_count * 50)
            if expected_size != len(body):
                warnings.append("Binary STL triangle count does not match the file size.")

    if warnings:
        validation_status = "warning"

    return {
        "fileSize": len(body),
        "meshFormat": mesh_format,
        "validationStatus": validation_status,
        "warnings": warnings,
    }


def format_file_size(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / (1024 * 1024):.1f} MB"


def normalize_transform(transform: dict[str, object]) -> dict[str, dict[str, float]]:
    position = transform.get("position", {}) if isinstance(transform, dict) else {}
    rotation = transform.get("rotation", {}) if isinstance(transform, dict) else {}

    return {
        "position": {
            "x": float(position.get("x", 0.0)),
            "y": float(position.get("y", 0.0)),
            "z": float(position.get("z", 0.0)),
        },
        "rotation": {
            "x": float(rotation.get("x", 0.0)),
            "y": float(rotation.get("y", 0.0)),
            "z": float(rotation.get("z", 0.0)),
        },
    }
