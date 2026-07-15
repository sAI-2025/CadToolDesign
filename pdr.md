# Product Design Requirements (PDR)
## Unified 3D Mechanical Simulation Platform

| | |
|---|---|
| **Document Type** | Product Design Requirements (PDR) |
| **Version** | 1.0 |
| **Status** | Draft — Ready for Engineering Handoff |
| **Prepared For** | Development Team |
| **Date** | July 2026 |

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Functional Requirements](#2-functional-requirements)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Feature Prioritization (MoSCoW)](#4-feature-prioritization-moscow)
5. [User Flow & Interaction Design](#5-user-flow--interaction-design)
6. [Motion Simulation Specifications](#6-motion-simulation-specifications)
7. [Technical Constraints & Assumptions](#7-technical-constraints--assumptions)
8. [Appendix: Full Dependency Reference](#8-appendix-full-dependency-reference)

---

## 1. Executive Summary

### 1.1 Vision
Engineers, product designers, and hobbyist makers today juggle a fragmented toolchain — a CAD viewer for STL inspection, a separate tool for measurement, spreadsheets or notes for assembly logic, and full-blown CAD suites (SolidWorks, Fusion 360) or physics engines for motion validation. This fragmentation is slow, expensive, and inaccessible to non-experts.

**The platform's vision** is to become a single, browser-based workspace where anyone can:
- Drop in STL files of mechanical parts,
- Inspect and measure them precisely,
- Assemble them visually by defining how parts connect,
- Press "play" and watch the assembly move exactly as it would in the real world — gears meshing, pistons sliding, hinges rotating — driven by real physics constraints, not canned animations.

### 1.2 Goals
| Goal | Success Signal |
|---|---|
| Lower the barrier to mechanical simulation | A non-CAD-expert can assemble and simulate a simple 3-part mechanism (e.g., a gear pair) within 15 minutes of first use |
| Replace multi-tool workflows with one | Users can go from "raw STL" to "validated moving assembly" without leaving the browser |
| Physically accurate cascading motion | Driving one component correctly propagates motion to all kinematically connected components, respecting joint constraints |
| Accessible & zero-install | Runs entirely in a modern browser, no plugin or desktop install required for the core experience |

### 1.3 Target Users
- **Mechanical/product design engineers** — validating kinematics before physical prototyping.
- **Hobbyists & makers** — visualizing how 3D-printed mechanisms will behave.
- **Students & educators** — teaching gear trains, linkages, and mechanisms interactively.
- **Non-technical stakeholders** (PMs, sales, clients) — viewing/reviewing a mechanism's behavior without CAD expertise.

### 1.4 High-Level Requirements Summary
- Import/render multiple STL files concurrently in a shared 3D scene.
- Automatic and manual measurement tools (linear, angular, radial, volumetric, surface area).
- Visual drag-and-drop assembly with snapping, alignment guides, and explicit joint definition.
- A **connection/dependency graph** describing how components are joined (rigid, revolute, prismatic, gear, cam, etc.).
- A real-time physics-driven motion solver that propagates motion through that graph.
- Simple, instruction-style controls ("Rotate Gear A at 30 RPM clockwise") that a non-engineer can operate.
- Fully web-based, built on open-source, free-to-use libraries (no paid engine licensing).

---

## 2. Functional Requirements

### 2.1 STL File Management

| ID | Requirement | Detail |
|---|---|---|
| FR-1.1 | STL Import | Support drag-and-drop and file-picker upload of `.stl` files (both ASCII and binary format) |
| FR-1.2 | Multi-component workspace | Multiple STL files loaded simultaneously into one shared 3D scene, each treated as an independent, selectable object |
| FR-1.3 | Component library / tray | Sidebar panel listing all imported components with thumbnail preview, name, and visibility/lock toggle |
| FR-1.4 | Mesh validation | On import, check for non-manifold geometry, flipped normals, and degenerate triangles; flag warnings but allow import to proceed |
| FR-1.5 | Mesh repair (should-have) | Optional auto-repair for common STL defects (hole filling, normal recalculation) |
| FR-1.6 | Level-of-detail (LOD) | Auto-decimate very high poly-count meshes for real-time viewport performance, with an option to use full-res mesh for final measurement |
| FR-1.7 | Persistence | Save/load a full workspace (components + transforms + joints + simulation config) as a project file |
| FR-1.8 | Export | Export the assembled scene (static) as glTF/OBJ, and export simulation results (motion data) as CSV/JSON |

### 2.2 Measurement & Dimension Tools

| ID | Requirement | Detail |
|---|---|---|
| FR-2.1 | Bounding box dimensions | Auto-compute and display length × width × height (world-aligned and object-oriented bounding box) on selection |
| FR-2.2 | Point-to-point distance | Click two points on a mesh (with vertex/edge snapping) to measure linear distance |
| FR-2.3 | Diameter/radius tool | Select a circular edge/hole to auto-fit and report diameter, radius, and center point |
| FR-2.4 | Angle measurement | Select two edges or faces to measure the angle between them |
| FR-2.5 | Volume | Compute enclosed volume from the (assumed watertight) mesh |
| FR-2.6 | Surface area | Compute total surface area of the mesh |
| FR-2.7 | Mass properties (should-have) | Given a user-input material density, compute mass, center of mass, and moment of inertia — required later for accurate physics simulation |
| FR-2.8 | Units | Support mm, cm, m, in — with a global project unit setting and per-STL scale override (STL files carry no inherent units) |
| FR-2.9 | Annotation | Persist measurement markers/labels in the scene, toggle visibility |

### 2.3 Drag-and-Drop Assembly

| ID | Requirement | Detail |
|---|---|---|
| FR-3.1 | Free transform | Drag, rotate, and scale components in the 3D viewport via on-screen gizmos (translate/rotate/scale handles) |
| FR-3.2 | Snapping | Snap-to-grid, snap-to-vertex, snap-to-edge, and snap-to-face-normal while dragging |
| FR-3.3 | Alignment tools | Align-center, align-axis, and mate two faces flush (auto-orient + auto-position) |
| FR-3.4 | Joint definition UI | After positioning two components, user selects a joint type (see FR-3.5) and picks the corresponding mating features (axis, point, or face) on each part |
| FR-3.5 | Joint types (must-have set) | Fixed/Rigid, Revolute (hinge), Prismatic (slider) |
| FR-3.5b | Joint types (should-have set) | Gear (meshing pair), Cylindrical, Cam-follower, Rack-and-pinion, Belt/pulley |
| FR-3.6 | Joint limits | Optional min/max travel limits per joint (e.g., hinge from 0°–90°, slider from 0–50mm) |
| FR-3.7 | Connection graph view | A visual node graph (side panel) showing all components as nodes and joints as edges, mirroring the 3D assembly |
| FR-3.8 | Collision/interference check | Highlight overlapping geometry between components that shouldn't intersect (should-have) |

### 2.4 Physics-Based Motion Simulation

| ID | Requirement | Detail |
|---|---|---|
| FR-4.1 | Driver assignment | User designates one or more components as a "driver" (motor) with a defined motion type: rotational or linear |
| FR-4.2 | Rotational control | User sets: axis of rotation, speed (RPM or deg/s), direction (CW/CCW), and optionally torque limit |
| FR-4.3 | Linear control | User sets: axis of translation, speed (mm/s or m/s), direction, and travel limits |
| FR-4.4 | Cascading propagation | Motion of a driver propagates through the connection graph to all dependent components per their joint type and constraints (gear ratio, linkage geometry, etc.) |
| FR-4.5 | Multi-driver support | Support more than one independent driver in the same assembly (should-have) |
| FR-4.6 | Real-time playback | Play/pause/step/reset controls; simulation runs at a fixed physics timestep, decoupled from render framerate |
| FR-4.7 | Speed scaling | Global simulation speed multiplier (0.1× to 10×) for slow-motion inspection or fast-forward |
| FR-4.8 | Collision response | Components physically collide and stop/bounce per rigid-body collision rules, not just pass through each other (should-have; performance-sensitive) |
| FR-4.9 | Instruction-style commands | Natural, structured input like "Rotate Gear_A at 30 RPM clockwise" maps directly to FR-4.2's parameter set via a simple form or command palette |

### 2.5 Component Connection & Dependency Engine

| ID | Requirement | Detail |
|---|---|---|
| FR-5.1 | Joint constraint types | Rigid (0 DOF), Revolute (1 rotational DOF), Prismatic (1 translational DOF), Cylindrical (1 rotational + 1 translational DOF), Gear constraint (coupled angular velocity ratio), Cam constraint (profile-driven follower displacement) |
| FR-5.2 | Dependency resolution | The engine must resolve the graph so that driving one node computes resultant motion of all downstream nodes each physics tick |
| FR-5.3 | Cycle/conflict detection | Detect and warn on over-constrained or cyclic dependency graphs (e.g., two drivers fighting over the same joint) |
| FR-5.4 | Gear ratio computation | Given two meshing gears' pitch diameters (derived from measurement tools), auto-compute the angular velocity ratio |
| FR-5.5 | Live parameter editing | Users can change a joint's parameters (limits, ratio) while simulation is paused, and see it reflected immediately on resume |

### 2.6 User Experience

| ID | Requirement | Detail |
|---|---|---|
| FR-6.1 | Layout | Three-pane layout: (1) component/scene tree, (2) central 3D viewport, (3) contextual property/control panel |
| FR-6.2 | Simulation control panel | Persistent bottom-bar with play/pause/reset, speed slider, and per-driver quick controls |
| FR-6.3 | Guided onboarding | First-run interactive tutorial (import → measure → connect → simulate) |
| FR-6.4 | Undo/redo | Full undo/redo stack for transform, joint, and measurement actions |
| FR-6.5 | Real-time feedback | Live numeric readouts (current angle, speed, position) overlaid on the viewport during simulation |
| FR-6.6 | Responsive/non-technical friendly | Plain-language labels ("Spin Speed" not "Angular velocity ω"), tooltips, and sensible defaults so non-engineers aren't blocked by jargon |
| FR-6.7 | Accessibility | Keyboard navigation for panels, color-blind-safe palette for status indicators |

---

## 3. System Architecture Overview

### 3.1 Recommended Stack (Free / Open-Source Only)

We recommend a **JavaScript/TypeScript-first frontend** (since real-time 3D + physics in-browser is a solved, mature space in JS) paired with a **Python backend** for heavier, non-real-time geometry processing (mass properties, mesh repair, STL parsing at scale) where Python's scientific/geometry ecosystem is stronger.

```
┌──────────────────────────────────────────────────────────────────┐
│                         BROWSER (Client)                         │
│                                                                    │
│  ┌────────────┐   ┌────────────────┐   ┌────────────────────┐    │
│  │ React UI   │   │ Three.js       │   │ Rapier.js (WASM)    │    │
│  │ (panels,   │◄─►│ (rendering,    │◄─►│ (physics: rigid     │    │
│  │ controls)  │   │ scene graph,   │   │ bodies, joints,     │    │
│  │            │   │ camera, gizmos)│   │ collisions)         │    │
│  └────────────┘   └────────────────┘   └────────────────────┘    │
│         ▲                                                          │
│         │  REST / WebSocket                                       │
└─────────┼──────────────────────────────────────────────────────────┘
          ▼
┌──────────────────────────────────────────────────────────────────┐
│                     BACKEND (Python / FastAPI)                    │
│                                                                    │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │ STL Parsing &   │  │ Geometry /     │  │ Project Persistence │  │
│  │ Mesh Repair     │  │ Mass Property  │  │ (Postgres + S3/     │  │
│  │ (numpy-stl,     │  │ Engine         │  │  object storage for │  │
│  │  trimesh)       │  │ (trimesh,      │  │  STL blobs)         │  │
│  │                 │  │  PythonOCC)    │  │                     │  │
│  └────────────────┘  └────────────────┘  └────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Why This Split
- **Rendering + physics in the browser (Three.js + Rapier.js/WASM):** Motion simulation needs to feel instantaneous and interactive — round-tripping every physics tick to a server would introduce unacceptable latency. Rapier compiles to WebAssembly and runs comfortably at 60fps for dozens of rigid bodies, entirely client-side.
- **Heavy geometry math on the backend (Python):** Computing accurate mass properties, repairing malformed meshes, and validating watertightness benefit from Python's mature computational-geometry ecosystem (trimesh, PythonOCC), and these are one-off operations (run on import/measurement request), not per-frame — so server latency is a non-issue.
- **No paid engine licensing:** Every library recommended below is open-source (MIT/Apache/BSD) and free for commercial use — no Unity/Unreal/CAD-SDK licensing fees.

### 3.3 Core Technology Choices

| Layer | Technology | Purpose |
|---|---|---|
| 3D Rendering | **Three.js** | WebGL scene graph, mesh rendering, camera controls, lighting |
| Physics Engine | **Rapier.js** (via `@dimforge/rapier3d`) | Rigid-body dynamics, joint constraints (revolute, prismatic, fixed), collision detection — compiled from Rust to WASM for near-native speed |
| Frontend Framework | **React** + TypeScript | Component-based UI: panels, forms, control surfaces |
| 3D UI helpers | **three-mesh-bvh**, `@react-three/fiber`, `@react-three/drei` | Fast raycasting/picking on large meshes; React bindings for Three.js scenes; ready-made gizmos, grid helpers, orbit controls |
| STL Parsing (client) | **Three.js STLLoader** | Fast in-browser STL → BufferGeometry parsing for immediate preview |
| STL Parsing (server, heavy ops) | **numpy-stl**, **trimesh** | Batch/validated parsing, repair, and analysis independent of browser memory limits |
| Advanced Geometry / Mass Props | **trimesh**, **PythonOCC (OCCT bindings)** | Volume, surface area, center of mass, moment of inertia, boolean checks, mesh repair |
| Backend API | **FastAPI** (Python) | REST endpoints for upload, geometry analysis, project save/load |
| Realtime channel | **WebSocket** (via FastAPI) | Optional live collaboration / server-assisted validation without blocking simulation loop |
| Database | **PostgreSQL** | Project metadata, joint graphs, user accounts |
| File/Blob Storage | **S3-compatible storage (e.g., MinIO for self-host, or AWS S3)** | Storing uploaded STL binaries |
| State Management | **Zustand** | Lightweight, fast client-side state store for scene/assembly state |
| Node graph UI | **React Flow** | Renders the component-connection dependency graph (FR-3.7) |

### 3.4 System Flow (Import → Simulate)

1. **Upload:** User drags an STL into the browser → parsed client-side immediately via `STLLoader` for instant visual feedback, and asynchronously uploaded to the backend for validation/repair.
2. **Validation:** Backend (`trimesh`) checks watertightness, normal consistency; returns warnings/repaired mesh if needed.
3. **Measurement:** All measurement tools (FR-2.x) operate directly on the client-side mesh (raycasting via `three-mesh-bvh`) for instant response; volume/mass-property calculations for complex meshes are delegated to the backend (`trimesh`) and cached.
4. **Assembly:** User positions parts and defines joints. Each joint is stored as an edge in an in-memory **dependency graph** (adjacency list of `{componentA, componentB, jointType, params}`).
5. **Compile to physics world:** On pressing "Play," the dependency graph + component transforms + mass properties are translated into Rapier rigid bodies and joint constraints (`RevoluteJoint`, `PrismaticJoint`, `FixedJoint`) inside a single Rapier `World`.
6. **Simulate:** Each animation frame: (a) step the Rapier world at a fixed timestep (e.g. 1/60s, using a fixed-timestep accumulator decoupled from render rate), (b) read back updated transforms for every rigid body, (c) apply them to the corresponding Three.js meshes.
7. **Driver injection:** Driver components have their target velocity (angular or linear) set directly on their Rapier joint motor each tick, based on user-set RPM/speed — Rapier's constraint solver then propagates resultant motion to all connected bodies automatically, since joints are solved jointly, not independently.
8. **Persistence:** Save/export writes the scene graph + joint graph + transforms to Postgres/S3 as a project file; STL geometry itself is referenced by ID, not duplicated.

### 3.5 Why Rapier Specifically (vs. Cannon.js / Ammo.js)
- **Rapier.js**: Modern (Rust→WASM), actively maintained, purpose-built joint types (revolute, prismatic, fixed, spherical) with motor/limit support out of the box — closest match to our FR-3.5/FR-5.1 requirements. Recommended primary choice.
- **Cannon-es**: Pure JS fork of Cannon.js, simpler and lighter but fewer joint types and less actively maintained — viable fallback if WASM tooling becomes a blocker.
- **Ammo.js** (Bullet compiled to WASM): Very capable (same engine used in some AAA contexts) but heavier, older JS bindings, steeper integration curve. Only recommended if a feature Rapier lacks becomes essential later (e.g. complex soft-body).

**Recommendation: Rapier.js as primary physics engine.**

---

## 4. Feature Prioritization (MoSCoW)

### Must Have (MVP — required to ship a usable v1)
- STL import/export, multi-component workspace (FR-1.1–1.3)
- Bounding box, point-to-point, diameter, volume, surface area measurement (FR-2.1–2.6, 2.8)
- Free transform with snapping and alignment (FR-3.1–3.3)
- Joint definition: Rigid, Revolute, Prismatic (FR-3.4, FR-3.5)
- Connection graph view (FR-3.7)
- Single-driver rotational and linear motion control (FR-4.1–4.3, FR-4.6, FR-4.9)
- Cascading propagation through the dependency graph (FR-4.4, FR-5.1–5.2)
- Basic 3-pane UX layout, simulation control panel, plain-language labels (FR-6.1, 6.2, 6.6)
- Project save/load (FR-1.7)

### Should Have (fast-follow, high value)
- Mass properties from user-input density (FR-2.7)
- Gear, cylindrical, cam-follower, belt/pulley joint types (FR-3.5b)
- Joint travel limits (FR-3.6)
- Multi-driver support (FR-4.5)
- Collision detection/response (FR-3.8, FR-4.8)
- Mesh auto-repair (FR-1.5)
- Undo/redo (FR-6.4)
- Guided onboarding tutorial (FR-6.3)

### Could Have (nice-to-have, later roadmap)
- LOD auto-decimation for huge meshes (FR-1.6)
- Cycle/conflict detection warnings (FR-5.3)
- Real-time collaboration (multi-user editing via WebSocket)
- Export motion data to CSV/JSON for external analysis (FR-1.8, second half)
- VR/AR viewing mode
- Command-palette-style natural language instruction parsing beyond simple forms (advanced version of FR-4.9)

### Won't Have (explicitly out of scope for now)
- Full parametric CAD editing (this is a viewer/simulator, not a CAD modeling tool)
- FEA (finite element analysis) / stress simulation
- Native desktop application (browser-only for v1)
- Support for non-mesh formats requiring full B-rep CAD kernels (STEP/IGES) — STL/mesh-based only for v1
- Multi-body soft-body / cloth / fluid simulation

---

## 5. User Flow & Interaction Design

### 5.1 Flow A — First-Time User: Import → Measure
1. User lands on empty workspace; sees a large drop-zone with the prompt "Drag STL files here or click to browse."
2. User drops two STL files (e.g., `gear_a.stl`, `gear_b.stl`).
3. Each appears in the **Component Tray** (left panel) with a thumbnail and auto-generated name; both are placed at the scene origin by default, slightly offset to avoid full overlap.
4. User clicks `gear_a.stl` in the tray → it highlights in the viewport; the **Property Panel** (right) shows bounding-box dimensions automatically.
5. User selects the "Diameter" measurement tool, clicks the gear's circular bore edge → diameter/radius/center auto-computed and labeled in the viewport.
6. User repeats for `gear_b.stl`.

### 5.2 Flow B — Assembly: Positioning & Joint Creation
1. User drags `gear_b.stl` in the viewport using the translate gizmo; as it nears `gear_a.stl`'s shaft axis, a snap guide highlights and it snaps face-to-face.
2. User right-clicks `gear_a.stl` → "Add Connection" → selects `gear_b.stl` as the target.
3. A joint-type dropdown appears: Rigid / Revolute / Prismatic / Gear / Cam / Belt. User selects **Gear**.
4. User is prompted to confirm each gear's pitch diameter (pre-filled from the earlier measurement step) — the system auto-computes the gear ratio.
5. A new edge appears in the **Connection Graph** panel linking `gear_a` ↔ `gear_b` labeled "Gear (ratio 2:1)".

### 5.3 Flow C — Motion Simulation
1. User right-clicks `gear_a.stl` → "Set as Driver."
2. A driver control card appears in the bottom **Simulation Panel**: axis selector (auto-suggested from the shaft geometry), speed input (RPM), direction toggle (CW/CCW).
3. User types `30` into the RPM field, leaves direction as clockwise, and clicks **Play**.
4. `gear_a` begins rotating at 30 RPM in the viewport; `gear_b`, connected via the Gear joint, automatically counter-rotates at 60 RPM (2:1 ratio) — with a live numeric overlay showing both current angular speeds.
5. User drags the global speed slider to 0.25× to inspect the mesh interaction in slow motion, then clicks **Pause** and **Reset**.

### 5.4 Flow D — Non-Technical Reviewer
1. A reviewer opens a shared project link (read-only mode).
2. They see the pre-built assembly and a simplified control bar with just Play/Pause and the existing driver presets (no ability to edit joints/geometry).
3. They click Play and watch the mechanism operate exactly as the engineer configured it — no jargon, no setup required.

---

## 6. Motion Simulation Specifications

### 6.1 Motion Types

| Motion Type | Parameters | Notes |
|---|---|---|
| **Rotational** | axis (vector or auto-detected from cylindrical geometry), speed (RPM ↔ rad/s conversion), direction (CW/CCW relative to axis), optional torque cap | Axis can be auto-suggested from a detected bore/cylindrical feature, or manually drawn by the user |
| **Linear** | axis (vector), speed (mm/s or m/s), direction (+/-), travel limits (min/max position along axis) | Travel limits define a prismatic joint's stop points |

### 6.2 Joint Behavior Rules

| Joint | Degrees of Freedom | Propagation Rule |
|---|---|---|
| Rigid/Fixed | 0 | Child moves identically (as a rigid group) with the parent — no relative motion |
| Revolute | 1 (rotation about a shared axis) | Child rotates about the shared axis; if the parent is the driver, child's angular velocity = parent's, unless overridden by a coupling (e.g., gear) further down the graph |
| Prismatic | 1 (translation along a shared axis) | Child translates along the shared axis, bounded by travel limits |
| Gear | Coupled rotation | Angular velocity ratio = (driver pitch radius / driven pitch radius); direction inverts for external gear pairs, matches for internal/planetary pairs |
| Cam-Follower | Profile-driven translation | Follower's linear position is a function of the cam's rotation angle, sampled from the cam profile geometry |
| Belt/Pulley | Coupled rotation, same direction | Angular velocity ratio = (driver pulley radius / driven pulley radius); rotation direction is preserved (unlike gears) |

### 6.3 Cascading Propagation Algorithm (Conceptual)
1. Build a directed dependency graph where the driver is the root.
2. On each physics tick, the physics engine (Rapier) solves the **entire constraint system simultaneously** (not a manual top-down cascade) — this is critical for physical correctness, since real mechanisms don't compute sequentially, they settle into equilibrium jointly.
3. The driver's motor constraint sets a **target velocity** on its joint; Rapier's constraint solver (an iterative impulse-based solver) computes the resulting velocities/positions of every other connected rigid body such that all joint constraints remain satisfied within the solver's iteration budget.
4. For coupled ratios not natively expressed as a single Rapier joint (e.g., gear ratio), a custom constraint is added: `angularVelocity_B = -ratio × angularVelocity_A`, implemented either via Rapier's generic joint API or a manual velocity-sync applied post-solve each tick.

### 6.4 Control Semantics ("Instruction-Based Controls")
- Every instruction maps to a structured object, e.g.:
  ```json
  {
    "component": "Gear_A",
    "motionType": "rotational",
    "axis": [0, 1, 0],
    "speed": 30,
    "speedUnit": "RPM",
    "direction": "CW"
  }
  ```
- The UI form (dropdowns + numeric fields) is the v1 "instruction" interface — a natural-language parser mapping free text to this same structured object is a Could-Have enhancement layered on top later, not a replacement for it.

### 6.5 Simulation Loop Timing
- Physics stepped at a **fixed timestep** (default 1/60s) using an accumulator pattern, decoupled from the browser's variable render framerate, to keep motion physically stable regardless of device performance.
- Render loop reads the latest interpolated physics state each animation frame (`requestAnimationFrame`) for smooth visuals even if physics steps run at a different cadence.

---

## 7. Technical Constraints & Assumptions

### 7.1 Constraints
- **STL has no units or material data.** The platform must let users explicitly declare units (mm/cm/m/in) and material density per component; mass/inertia calculations are only as accurate as this user input.
- **STL is mesh-only geometry** (no parametric features, no exact circular/cylindrical primitives). Diameter/axis detection on holes and shafts is therefore a *best-fit approximation* over the mesh, not an exact CAD read — accuracy depends on mesh resolution.
- **Watertightness is required** for volume/mass computations; non-manifold or open meshes will produce warnings and may need repair before those specific measurements are available.
- **Browser compute limits.** Client-side physics (WASM) performance scales with the number of rigid bodies and constraint complexity; very large assemblies (100+ moving parts) may need render/physics LOD strategies (reduced collision mesh complexity) to stay real-time.
- **No paid CAD-kernel dependency.** Because this is explicitly scoped to free/open-source tooling, true B-rep exactness (as in STEP/IGES-based tools using commercial kernels like Parasolid) is out of scope; all geometry is mesh-based (STL/OBJ/glTF).

### 7.2 Assumptions
- Users will primarily work with STL files that are already reasonably clean (originating from common CAD/slicer export), though basic repair tooling should handle minor defects.
- Initial version targets **rigid-body kinematics only** — no deformation, no soft materials, no fluid/thermal simulation.
- Assemblies will typically be small-to-medium in part count (tens, not hundreds, for the browser-only real-time target); larger assemblies are a future scalability item, potentially requiring server-side physics offload.
- Users have a modern browser with WebGL2 and WebAssembly support (Chrome, Firefox, Edge, Safari — recent versions).
- Single-user editing is assumed for v1; multi-user real-time collaboration is a future (Could-Have) capability, not required for MVP.

---

## 8. Appendix: Full Dependency Reference

### 8.1 Frontend Dependencies

| Library | Purpose in This Project |
|---|---|
| **three** (Three.js) | Core WebGL rendering engine — scene graph, cameras, lighting, materials, mesh rendering of every imported STL |
| **@dimforge/rapier3d-compat** (Rapier.js) | Physics engine (WASM) — rigid bodies, joint constraints (revolute/prismatic/fixed), collision detection/response, the engine that makes cascading motion physically correct |
| **react** / **react-dom** | UI framework for all panels: component tray, property panel, connection graph, simulation controls |
| **typescript** | Type safety across the geometry/physics/UI boundary, reducing runtime errors in complex state (joints, transforms) |
| **@react-three/fiber** | React renderer for Three.js — lets 3D scene objects be declared as React components, syncing UI state with the 3D scene cleanly |
| **@react-three/drei** | Prebuilt helpers on top of fiber — orbit controls, transform gizmos, grid helpers, environment lighting — saves reimplementing common 3D UI primitives |
| **three-mesh-bvh** | Accelerated raycasting/collision queries against high-poly meshes — needed for responsive click-to-measure and click-to-select on dense STL meshes |
| **STLLoader** (part of three/examples) | Parses `.stl` binary/ASCII files into Three.js `BufferGeometry` directly in-browser for instant preview on drop |
| **zustand** | Lightweight global state store — holds the live scene/assembly/joint-graph state that both the 3D viewport and UI panels read from |
| **react-flow** (`reactflow`) | Renders the interactive node-graph view of component connections/dependencies (FR-3.7) |
| **immer** (via zustand middleware) | Simplifies immutable state updates for the potentially deep assembly/joint state tree |
| **zod** | Runtime schema validation for the "instruction" objects (FR-4.9) and project save/load files, preventing malformed data from reaching the physics engine |

### 8.2 Backend Dependencies (Python)

| Library | Purpose in This Project |
|---|---|
| **fastapi** | Backend web framework — REST endpoints for upload, geometry analysis, project persistence; async-friendly and fast |
| **uvicorn** | ASGI server to run the FastAPI application |
| **numpy-stl** | Fast, simple STL parsing/writing server-side; used for lightweight validation and batch operations |
| **trimesh** | The core geometry-analysis library — computes volume, surface area, center of mass, moment of inertia, watertightness checks, and performs mesh repair (hole filling, normal fixing) |
| **pythonocc-core** (PythonOCC, OCCT bindings) | Optional, heavier-duty geometry kernel for advanced boolean/interference checks and more exact circular-feature fitting beyond what mesh-only analysis (trimesh) can offer |
| **numpy** | Underlying numerical array operations for all geometry math (vertex arrays, transforms, linear algebra) |
| **scipy** | Spatial algorithms (e.g., convex hulls, nearest-neighbor queries) supporting measurement and collision pre-checks |
| **sqlalchemy** | ORM for interacting with the PostgreSQL project/metadata database |
| **pydantic** | Request/response data validation for the FastAPI endpoints (pairs naturally with FastAPI) |
| **boto3** (or **minio** client) | Uploading/retrieving STL blobs to/from S3-compatible object storage |
| **python-multipart** | Required by FastAPI to handle multipart file uploads (STL files) |

### 8.3 Infrastructure

| Component | Purpose |
|---|---|
| **PostgreSQL** | Stores project metadata: component list, transforms, joint graph, user/project ownership |
| **S3-compatible object storage** (AWS S3 or self-hosted MinIO) | Stores raw STL binary files, referenced by ID from Postgres records — avoids bloating the database with large binary blobs |
| **Docker** | Containerizes the FastAPI backend and its Python geometry dependencies for consistent deployment |
| **Nginx** (or a CDN) | Serves the static frontend build and proxies API requests in production |

---

*End of Document — Ready for engineering handoff and sprint planning.*
