# CadToolDesign

Local-first 3D mechanical simulation workspace.

This repository is being built stage by stage from `pdr.md`. Stage 1 only provides the local application foundation:

- Python standard-library backend
- SQLite project database
- Local filesystem project storage
- Static 3-pane workspace shell
- Project create/list/load APIs

No AI services, Postgres, or S3 are used. Stage 2 adds STL import, local component storage, and browser-side 3D preview.

## Run

Create the environment:

```cmd
python -m venv .venv
```

Install Python dependencies:

```cmd
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Install JavaScript dependencies:

```cmd
cmd /c npm install
```

Start the local app:

```cmd
.venv\Scripts\python.exe -m backend.cadtool.server
```

Open:

```text
http://127.0.0.1:8765
```

## Local Data

Runtime data is stored under `data/`:

- `data/cadtool.sqlite3` stores project metadata and future workspace records.
- `data/projects/<project-id>/` stores local project files.
- `data/projects/<project-id>/assets/` stores imported STL files.
- `data/projects/<project-id>/thumbnails/` is reserved for generated thumbnails.
- `data/projects/<project-id>/exports/` is reserved for exports.

The `data/` directory is ignored by Git.

## Stage Plan

1. Foundation and local project storage
2. STL import and multi-component viewport
3. Measurement tools
4. Transform, snapping, and alignment
5. Joint definition and connection graph
6. Simulation driver controls and basic motion
7. Save/load polish, export, and validation improvements
