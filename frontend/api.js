import { state } from "./state.js";
import { databaseStatus, storageStatus, importUnit } from "./dom.js";
import { renderProjects, renderProjectDetails, renderComponentList, renderImportWarnings, renderSettingsPanel, hideContextMenu } from "./ui.js";
import { updateAxisGuides, loadProjectIntoScene, applyMeshTransform, syncMeshVisibility, highlightSelectedMesh, clearSceneMeshes } from "./viewer.js";
import { setViewportMessage, hideViewportLoading, setViewportLoading } from "./ui.js";
import { createEmptyRow, escapeHtml } from "./utils.js";

export async function requestJson(url, options = {}) {
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

export async function requestBuffer(url) {
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

export async function loadProjects() {
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

export async function selectProject(projectId, keepWarningState = true) {
  state.activeProjectId = projectId;
  window.localStorage.setItem("cadtool.activeProjectId", projectId);

  if (!keepWarningState) {
    state.latestImportWarnings = [];
  }

  const { project } = await requestJson(`/api/projects/${projectId}`);
  await setActiveProject(project);
  renderProjects(await getProjectsSnapshot());
}

export async function getProjectsSnapshot() {
  const { projects } = await requestJson("/api/projects");
  return projects;
}

export async function setActiveProject(project) {
  state.activeProject = project;
  state.selectedComponentId = project?.components[0]?.id || null;
  const deleteProjectButton = document.querySelector("#deleteProjectButton");
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
  const inspectorTitle = document.querySelector("#inspectorTitle");
  inspectorTitle.textContent = "No project selected";
  const componentCount = document.querySelector("#componentCount");
  componentCount.textContent = "0";
  const componentList = document.querySelector("#componentList");
  componentList.replaceChildren(createEmptyRow("Create a project to start importing STL files."));
  document.querySelector("#importWarnings").replaceChildren();
  const projectDetails = document.querySelector("#projectDetails");
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
  document.querySelector("#viewportEmpty").hidden = false;
  renderSettingsPanel();
}

export async function updateProjectUnit(unit) {
  if (!state.activeProject) return;

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

export async function deleteActiveProject() {
  if (!state.activeProject) return;

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

export async function importFiles(files) {
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

export async function updateComponentVisibility(componentId, visible) {
  if (!state.activeProject) return;

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

export async function updateComponentState(componentId, payload) {
  if (!state.activeProject) return;

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

export function replaceComponent(component) {
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
