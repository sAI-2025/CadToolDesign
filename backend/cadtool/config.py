from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class AppConfig:
    host: str = "127.0.0.1"
    port: int = 8765
    root_dir: Path = ROOT_DIR
    data_dir: Path = ROOT_DIR / "data"
    static_dir: Path = ROOT_DIR / "frontend"

    @property
    def database_path(self) -> Path:
        return self.data_dir / "cadtool.sqlite3"

    @property
    def projects_dir(self) -> Path:
        return self.data_dir / "projects"


CONFIG = AppConfig()
