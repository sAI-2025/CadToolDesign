from __future__ import annotations

from pathlib import Path


PROJECT_SUBDIRECTORIES = ("assets", "thumbnails", "exports")


def ensure_app_storage(data_dir: Path, projects_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    projects_dir.mkdir(parents=True, exist_ok=True)


def ensure_project_storage(projects_dir: Path, project_id: str) -> Path:
    project_dir = projects_dir / project_id
    project_dir.mkdir(parents=True, exist_ok=True)

    for directory_name in PROJECT_SUBDIRECTORIES:
        (project_dir / directory_name).mkdir(exist_ok=True)

    return project_dir


def describe_storage(data_dir: Path, database_path: Path, projects_dir: Path) -> dict[str, str]:
    return {
        "dataDir": str(data_dir),
        "databasePath": str(database_path),
        "projectsDir": str(projects_dir),
    }
