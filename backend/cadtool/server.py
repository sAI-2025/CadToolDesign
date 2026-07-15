from __future__ import annotations

import json
import mimetypes
import sys
import traceback
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

from .config import CONFIG, AppConfig
from .database import Database
from .storage import describe_storage


class CadToolRequestHandler(BaseHTTPRequestHandler):
    database: Database
    config: AppConfig

    def do_GET(self) -> None:
        route = urlparse(self.path).path
        parts = split_route(route)

        if route == "/api/health":
            self.send_json({"status": "ok", "storage": "local", "database": "sqlite3"})
            return

        if route == "/api/storage":
            self.send_json(
                describe_storage(
                    self.config.data_dir,
                    self.config.database_path,
                    self.config.projects_dir,
                )
            )
            return

        if route == "/api/projects":
            self.send_json({"projects": self.database.list_projects()})
            return

        if len(parts) == 3 and parts[:2] == ["api", "projects"]:
            self.send_project(parts[2])
            return

        if len(parts) == 6 and parts[:2] == ["api", "projects"] and parts[3] == "components" and parts[5] == "asset":
            self.send_component_asset(parts[2], parts[4])
            return

        self.send_static(route)

    def do_POST(self) -> None:
        route = urlparse(self.path).path
        parts = split_route(route)

        if route == "/api/projects":
            payload = self.read_json()
            try:
                project = self.database.create_project(
                    str(payload.get("name", "")),
                    str(payload.get("unit", "mm")),
                )
            except ValueError as error:
                self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
                return

            self.send_json({"project": project}, HTTPStatus.CREATED)
            return

        if len(parts) == 4 and parts[:2] == ["api", "projects"] and parts[3] == "delete":
            try:
                self.database.delete_project(parts[2])
            except LookupError as error:
                self.send_json({"error": str(error)}, HTTPStatus.NOT_FOUND)
                return

            self.send_json({"deleted": True, "projectId": parts[2]})
            return

        if len(parts) == 4 and parts[:2] == ["api", "projects"] and parts[3] == "unit":
            payload = self.read_json()
            try:
                project = self.database.update_project_unit(parts[2], str(payload.get("unit", "")))
            except LookupError as error:
                self.send_json({"error": str(error)}, HTTPStatus.NOT_FOUND)
                return
            except ValueError as error:
                self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
                return

            self.send_json({"project": project})
            return

        if len(parts) == 5 and parts[:2] == ["api", "projects"] and parts[3:] == ["components", "import"]:
            self.import_component(parts[2])
            return

        if len(parts) == 6 and parts[:2] == ["api", "projects"] and parts[3] == "components" and parts[5] == "visibility":
            payload = self.read_json()
            try:
                component = self.database.update_component_visibility(
                    parts[2],
                    parts[4],
                    bool(payload.get("visible", True)),
                )
            except LookupError as error:
                self.send_json({"error": str(error)}, HTTPStatus.NOT_FOUND)
                return

            self.send_json({"component": component})
            return

        if len(parts) == 6 and parts[:2] == ["api", "projects"] and parts[3] == "components" and parts[5] == "state":
            payload = self.read_json()
            try:
                component = self.database.update_component_state(
                    parts[2],
                    parts[4],
                    locked=payload.get("locked") if "locked" in payload else None,
                    transform=payload.get("transform") if "transform" in payload else None,
                )
            except LookupError as error:
                self.send_json({"error": str(error)}, HTTPStatus.NOT_FOUND)
                return
            except ValueError as error:
                self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
                return

            self.send_json({"component": component})
            return

        self.send_json({"error": "Not found."}, HTTPStatus.NOT_FOUND)

    def send_project(self, project_id: str) -> None:
        try:
            self.send_json({"project": self.database.get_project(project_id)})
        except LookupError as error:
            self.send_json({"error": str(error)}, HTTPStatus.NOT_FOUND)

    def send_component_asset(self, project_id: str, component_id: str) -> None:
        try:
            asset_path = self.database.get_component_asset_path(project_id, component_id)
        except LookupError as error:
            self.send_json({"error": str(error)}, HTTPStatus.NOT_FOUND)
            return

        self.send_response_body(asset_path.read_bytes(), "model/stl")

    def import_component(self, project_id: str) -> None:
        filename = unquote(self.headers.get("X-Filename", "")).strip()
        unit = self.headers.get("X-Unit", "mm").strip()
        body = self.read_body()

        try:
            component = self.database.import_component(project_id, filename, unit, body)
        except LookupError as error:
            self.send_json({"error": str(error)}, HTTPStatus.NOT_FOUND)
            return
        except ValueError as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
            return

        self.send_json({"component": component}, HTTPStatus.CREATED)

    def read_json(self) -> dict[str, object]:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length == 0:
            return {}

        raw_body = self.rfile.read(content_length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

        return payload if isinstance(payload, dict) else {}

    def read_body(self) -> bytes:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            return b""
        return self.rfile.read(content_length)

    def send_json(self, payload: dict[str, object], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response_body(body, "application/json; charset=utf-8", status)

    def send_static(self, route: str) -> None:
        static_path = self.resolve_static_path(route)
        if static_path is None:
            self.send_json({"error": "Not found."}, HTTPStatus.NOT_FOUND)
            return

        content_type = mimetypes.guess_type(static_path.name)[0] or "application/octet-stream"
        self.send_response_body(static_path.read_bytes(), content_type)

    def send_response_body(
        self,
        body: bytes,
        content_type: str,
        status: HTTPStatus = HTTPStatus.OK,
    ) -> None:
        try:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            return

    def resolve_static_path(self, route: str):
        if route.startswith("/vendor/"):
            static_root = (self.config.root_dir / "node_modules").resolve()
            relative = unquote(route.removeprefix("/vendor/"))
            candidate = (static_root / relative).resolve()
        else:
            relative = "index.html" if route in ("", "/") else unquote(route).lstrip("/")
            static_root = self.config.static_dir.resolve()
            candidate = (static_root / relative).resolve()

        if static_root not in candidate.parents and candidate != static_root:
            return None

        if candidate.is_dir():
            candidate = candidate / "index.html"

        return candidate if candidate.exists() and candidate.is_file() else None

    def log_message(self, format: str, *args: object) -> None:
        return


def build_server(config: AppConfig = CONFIG) -> ThreadingHTTPServer:
    database = Database(config.database_path, config.data_dir, config.projects_dir)
    database.initialize()

    CadToolRequestHandler.database = database
    CadToolRequestHandler.config = config
    return ThreadingHTTPServer((config.host, config.port), CadToolRequestHandler)


def main() -> None:
    server = build_server()
    safe_print(f"CadToolDesign local server running at http://{CONFIG.host}:{CONFIG.port}")
    safe_print(f"SQLite database: {CONFIG.database_path}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        safe_print("\nStopping CadToolDesign local server.")
    finally:
        server.server_close()


def safe_print(message: str) -> None:
    if sys.stdout is None:
        return

    try:
        print(message, flush=True)
    except OSError:
        return


def split_route(route: str) -> list[str]:
    return [part for part in route.strip("/").split("/") if part]


if __name__ == "__main__":
    try:
        main()
    except Exception:
        CONFIG.data_dir.mkdir(parents=True, exist_ok=True)
        (CONFIG.data_dir / "server.crash.log").write_text(traceback.format_exc(), encoding="utf-8")
        raise
