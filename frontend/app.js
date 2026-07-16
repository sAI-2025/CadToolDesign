import * as THREE from "three";
import { OrbitControls } from "/vendor/three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "/vendor/three/examples/jsm/loaders/STLLoader.js";
import { OBB } from "/vendor/three/examples/jsm/math/OBB.js";

const AXIS_MODES = [
  { id: "x", label: "Set to X-Axis", type: "axis", axes: ["x"] },
  { id: "y", label: "Set to Y-Axis", type: "axis", axes: ["y"] },
  { id: "z", label: "Set to Z-Axis", type: "axis", axes: ["z"] },
  { id: "xy", label: "Set to X-Y Plane", type: "plane", axes: ["x", "y"] },
  { id: "yz", label: "Set to Y-Z Plane", type: "plane", axes: ["y", "z"] },
  { id: "zx", label: "Set to Z-X Plane", type: "plane", axes: ["z", "x"] },
  { id: "xyz", label: "Set to XYZ (3D)", type: "all", axes: ["x", "y", "z"] },
];

const NAV_PRESETS = [
  { key: "front", label: "F", type: "face", top: 46, left: 46, vector: [0, 0, 1] },
  { key: "back", label: "B", type: "face", top: 88, left: 88, vector: [0, 0, -1] },
  { key: "left", label: "L", type: "face", top: 46, left: 4, vector: [-1, 0, 0] },
  { key: "right", label: "R", type: "face", top: 46, left: 88, vector: [1, 0, 0] },
  { key: "top", label: "T", type: "face", top: 4, left: 46, vector: [0, 1, 0] },
  { key: "bottom", label: "Bt", type: "face", top: 88, left: 46, vector: [0, -1, 0] },
  { key: "iso-tr", label: "Iso", type: "hotspot", top: 4, left: 88, vector: [1, 1, 1] },
  { key: "iso-tl", label: "Iso", type: "hotspot", top: 4, left: 4, vector: [-1, 1, 1] },
  { key: "iso-bl", label: "Iso", type: "hotspot", top: 88, left: 4, vector: [-1, -1, 1] },
];

const projectList = document.querySelector("#projectList");
const projectCount = document.querySelector("#projectCount");
const projectSectionToggle = document.querySelector("#projectSectionToggle");
const deleteProjectButton = document.querySelector("#deleteProjectButton");
const workspaceShell = document.querySelector("#workspaceShell");
const leftSidebarToggle = document.querySelector("#leftSidebarToggle");
const rightSidebarToggle = document.querySelector("#rightSidebarToggle");
const componentList = document.querySelector("#componentList");
const componentCount = document.querySelector("#componentCount");
const projectForm = document.querySelector("#projectForm");
const refreshProjects = document.querySelector("#refreshProjects");
const inspectorTitle = document.querySelector("#inspectorTitle");
const projectDetails = document.querySelector("#projectDetails");
const databaseStatus = document.querySelector("#databaseStatus");
const storageStatus = document.querySelector("#storageStatus");
const importUnit = document.querySelector("#importUnit");
const pickFilesButton = document.querySelector("#pickFilesButton");
const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const importWarnings = document.querySelector("#importWarnings");
const viewportCanvas = document.querySelector("#viewportCanvas");
const viewportEmpty = document.querySelector("#viewportEmpty");
const settingsToggle = document.querySelector("#settingsToggle");
const settingsPanel = document.querySelector("#settingsPanel");
const contextMenu = document.querySelector("#contextMenu");
const navCube = document.querySelector("#navCube");
const selectToolButton = document.querySelector("#selectToolButton");
const moveToolButton = document.querySelector("#moveToolButton");
const viewportEmptyTitle = document.querySelector("#viewportEmptyTitle");
const viewportEmptyDetail = document.querySelector("#viewportEmptyDetail");
const viewportLoading = document.querySelector("#viewportLoading");
const viewportLoadingDetail = document.querySelector("#viewportLoadingDetail");
const viewportLoadingBar = document.querySelector("#viewportLoadingBar");

const savedPanelState = readPanelState();

const state = {
  activeProjectId: window.localStorage.getItem("cadtool.activeProjectId"),
  activeProject: null,
  selectedComponentId: null,
  latestImportWarnings: [],
  axisMode: "xyz",
  axisModeLocked: false,
  showAxisMarkings: true,
  projectListExpanded: true,
  leftSidebarOpen: savedPanelState.leftSidebarOpen !== false,
  rightSidebarOpen: savedPanelState.rightSidebarOpen !== false,
  settingsOpen: false,
  objectToolMode: null,
  contextComponentId: null,
  viewportTool: "select",
  drag: null,
  physicsMessage: "Ready",
  rulerStep: null,
};

const sceneState = {
  axisGuides: null,
  camera: null,
  controls: null,
  grid: null,
  loader: new STLLoader(),
  meshEntries: new Map(),
  renderer: null,
  raycaster: new THREE.Raycaster(),
  scene: new THREE.Scene(),
};

// --- Undo System (SOLID: Single Responsibility Principle) ---
class PositionUndoManager {
  constructor(maxHistory = 50) {
    this.history = [];
    this.maxHistory = maxHistory;
  }

  recordPosition(componentId, previousPosition) {
    this.history.push({
      componentId,
      position: { ...previousPosition }
    });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  popLastPosition(componentId) {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].componentId === componentId) {
        const entry = this.history.splice(i, 1)[0];
        return entry.position;
      }
    }
    return null;
  }
}

const positionUndoManager = new PositionUndoManager();

initializeViewer();
renderNavCube();
bindEvents();
applyProjectListVisibility();
applySidebarVisibility();
loadApp().catch(showError);

async function loadApp() {
  await requestJson("/api/health");
  await loadProjects();
}

function bindEvents() {
  projectForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(projectForm);
    const payload = {
      name: formData.get("name"),
      unit: formData.get("unit"),
    };

    const { project } = await requestJson("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    projectForm.reset();
    state.activeProjectId = project.id;
    window.localStorage.setItem("cadtool.activeProjectId", project.id);
    await loadProjects();
  });

  refreshProjects.addEventListener("click", () => {
    loadProjects().catch(showError);
  });

  projectSectionToggle.addEventListener("click", () => {
    state.projectListExpanded = !state.projectListExpanded;
    applyProjectListVisibility();
  });

  leftSidebarToggle.addEventListener("click", () => {
    state.leftSidebarOpen = !state.leftSidebarOpen;
    applySidebarVisibility();
  });

  rightSidebarToggle.addEventListener("click", () => {
    state.rightSidebarOpen = !state.rightSidebarOpen;
    applySidebarVisibility();
  });

  deleteProjectButton.addEventListener("click", () => {
    deleteActiveProject().catch(showError);
  });

  pickFilesButton.addEventListener("click", () => {
    if (!state.activeProject) {
      showError(new Error("Select or create a project before importing STL files."));
      return;
    }
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = "";
    if (files.length > 0) {
      await importFiles(files);
    }
  });

  dropZone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });

  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length > 0) {
      await importFiles(files);
    }
  });

  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pickFilesButton.click();
    }
  });

  viewportCanvas.addEventListener("pointerdown", onViewportPointerDown);
  viewportCanvas.addEventListener("pointermove", onViewportPointerMove);
  viewportCanvas.addEventListener("pointerup", onViewportPointerUp);
  viewportCanvas.addEventListener("pointercancel", onViewportPointerUp);
  viewportCanvas.addEventListener("contextmenu", onViewportContextMenu);
  window.addEventListener("resize", onResize);
  document.addEventListener("click", onDocumentClick);

  window.addEventListener("keydown", async (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      const component = getSelectedComponent();
      if (!component || component.locked) return;

      const previousPosition = positionUndoManager.popLastPosition(component.id);
      if (previousPosition) {
        const newTransform = structuredClone(component.transform);
        newTransform.position = previousPosition;
        try {
          await updateComponentState(component.id, { transform: newTransform });
        } catch (err) {
          showError(err);
        }
      }
    }
  });

  settingsToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    state.settingsOpen = !state.settingsOpen;
    renderSettingsPanel();
  });

  selectToolButton.addEventListener("click", () => setViewportTool("select"));
  moveToolButton.addEventListener("click", () => setViewportTool("move"));
}

async function requestJson(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...options, headers });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

async function requestBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    let message = "Request failed.";
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  return response.arrayBuffer();
}

async function loadProjects() {
  const [{ projects }, storage] = await Promise.all([
    requestJson("/api/projects"),
    requestJson("/api/storage"),
  ]);

  databaseStatus.textContent = storage.databasePath;
  storageStatus.textContent = storage.projectsDir;
  renderProjects(projects);

  if (state.activeProjectId && projects.some((project) => project.id === state.activeProjectId)) {
    await selectProject(state.activeProjectId, false);
    return;
  }

  if (projects.length > 0) {
    await selectProject(projects[0].id, false);
    return;
  }

  await setActiveProject(null);
}

async function selectProject(projectId, keepWarningState = true) {
  state.activeProjectId = projectId;
  window.localStorage.setItem("cadtool.activeProjectId", projectId);

  if (!keepWarningState) {
    state.latestImportWarnings = [];
  }

  const { project } = await requestJson(`/api/projects/${projectId}`);
  await setActiveProject(project);
  renderProjects(await getProjectsSnapshot());
}

async function getProjectsSnapshot() {
  const { projects } = await requestJson("/api/projects");
  return projects;
}

async function setActiveProject(project) {
  state.activeProject = project;
  state.selectedComponentId = project?.components[0]?.id || null;
  deleteProjectButton.disabled = !project;

  if (project) {
    importUnit.value = project.unit;
    renderProjectDetails(project);
    renderComponentList(project.components);
    renderImportWarnings(state.latestImportWarnings);
    updateAxisGuides();
    await loadProjectIntoScene(project);
    renderSettingsPanel();
    return;
  }

  setViewportMessage("No project selected", "Create or select a project.");
  hideViewportLoading();
  inspectorTitle.textContent = "No project selected";
  componentCount.textContent = "0";
  componentList.replaceChildren(createEmptyRow("Create a project to start importing STL files."));
  importWarnings.replaceChildren();
  projectDetails.innerHTML = `
    <div>
      <dt>Database</dt>
      <dd>${escapeHtml(databaseStatus.textContent)}</dd>
    </div>
    <div>
      <dt>Storage</dt>
      <dd>${escapeHtml(storageStatus.textContent)}</dd>
    </div>
  `;
  clearSceneMeshes();
  viewportEmpty.hidden = false;
  renderSettingsPanel();
}

function renderProjects(projects) {
  projectCount.textContent = String(projects.length);
  projectList.replaceChildren();

  if (projects.length === 0) {
    projectList.append(createEmptyRow("No local projects yet."));
    applyProjectListVisibility();
    return;
  }

  for (const project of projects) {
    const row = document.createElement("div");
    row.className = `project-row${project.id === state.activeProjectId ? " active" : ""}`;

    const top = document.createElement("div");
    top.className = "project-row-top";

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "project-select";
    selectButton.innerHTML = `<strong>${escapeHtml(project.name)}</strong>`;
    selectButton.addEventListener("click", () => {
      selectProject(project.id).catch(showError);
    });

    const badge = document.createElement("span");
    badge.className = "component-status";
    badge.textContent = project.unit;

    top.append(selectButton, badge);

    const info = document.createElement("span");
    info.textContent = `Updated ${formatDate(project.updated_at)}`;

    row.append(top, info);
    projectList.append(row);
  }

  applyProjectListVisibility();
}

function renderComponentList(components) {
  componentCount.textContent = String(components.length);
  componentList.replaceChildren();

  if (components.length === 0) {
    componentList.append(createEmptyRow("No STL files imported yet."));
    return;
  }

  for (const component of components) {
    const row = document.createElement("div");
    row.className = `project-row component-row${component.id === state.selectedComponentId ? " active" : ""}`;

    const visibility = document.createElement("input");
    visibility.className = "component-checkbox";
    visibility.type = "checkbox";
    visibility.checked = component.visible;
    visibility.title = component.visible ? "Hide component" : "Show component";
    visibility.addEventListener("change", (event) => {
      event.stopPropagation();
      updateComponentVisibility(component.id, visibility.checked).catch(showError);
    });

    const metaButton = document.createElement("button");
    metaButton.type = "button";
    metaButton.className = "component-meta";
    metaButton.innerHTML = `
      <strong>${escapeHtml(component.name)}</strong>
      <span>${escapeHtml(component.source_filename)} | ${escapeHtml(component.unit)} | ${escapeHtml(component.fileSizeLabel)}</span>
      <span class="component-status${component.validation_status === "warning" ? " warning" : ""}">
        ${escapeHtml(component.validation_status)} | ${escapeHtml(component.mesh_format)}
      </span>
    `;
    metaButton.addEventListener("click", () => {
      state.selectedComponentId = component.id;
      renderComponentList(state.activeProject.components);
      renderProjectDetails(state.activeProject);
      renderSettingsPanel();
      highlightSelectedMesh();
    });

    const lockBadge = document.createElement("span");
    lockBadge.className = `project-lock${component.locked ? "" : " free"}`;
    lockBadge.textContent = component.locked ? "Constant" : "Editable";

    row.append(visibility, metaButton, lockBadge);
    componentList.append(row);
  }
}

function renderProjectDetails(project) {
  const component = getSelectedComponent();
  inspectorTitle.textContent = component ? component.name : project.name;

  const projectUnitOptions = ["mm", "cm", "m", "in"]
    .map((unit) => `<option value="${unit}"${unit === project.unit ? " selected" : ""}>${unit}</option>`)
    .join("");

  const details = [
    `
      <div>
        <dt>Project ID</dt>
        <dd>${escapeHtml(project.id)}</dd>
      </div>
    `,
    `
      <div>
        <dt>Project Unit</dt>
        <dd class="unit-inline">
          <select id="projectUnitEditor">${projectUnitOptions}</select>
          <span>${project.components.length} components</span>
        </dd>
      </div>
    `,
    `
      <div>
        <dt>Storage Path</dt>
        <dd>${escapeHtml(project.storagePath)}</dd>
      </div>
    `,
  ];

  if (component) {
    const warningText = component.validationWarnings.length > 0
      ? escapeHtml(component.validationWarnings.join(" | "))
      : "No warnings";

    details.push(`
      <div>
        <dt>Source File</dt>
        <dd>${escapeHtml(component.source_filename)}</dd>
      </div>
    `);
    details.push(`
      <div>
        <dt>Transform</dt>
        <dd>
          P(${formatAxisValue(component.transform.position.x)}, ${formatAxisValue(component.transform.position.y)}, ${formatAxisValue(component.transform.position.z)}) |
          R(${formatAxisValue(component.transform.rotation.x)}, ${formatAxisValue(component.transform.rotation.y)}, ${formatAxisValue(component.transform.rotation.z)})
        </dd>
      </div>
    `);
    details.push(`
      <div>
        <dt>State</dt>
        <dd>${component.locked ? "Constant" : "Editable"} | ${escapeHtml(component.validation_status)} | ${escapeHtml(component.mesh_format)}</dd>
      </div>
    `);
    details.push(`
      <div>
        <dt>Physics</dt>
        <dd>${escapeHtml(state.physicsMessage)}</dd>
      </div>
    `);
    details.push(`
      <div>
        <dt>Warnings</dt>
        <dd>${warningText}</dd>
      </div>
    `);
  }

  projectDetails.innerHTML = details.join("");
  projectDetails.querySelector("#projectUnitEditor")?.addEventListener("change", async (event) => {
    await updateProjectUnit(event.target.value);
  });
}

function renderImportWarnings(components) {
  importWarnings.replaceChildren();

  const withWarnings = components.filter((component) => component.validationWarnings.length > 0);
  if (withWarnings.length === 0) {
    return;
  }

  for (const component of withWarnings) {
    const card = document.createElement("div");
    card.className = "warning-card";
    card.innerHTML = `
      <strong>${escapeHtml(component.source_filename)}</strong>
      <span>${escapeHtml(component.validationWarnings.join(" | "))}</span>
    `;
    importWarnings.append(card);
  }
}

function renderSettingsPanel() {
  settingsPanel.classList.toggle("hidden", !state.settingsOpen);
  if (!state.settingsOpen) {
    return;
  }

  const selectedComponent = getSelectedComponent();

  const axisButtons = AXIS_MODES.map((mode) => {
    const disabled = state.axisModeLocked && mode.id !== state.axisMode;
    return `
      <button
        class="axis-button${mode.id === state.axisMode ? " active" : ""}"
        data-axis-mode="${mode.id}"
        type="button"
        ${disabled ? "disabled" : ""}
      >${escapeHtml(mode.label)}</button>
    `;
  }).join("");

  const objectBlock = selectedComponent
    ? `
      <div class="panel-block">
        <div class="section-title">
          <h3>Selected Object</h3>
          <span>${escapeHtml(selectedComponent.name)}</span>
        </div>
        <div class="switch-row">
          <span>Set Object as Constant</span>
          ${renderSwitch("componentLockToggle", selectedComponent.locked, "Toggle object constant state")}
        </div>
        <div class="object-actions">
          <button id="openMoveTool" class="menu-button" type="button" ${selectedComponent.locked ? "disabled" : ""}>Move Object</button>
          <button id="openRotateTool" class="menu-button" type="button" ${selectedComponent.locked ? "disabled" : ""}>Rotate Object</button>
        </div>
        ${renderTransformEditor(selectedComponent)}
      </div>
    `
    : `
      <div class="panel-block">
        <h3>Selected Object</h3>
        <div class="panel-note">Select an STL component to edit lock, move, or rotation settings.</div>
      </div>
    `;

  settingsPanel.innerHTML = `
    <div class="panel-block">
      <div class="section-title">
        <h3>Axis Controls</h3>
        <span>${escapeHtml(describeAxisMode(state.axisMode))}</span>
      </div>
      <div class="axis-grid">${axisButtons}</div>
      <div class="switch-row">
        <span>Set Axis as Constant</span>
        ${renderSwitch("axisLockToggle", state.axisModeLocked, "Toggle axis lock")}
      </div>
      <div class="switch-row">
        <span>Show axis scale markings</span>
        ${renderSwitch("axisMarkingsToggle", state.showAxisMarkings, "Toggle axis markings")}
      </div>
    </div>
    ${objectBlock}
  `;

  settingsPanel.querySelectorAll("[data-axis-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setAxisMode(button.dataset.axisMode);
    });
  });

  settingsPanel.querySelector("#axisLockToggle")?.addEventListener("change", (event) => {
    state.axisModeLocked = event.target.checked;
    
    if (sceneState.controls) {
      sceneState.controls.enableRotate = !state.axisModeLocked;
    }
    
    if (state.axisModeLocked) {
      if (state.axisMode === "xy" || state.axisMode === "z") {
        orientCameraToVector([0, 0, 1]);
      } else if (state.axisMode === "yz" || state.axisMode === "x") {
        orientCameraToVector([1, 0, 0]);
      } else if (state.axisMode === "zx" || state.axisMode === "y") {
        orientCameraToVector([0, 1, 0]);
      }
    }

    renderSettingsPanel();
  });

  settingsPanel.querySelector("#axisMarkingsToggle")?.addEventListener("change", (event) => {
    state.showAxisMarkings = event.target.checked;
    updateAxisGuides();
    renderSettingsPanel();
  });

  settingsPanel.querySelector("#componentLockToggle")?.addEventListener("change", async (event) => {
    await updateComponentState(selectedComponent.id, { locked: event.target.checked });
  });

  settingsPanel.querySelector("#openMoveTool")?.addEventListener("click", () => {
    state.objectToolMode = "move";
    renderSettingsPanel();
  });

  settingsPanel.querySelector("#openRotateTool")?.addEventListener("click", () => {
    state.objectToolMode = "rotate";
    renderSettingsPanel();
  });

  settingsPanel.querySelector("#applyTransformButton")?.addEventListener("click", async () => {
    await submitTransformEditor();
  });

  settingsPanel.querySelector("#cancelTransformButton")?.addEventListener("click", () => {
    state.objectToolMode = null;
    renderSettingsPanel();
  });
}

function renderTransformEditor(component) {
  if (!state.objectToolMode) {
    return "";
  }

  const mode = state.objectToolMode;
  const allowed = getAllowedAxes(state.axisMode);
  const descriptor = mode === "move" ? "relative offset" : "relative angle";
  const unit = mode === "move" ? state.activeProject.unit : "deg";

  return `
    <div class="panel-block">
      <h3>${mode === "move" ? "Move Object" : "Rotate Object"}</h3>
      <div class="panel-note">Enter ${descriptor} values. Active constraint: ${escapeHtml(describeAxisMode(state.axisMode))}.</div>
      <div class="transform-grid">
        ${renderTransformInput("x", allowed.includes("x"), unit)}
        ${renderTransformInput("y", allowed.includes("y"), unit)}
        ${renderTransformInput("z", allowed.includes("z"), unit)}
      </div>
      <div class="form-actions">
        <button id="cancelTransformButton" type="button">Cancel</button>
        <button id="applyTransformButton" type="button" ${component.locked ? "disabled" : ""}>Apply</button>
      </div>
    </div>
  `;
}

function renderTransformInput(axis, enabled, unit) {
  return `
    <label>
      ${axis.toUpperCase()} (${escapeHtml(unit)})
      <input
        id="${state.objectToolMode}-${axis}"
        type="number"
        step="0.1"
        value="0"
        ${enabled ? "" : "disabled"}
      />
    </label>
  `;
}

function renderSwitch(id, checked, label) {
  return `
    <label class="switch" aria-label="${escapeHtml(label)}">
      <input id="${id}" type="checkbox" ${checked ? "checked" : ""} />
      <span class="switch-slider"></span>
    </label>
  `;
}

function renderNavCube() {
  navCube.replaceChildren();

  for (const preset of NAV_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = preset.type === "face" ? "face" : "hotspot";
    button.style.top = `${preset.top}px`;
    button.style.left = `${preset.left}px`;
    button.textContent = preset.label;
    button.title = preset.key;
    button.addEventListener("click", () => {
      orientCameraToVector(preset.vector);
    });
    navCube.append(button);
  }
}

async function updateProjectUnit(unit) {
  if (!state.activeProject) {
    return;
  }

  const { project } = await requestJson(`/api/projects/${state.activeProject.id}/unit`, {
    method: "POST",
    body: JSON.stringify({ unit }),
  });

  state.activeProject = project;
  importUnit.value = project.unit;
  renderProjectDetails(project);
  updateAxisGuides();
  renderProjects(await getProjectsSnapshot());
}

async function deleteActiveProject() {
  if (!state.activeProject) {
    return;
  }

  const projectId = state.activeProject.id;
  await requestJson(`/api/projects/${projectId}/delete`, { method: "POST" });

  if (state.activeProjectId === projectId) {
    state.activeProjectId = null;
    window.localStorage.removeItem("cadtool.activeProjectId");
  }

  state.settingsOpen = false;
  state.objectToolMode = null;
  hideContextMenu();
  await loadProjects();
}

async function importFiles(files) {
  if (!state.activeProject) {
    throw new Error("Select or create a project before importing STL files.");
  }

  const importedComponents = [];
  setViewportLoading(0, files.length);

  for (const [index, file] of files.entries()) {
    const buffer = await file.arrayBuffer();
    const { component } = await requestJson(
      `/api/projects/${state.activeProject.id}/components/import`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Filename": encodeURIComponent(file.name),
          "X-Unit": importUnit.value,
        },
        body: buffer,
      },
    );
    importedComponents.push(component);
    setViewportLoading(index + 1, files.length);
  }

  state.latestImportWarnings = importedComponents;
  await selectProject(state.activeProject.id, true);
  hideViewportLoading();
}

async function updateComponentVisibility(componentId, visible) {
  if (!state.activeProject) {
    return;
  }

  const { component } = await requestJson(
    `/api/projects/${state.activeProject.id}/components/${componentId}/visibility`,
    {
      method: "POST",
      body: JSON.stringify({ visible }),
    },
  );

  replaceComponent(component);
  syncMeshVisibility();
}

async function updateComponentState(componentId, payload) {
  if (!state.activeProject) {
    return;
  }

  const { component } = await requestJson(
    `/api/projects/${state.activeProject.id}/components/${componentId}/state`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  replaceComponent(component);
  applyMeshTransform(component);
}

async function submitTransformEditor() {
  const component = getSelectedComponent();
  if (!component || component.locked) {
    return;
  }

  const allowed = getAllowedAxes(state.axisMode);
  const moveDelta = { x: 0, y: 0, z: 0 };
  const rotateDelta = { x: 0, y: 0, z: 0 };
  let hasDelta = false;
  
  const originalTransform = structuredClone(component.transform);
  const originalPosition = { ...component.transform.position };

  for (const axis of ["x", "y", "z"]) {
    if (!allowed.includes(axis)) continue;
    
    // Read Move
    const moveInput = document.getElementById(`move-${axis}`);
    const moveValue = Number(moveInput?.value || 0);
    if (moveValue !== 0) {
      moveDelta[axis] = moveValue;
      hasDelta = true;
    }
    
    // Read Rotate
    const rotateInput = document.getElementById(`rotate-${axis}`);
    const rotateValue = Number(rotateInput?.value || 0);
    if (rotateValue !== 0) {
      rotateDelta[axis] = rotateValue;
      hasDelta = true;
    }
  }

  if (!hasDelta) {
    hideContextMenu();
    return;
  }

  const moveDist = Math.sqrt(moveDelta.x * moveDelta.x + moveDelta.y * moveDelta.y + moveDelta.z * moveDelta.z);
  const rotDist = Math.sqrt(rotateDelta.x * rotateDelta.x + rotateDelta.y * rotateDelta.y + rotateDelta.z * rotateDelta.z);
  
  // Calculate steps based on whichever movement requires more steps
  const moveSteps = Math.ceil(moveDist / 0.5);
  const rotSteps = Math.ceil(rotDist / 1.0);
  const steps = Math.max(1, moveSteps, rotSteps);

  let successCount = 0;
  let pushedThisMove = new Set();
  
  for (let i = 0; i < steps; i++) {
    const nextTransform = structuredClone(originalTransform);
    const fraction = (i + 1) / steps;
    
    nextTransform.position.x += moveDelta.x * fraction;
    nextTransform.position.y += moveDelta.y * fraction;
    nextTransform.position.z += moveDelta.z * fraction;
    
    nextTransform.rotation.x += rotateDelta.x * fraction;
    nextTransform.rotation.y += rotateDelta.y * fraction;
    nextTransform.rotation.z += rotateDelta.z * fraction;

    const result = tryApplyPhysicsTransform(component, nextTransform, { silent: false });
    if (!result.accepted) {
      state.physicsMessage = `Movement stopped early by physical constraint. (${successCount}/${steps} steps)`;
      break;
    }

    successCount++;
    if (result.pushedComponents) {
      result.pushedComponents.forEach(c => pushedThisMove.add(c.id));
    }
  }

  if (successCount === 0) {
    state.physicsMessage = "Movement completely blocked by collision.";
    renderProjectDetails(state.activeProject);
    return;
  }

  if (successCount === steps) {
    state.physicsMessage = "Transform applied successfully.";
  }

  positionUndoManager.recordPosition(component.id, originalPosition);

  try {
    await updateComponentState(component.id, { transform: component.transform });
    const uniquePushed = Array.from(pushedThisMove).map(id => state.activeProject.components.find(c => c.id === id));
    for (const pushedComp of uniquePushed) {
      if (pushedComp) {
        await updateComponentState(pushedComp.id, { transform: pushedComp.transform });
      }
    }
    renderProjectDetails(state.activeProject);
  } catch (err) {
    showError(err);
  }
}

function replaceComponent(component) {
  state.activeProject.components = state.activeProject.components.map((item) =>
    item.id === component.id ? component : item,
  );
  if (!state.selectedComponentId) {
    state.selectedComponentId = component.id;
  }
  renderComponentList(state.activeProject.components);
  renderProjectDetails(state.activeProject);
  renderSettingsPanel();
  highlightSelectedMesh();
}

function initializeViewer() {
  sceneState.scene.background = new THREE.Color(0xd8ded8);

  sceneState.camera = new THREE.PerspectiveCamera(
    50,
    viewportCanvas.clientWidth / Math.max(viewportCanvas.clientHeight, 1),
    0.1,
    5000,
  );
  sceneState.camera.position.set(220, 180, 220);

  sceneState.renderer = new THREE.WebGLRenderer({ antialias: true });
  sceneState.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  sceneState.renderer.setSize(viewportCanvas.clientWidth, Math.max(viewportCanvas.clientHeight, 1));
  viewportCanvas.append(sceneState.renderer.domElement);

  sceneState.controls = new OrbitControls(sceneState.camera, sceneState.renderer.domElement);
  sceneState.controls.enableDamping = true;
  sceneState.controls.enableRotate = !state.axisModeLocked;
  sceneState.controls.target.set(0, 20, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 1.4);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(160, 220, 140);
  const fillLight = new THREE.DirectionalLight(0xd9ece8, 0.7);
  fillLight.position.set(-180, 120, -80);
  sceneState.grid = new THREE.GridHelper(600, 24, 0x40615c, 0x8ea39c);
  sceneState.axisGuides = createAxisGuides();

  sceneState.scene.add(ambient, keyLight, fillLight, sceneState.grid, sceneState.axisGuides);
  updateAxisGuides();
  animate();
}

function createAxisGuides() {
  const group = new THREE.Group();
  const axes = {
    x: { color: 0xd14343, dir: new THREE.Vector3(1, 0, 0) },
    y: { color: 0x0f766e, dir: new THREE.Vector3(0, 1, 0) },
    z: { color: 0x2563eb, dir: new THREE.Vector3(0, 0, 1) },
  };

  for (const [axis, meta] of Object.entries(axes)) {
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      meta.dir.clone().multiplyScalar(-180),
      meta.dir.clone().multiplyScalar(180),
    ]);
    const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: meta.color }));
    line.userData.axisKey = axis;
    group.add(line);

    // Add Axis name label (X, Y, Z) at the positive end
    const nameLabel = createAxisNameLabel(axis.toUpperCase(), meta.color);
    nameLabel.position.copy(meta.dir.clone().multiplyScalar(195));
    nameLabel.userData.axisKey = axis;
    nameLabel.userData.isAxisName = true;
    group.add(nameLabel);

    for (let step = -150; step <= 150; step += 50) {
      if (step === 0) {
        continue;
      }

      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshBasicMaterial({ color: meta.color }),
      );
      tick.position.copy(meta.dir.clone().multiplyScalar(step));
      tick.userData.axisKey = axis;
      tick.userData.tickValue = step;
      group.add(tick);

      const label = createAxisLabel(`${step}`, meta.color);
      label.position.copy(meta.dir.clone().multiplyScalar(step));
      if (axis === "x") {
        label.position.y += 8;
      } else if (axis === "y") {
        label.position.x += 8;
      } else {
        label.position.y += 8;
      }
      label.userData.axisKey = axis;
      label.userData.axisLabel = true;
      label.userData.tickValue = step;
      group.add(label);
    }
  }

  return group;
}

function createAxisLabel(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 48;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  context.font = "24px Segoe UI";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(18, 9, 1);
  sprite.material.depthTest = false;
  return sprite;
}

function createAxisNameLabel(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.font = "bold 40px Segoe UI";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ 
    map: texture, 
    transparent: true, 
    color: color, 
    depthTest: false 
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(16, 16, 1);
  return sprite;
}

function updateAxisGuides() {
  const allowed = getAllowedAxes(state.axisMode);
  state.rulerStep = chooseRulerStep();

  sceneState.axisGuides.children.forEach((child) => {
    const axis = child.userData.axisKey;
    if (!axis) {
      return;
    }

    const isActive = state.axisMode === "xyz" || allowed.includes(axis);
    if (child.material?.color) {
      child.material.color.setHex(isActive ? activeAxisColor(axis) : 0x98a39d);
    }
    if (child.userData.axisLabel && child.material?.map?.image?.getContext) {
      updateAxisLabelSprite(child, axis);
    }
    const isRulerTick = Number.isFinite(child.userData.tickValue);
    const isAtCurrentStep = !isRulerTick || Math.abs(child.userData.tickValue) % state.rulerStep === 0;
    child.visible = isAtCurrentStep && (child.userData.axisLabel ? state.showAxisMarkings : true);
  });

  if (state.axisMode === "xy") {
    sceneState.grid.rotation.set(Math.PI / 2, 0, 0);
  } else if (state.axisMode === "yz") {
    sceneState.grid.rotation.set(0, 0, Math.PI / 2);
  } else {
    sceneState.grid.rotation.set(0, 0, 0);
  }
}

function chooseRulerStep() {
  if (!sceneState.camera) {
    return 50;
  }

  const distance = sceneState.camera.position.distanceTo(sceneState.controls.target);
  const rawStep = Math.max(distance / 6, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function updateAxisLabelSprite(sprite, axis) {
  const canvas = sprite.material.map.image;
  const context = canvas.getContext("2d");
  const unit = state.activeProject?.unit || "mm";
  const position = Number(sprite.position[axis] || 0).toFixed(0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#16211b";
  context.font = "22px Segoe UI";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`${position}`, canvas.width / 2, canvas.height / 2 - 8);
  context.fillStyle = "#5f6d64";
  context.font = "14px Segoe UI";
  context.fillText(unit, canvas.width / 2, canvas.height / 2 + 12);
  sprite.material.map.needsUpdate = true;
}

function animate() {
  requestAnimationFrame(animate);
  sceneState.controls.update();
  const nextRulerStep = chooseRulerStep();
  if (nextRulerStep !== state.rulerStep) {
    updateAxisGuides();
  }
  sceneState.renderer.render(sceneState.scene, sceneState.camera);
}

function onResize() {
  const width = viewportCanvas.clientWidth;
  const height = Math.max(viewportCanvas.clientHeight, 1);
  sceneState.camera.aspect = width / height;
  sceneState.camera.updateProjectionMatrix();
  sceneState.renderer.setSize(width, height);
}

async function loadProjectIntoScene(project) {
  clearSceneMeshes();
  if (project.components.length === 0) {
    hideViewportLoading();
    setViewportMessage("No STL components loaded", "Import one or more `.stl` files.");
    viewportEmpty.hidden = false;
    return;
  }

  setViewportLoading(0, project.components.length);

  let loadedCount = 0;
  try {
    for (const component of project.components) {
      try {
        const buffer = await requestBuffer(`/api/projects/${project.id}/components/${component.id}/asset`);
        const geometry = sceneState.loader.parse(buffer);
        geometry.computeBoundingBox();
        geometry.computeVertexNormals();
        const mesh = createMesh(component, geometry);
        sceneState.scene.add(mesh);
        sceneState.meshEntries.set(component.id, mesh);
      } catch {
        component.validationWarnings = [...component.validationWarnings, "Preview could not be loaded."];
        component.validation_status = "warning";
      }
      loadedCount += 1;
      setViewportLoading(loadedCount, project.components.length);
    }
  } finally {
    hideViewportLoading();
  }

  viewportEmpty.hidden = sceneState.meshEntries.size > 0;
  if (sceneState.meshEntries.size === 0) {
    setViewportMessage("STL components could not be displayed", "Check the import warnings and try again.");
  }
  centerCameraOnMeshes();
  syncMeshVisibility();
  highlightSelectedMesh();
}

function setViewportMessage(title, detail) {
  viewportEmptyTitle.textContent = title;
  viewportEmptyDetail.textContent = detail;
}

function setViewportLoading(completed, total) {
  const safeTotal = Math.max(total, 1);
  const percent = Math.round((completed / safeTotal) * 100);
  if (completed < total) {
    viewportEmpty.hidden = true;
  }
  const complete = completed >= total;
  viewportLoading.hidden = complete;
  viewportLoading.classList.toggle("hidden", complete);
  if (!complete) {
    viewportLoading.classList.remove("hidden");
  }
  viewportLoadingDetail.textContent = `${completed} / ${total} components`;
  viewportLoadingBar.style.width = `${percent}%`;
}

function hideViewportLoading() {
  viewportLoading.hidden = true;
  viewportLoading.classList.add("hidden");
  viewportLoadingBar.style.width = "100%";
}

function clearSceneMeshes() {
  for (const mesh of sceneState.meshEntries.values()) {
    sceneState.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  sceneState.meshEntries.clear();
}

function createMesh(component, geometry) {
  geometry.center();
  const material = new THREE.MeshStandardMaterial({
    color: component.id === state.selectedComponentId ? 0x0f766e : 0x6d7a73,
    metalness: 0.08,
    roughness: 0.55,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.componentId = component.id;
  geometry.computeBoundingBox();
  mesh.userData.obb = new OBB().fromBox3(geometry.boundingBox);
  applyMeshTransform(component, mesh);
  return mesh;
}

function applyMeshTransform(component, providedMesh = null) {
  const mesh = providedMesh || sceneState.meshEntries.get(component.id);
  if (!mesh) {
    return;
  }

  mesh.position.set(
    component.transform.position.x,
    component.transform.position.y,
    component.transform.position.z,
  );
  mesh.rotation.set(
    THREE.MathUtils.degToRad(component.transform.rotation.x),
    THREE.MathUtils.degToRad(component.transform.rotation.y),
    THREE.MathUtils.degToRad(component.transform.rotation.z),
  );
}

function centerCameraOnMeshes() {
  if (sceneState.meshEntries.size === 0) {
    sceneState.controls.target.set(0, 20, 0);
    sceneState.camera.position.set(220, 180, 220);
    return;
  }

  const bounds = new THREE.Box3();
  for (const mesh of sceneState.meshEntries.values()) {
    bounds.expandByObject(mesh);
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);
  const maxSpan = Math.max(size.x, size.y, size.z, 40);

  sceneState.controls.target.copy(center);
  sceneState.camera.position.set(center.x + maxSpan * 1.8, center.y + maxSpan * 1.2, center.z + maxSpan * 1.8);
}

function orientCameraToVector(vector) {
  const target = sceneState.controls.target.clone();
  const direction = new THREE.Vector3(...vector).normalize();
  const distance = sceneState.camera.position.distanceTo(target);
  const nextPosition = target.clone().add(direction.multiplyScalar(distance));
  sceneState.camera.position.copy(nextPosition);
  sceneState.camera.lookAt(target);
}

function syncMeshVisibility() {
  if (!state.activeProject) {
    return;
  }

  for (const component of state.activeProject.components) {
    const mesh = sceneState.meshEntries.get(component.id);
    if (mesh) {
      mesh.visible = component.visible;
    }
  }
}

function highlightSelectedMesh() {
  if (!state.activeProject) {
    return;
  }

  for (const component of state.activeProject.components) {
    const mesh = sceneState.meshEntries.get(component.id);
    if (!mesh) {
      continue;
    }

    mesh.material.color.setHex(component.id === state.selectedComponentId ? 0x0f766e : 0x6d7a73);
  }
}

function onViewportPointerDown(event) {
  if (!state.activeProject || sceneState.meshEntries.size === 0) {
    return;
  }

  if (event.button !== 0) {
    return;
  }

  const hit = getViewportHit(event);
  if (!hit) {
    hideContextMenu();
    return;
  }

  state.selectedComponentId = hit.componentId;
  renderComponentList(state.activeProject.components);
  renderProjectDetails(state.activeProject);
  renderSettingsPanel();
  highlightSelectedMesh();
  hideContextMenu();

  const component = getSelectedComponent();
  if (state.viewportTool === "move" && component && !component.locked) {
    startObjectDrag(event, component);
  }
}

function onViewportPointerMove(event) {
  if (!state.drag) {
    return;
  }

  const point = getDragPoint(event, state.drag.plane);
  if (!point) {
    return;
  }

  const rawDelta = point.clone().sub(state.drag.startPoint);
  const desired = state.drag.startPosition.clone();
  const allowed = getAllowedAxes(state.axisMode);
  const constrainedDelta = rawDelta.clone();

  for (const axis of ["x", "y", "z"]) {
    if (!allowed.includes(axis)) {
      constrainedDelta[axis] = 0;
    }
  }

  const axisOrder = ["x", "y", "z"].sort(
    (left, right) => Math.abs(constrainedDelta[right]) - Math.abs(constrainedDelta[left]),
  );
  let acceptedPosition = state.drag.lastPosition.clone();
  let nextPushedComponents = [];

  for (const axis of axisOrder) {
    const nextPosition = acceptedPosition.clone();
    nextPosition[axis] = state.drag.startPosition[axis] + constrainedDelta[axis];
    const nextTransform = structuredClone(state.drag.component.transform);
    nextTransform.position = vectorToTransform(nextPosition);
    const result = tryApplyPhysicsTransform(state.drag.component, nextTransform, { silent: true });
    if (result.accepted) {
      acceptedPosition = nextPosition;
      if (result.pushedComponents) {
        nextPushedComponents.push(...result.pushedComponents);
      }
    }
  }

  if (!acceptedPosition.equals(state.drag.lastPosition)) {
    state.drag.moved = true;
    state.drag.lastPosition.copy(acceptedPosition);
    state.drag.pushedComponents = nextPushedComponents;
    state.physicsMessage = "Moving with collision prevention enabled.";
    renderProjectDetails(state.activeProject);
  }
}

async function onViewportPointerUp(event) {
  if (!state.drag) {
    return;
  }

  const drag = state.drag;
  state.drag = null;
  sceneState.controls.enabled = true;
  viewportCanvas.releasePointerCapture?.(event.pointerId);

  if (!drag.moved) {
    return;
  }

  positionUndoManager.recordPosition(drag.component.id, drag.startTransformPosition);

  try {
    await updateComponentState(drag.component.id, { transform: drag.component.transform });
    if (drag.pushedComponents) {
      const uniquePushed = Array.from(new Set(drag.pushedComponents.map(c => c.id)))
        .map(id => drag.pushedComponents.find(c => c.id === id));
      for (const pushed of uniquePushed) {
        await updateComponentState(pushed.id, { transform: pushed.transform });
      }
    }
  } catch (error) {
    showError(error);
  }
}

function startObjectDrag(event, component) {
  const mesh = sceneState.meshEntries.get(component.id);
  if (!mesh) {
    return;
  }

  const startPoint = getDragPoint(event, createDragPlane(mesh.position));
  if (!startPoint) {
    return;
  }

  state.drag = {
    component,
    plane: createDragPlane(mesh.position),
    startPoint,
    startPosition: mesh.position.clone(),
    lastPosition: mesh.position.clone(),
    startTransformPosition: { ...component.transform.position },
    moved: false,
  };
  sceneState.controls.enabled = false;
  viewportCanvas.setPointerCapture?.(event.pointerId);
}

function createDragPlane(origin) {
  const normal = new THREE.Vector3();
  sceneState.camera.getWorldDirection(normal);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
}

function getDragPoint(event, plane) {
  const rect = viewportCanvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  sceneState.raycaster.setFromCamera(pointer, sceneState.camera);
  return sceneState.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
}

function vectorToTransform(vector) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function tryApplyPhysicsTransform(component, nextTransform, options = {}, visited = new Set()) {
  const mesh = sceneState.meshEntries.get(component.id);
  if (!mesh) {
    return { accepted: false, message: "Object geometry is not loaded.", pushedComponents: [] };
  }

  visited.add(component.id);

  const deltaPosition = {
    x: nextTransform.position.x - component.transform.position.x,
    y: nextTransform.position.y - component.transform.position.y,
    z: nextTransform.position.z - component.transform.position.z,
  };
  const deltaRotation = {
    x: nextTransform.rotation.x - component.transform.rotation.x,
    y: nextTransform.rotation.y - component.transform.rotation.y,
    z: nextTransform.rotation.z - component.transform.rotation.z,
  };

  const previousState = {
    transform: structuredClone(component.transform),
    position: mesh.position.clone(),
    rotation: mesh.rotation.clone(),
  };

  mesh.position.set(nextTransform.position.x, nextTransform.position.y, nextTransform.position.z);
  mesh.rotation.set(
    THREE.MathUtils.degToRad(nextTransform.rotation.x),
    THREE.MathUtils.degToRad(nextTransform.rotation.y),
    THREE.MathUtils.degToRad(nextTransform.rotation.z),
  );
  mesh.updateMatrixWorld(true);

  const candidateObb = mesh.userData.obb.clone();
  candidateObb.applyMatrix4(mesh.matrixWorld);

  const collisions = [];
  for (const [id, otherMesh] of sceneState.meshEntries.entries()) {
    if (visited.has(id) || !otherMesh.visible) {
      continue;
    }
    otherMesh.updateMatrixWorld(true);
    const otherObb = otherMesh.userData.obb.clone();
    otherObb.applyMatrix4(otherMesh.matrixWorld);
    if (candidateObb.intersectsOBB(otherObb)) {
      collisions.push(id);
    }
  }

  const pushedNodes = [];
  let branchSuccess = true;

  if (collisions.length > 0) {
    const collidingComponents = collisions.map(id => state.activeProject.components.find(c => c.id === id));
    
    if (collidingComponents.some(c => c.locked)) {
      branchSuccess = false;
    } else {
      for (const c of collidingComponents) {
        const cNextTransform = {
          position: {
            x: c.transform.position.x + deltaPosition.x,
            y: c.transform.position.y + deltaPosition.y,
            z: c.transform.position.z + deltaPosition.z,
          },
          rotation: {
            x: c.transform.rotation.x + deltaRotation.x,
            y: c.transform.rotation.y + deltaRotation.y,
            z: c.transform.rotation.z + deltaRotation.z,
          }
        };
        const pushResult = tryApplyPhysicsTransform(c, cNextTransform, { silent: true }, visited);
        if (!pushResult.accepted) {
          branchSuccess = false;
          break;
        }
        pushedNodes.push({ component: c, pushResult });
      }
    }
  }

  if (!branchSuccess) {
    for (const node of pushedNodes) {
      revertPhysicsTransform(node.component, node.pushResult);
    }
    mesh.position.copy(previousState.position);
    mesh.rotation.copy(previousState.rotation);
    mesh.updateMatrixWorld(true);
    component.transform = previousState.transform;
    return { accepted: false, message: "Movement stopped by blocked component.", pushedComponents: [] };
  }

  component.transform = structuredClone(nextTransform);
  if (!options.silent) {
    applyMeshTransform(component, mesh);
  }

  const allPushed = pushedNodes.map(n => n.component);
  for (const n of pushedNodes) {
    allPushed.push(...n.pushResult.pushedComponents);
  }

  return { 
    accepted: true, 
    message: "Transform accepted; no penetration detected.", 
    pushedComponents: allPushed,
    previousState,
    pushedNodes 
  };
}

function revertPhysicsTransform(component, pushResult) {
  const mesh = sceneState.meshEntries.get(component.id);
  if (!mesh) return;
  mesh.position.copy(pushResult.previousState.position);
  mesh.rotation.copy(pushResult.previousState.rotation);
  mesh.updateMatrixWorld(true);
  component.transform = pushResult.previousState.transform;
  for (const childNode of pushResult.pushedNodes || []) {
    revertPhysicsTransform(childNode.component, childNode.pushResult);
  }
}

function setViewportTool(tool) {
  state.viewportTool = tool;
  selectToolButton.classList.toggle("active", tool === "select");
  moveToolButton.classList.toggle("active", tool === "move");
  viewportCanvas.classList.toggle("move-cursor", tool === "move");
}

function onViewportContextMenu(event) {
  event.preventDefault();
  if (!state.activeProject || sceneState.meshEntries.size === 0) {
    return;
  }

  const hit = getViewportHit(event);
  if (!hit) {
    hideContextMenu();
    return;
  }

  state.selectedComponentId = hit.componentId;
  state.contextComponentId = hit.componentId;
  renderComponentList(state.activeProject.components);
  renderProjectDetails(state.activeProject);
  highlightSelectedMesh();
  openContextMenu(event.clientX, event.clientY);
}

function getViewportHit(event) {
  const rect = viewportCanvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );

  sceneState.raycaster.setFromCamera(pointer, sceneState.camera);
  const intersects = sceneState.raycaster.intersectObjects(Array.from(sceneState.meshEntries.values()), false);
  if (intersects.length === 0) {
    return null;
  }

  return { componentId: intersects[0].object.userData.componentId };
}

function openContextMenu(clientX, clientY) {
  const component = getSelectedComponent();
  if (!component) {
    return;
  }

  const allowed = getAllowedAxes(state.axisMode);
  const unit = state.activeProject.unit;
  const lockedHTML = component.locked ? "disabled" : "";

  contextMenu.innerHTML = `
    <div class="panel-block" style="padding: 0; min-width: 240px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: #16211b;">Transform Offset</h3>
        <button id="contextConstantToggle" class="icon-button" type="button" title="Toggle Lock" style="font-size: 14px;">
          ${component.locked ? "🔒" : "🔓"}
        </button>
      </div>

      <div class="panel-note" style="margin-bottom: 6px; font-size: 12px; font-weight: 600;">Move (${unit})</div>
      <div class="transform-grid">
        <label>X <input id="move-x" type="number" step="0.1" value="0" ${allowed.includes("x") && !component.locked ? "" : "disabled"} /></label>
        <label>Y <input id="move-y" type="number" step="0.1" value="0" ${allowed.includes("y") && !component.locked ? "" : "disabled"} /></label>
        <label>Z <input id="move-z" type="number" step="0.1" value="0" ${allowed.includes("z") && !component.locked ? "" : "disabled"} /></label>
      </div>

      <div class="panel-note" style="margin-top: 12px; margin-bottom: 6px; font-size: 12px; font-weight: 600;">Rotate (deg)</div>
      <div class="transform-grid">
        <label>X <input id="rotate-x" type="number" step="1" value="0" ${allowed.includes("x") && !component.locked ? "" : "disabled"} /></label>
        <label>Y <input id="rotate-y" type="number" step="1" value="0" ${allowed.includes("y") && !component.locked ? "" : "disabled"} /></label>
        <label>Z <input id="rotate-z" type="number" step="1" value="0" ${allowed.includes("z") && !component.locked ? "" : "disabled"} /></label>
      </div>

      <div class="form-actions" style="margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px;">
        <button id="contextCancelTransform" class="menu-button" type="button" style="padding: 4px 12px; font-weight: 500;">Cancel</button>
        <button id="contextApplyTransform" type="button" ${component.locked ? "disabled" : ""} style="padding: 4px 12px; background: ${component.locked ? '#a3b1ab' : '#0f766e'}; color: white; border: none; border-radius: 4px; font-weight: 500; cursor: ${component.locked ? 'not-allowed' : 'pointer'};">Apply</button>
      </div>
    </div>
  `;

  const viewportRect = viewportCanvas.getBoundingClientRect();
  contextMenu.style.left = `${Math.min(clientX - viewportRect.left, viewportRect.width - 260)}px`;
  contextMenu.style.top = `${Math.min(clientY - viewportRect.top, viewportRect.height - 250)}px`;
  contextMenu.classList.remove("hidden");

  contextMenu.querySelector("#contextConstantToggle").addEventListener("click", async () => {
    await updateComponentState(component.id, { locked: !component.locked });
    openContextMenu(clientX, clientY); // Re-render menu to update locks
  });

  contextMenu.querySelector("#contextCancelTransform").addEventListener("click", () => {
    hideContextMenu();
  });

  contextMenu.querySelector("#contextApplyTransform").addEventListener("click", async () => {
    await submitTransformEditor();
    hideContextMenu();
  });
}

function hideContextMenu() {
  contextMenu.classList.add("hidden");
}

// Removed renderContextMenuTransformEditor since it is now baked into openContextMenu

function onDocumentClick(event) {
  if (!settingsPanel.contains(event.target) && !settingsToggle.contains(event.target)) {
    state.settingsOpen = false;
    renderSettingsPanel();
  }

  if (!contextMenu.contains(event.target)) {
    hideContextMenu();
  }
}

function createEmptyRow(message) {
  const row = document.createElement("div");
  row.className = "empty-row";
  row.textContent = message;
  return row;
}

function getSelectedComponent() {
  return state.activeProject?.components.find((item) => item.id === state.selectedComponentId) || null;
}

function setAxisMode(modeId) {
  if (state.axisModeLocked && state.axisMode !== modeId) {
    return;
  }

  state.axisMode = modeId;
  updateAxisGuides();
  renderSettingsPanel();
}

function getAllowedAxes(modeId) {
  return AXIS_MODES.find((mode) => mode.id === modeId)?.axes || ["x", "y", "z"];
}

function describeAxisMode(modeId) {
  return AXIS_MODES.find((mode) => mode.id === modeId)?.label || "Set to XYZ (3D)";
}

function activeAxisColor(axis) {
  if (axis === "x") {
    return 0xd14343;
  }
  if (axis === "y") {
    return 0x0f766e;
  }
  return 0x2563eb;
}

function applyProjectListVisibility() {
  projectList.classList.toggle("hidden", !state.projectListExpanded);
  projectSectionToggle.innerHTML = state.projectListExpanded ? "&#9662;" : "&#9656;";
}

function applySidebarVisibility() {
  workspaceShell.classList.toggle("left-collapsed", !state.leftSidebarOpen);
  workspaceShell.classList.toggle("right-collapsed", !state.rightSidebarOpen);
  leftSidebarToggle.innerHTML = state.leftSidebarOpen ? "&#9664;" : "&#9654;";
  rightSidebarToggle.innerHTML = state.rightSidebarOpen ? "&#9654;" : "&#9664;";
  window.localStorage.setItem(
    "cadtool.panelState",
    JSON.stringify({
      leftSidebarOpen: state.leftSidebarOpen,
      rightSidebarOpen: state.rightSidebarOpen,
    }),
  );
  setTimeout(onResize, 0);
}

function readPanelState() {
  try {
    return JSON.parse(window.localStorage.getItem("cadtool.panelState") || "{}");
  } catch {
    return {};
  }
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAxisValue(value) {
  return Number(value || 0).toFixed(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showError(error) {
  inspectorTitle.textContent = "Local app error";
  projectDetails.innerHTML = `
    <div>
      <dt>Message</dt>
      <dd>${escapeHtml(error.message)}</dd>
    </div>
  `;
}
