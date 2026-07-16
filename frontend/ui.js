import { state, getSelectedComponent, sceneState } from "./state.js";
import { formatDate, escapeHtml, createEmptyRow, formatAxisValue, describeAxisMode, getAllowedAxes, showError } from "./utils.js";
import { NAV_PRESETS, AXIS_MODES } from "./constants.js";
import { updateComponentVisibility, updateProjectUnit, updateComponentState, selectProject } from "./api.js";
import { submitTransformEditor } from "./physics.js";
import { orientCameraToVector, updateAxisGuides, highlightSelectedMesh } from "./viewer.js";

// DOM imports
import {
  projectCount, projectList, projectSectionToggle, componentCount, componentList,
  importWarnings, projectDetails, inspectorTitle, settingsPanel, contextMenu,
  viewportEmptyTitle, viewportEmptyDetail, viewportEmpty, viewportLoading,
  viewportLoadingDetail, viewportLoadingBar, selectToolButton, moveToolButton,
  viewportCanvas, navCube, workspaceShell, leftSidebarToggle, rightSidebarToggle
} from "./dom.js";

export function renderProjects(projects) {
  projectCount.textContent = String(projects.length);
  projectList.replaceChildren();

  if (projects.length === 0) {
    projectList.append(createEmptyRow("No local projects yet."));
    applyProjectListVisibility();
    return;
  }

  for (const project of projects) {
    const row = document.createElement("div");
    row.className = \`project-row\${project.id === state.activeProjectId ? " active" : ""}\`;

    const top = document.createElement("div");
    top.className = "project-row-top";

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "project-select";
    selectButton.innerHTML = \`<strong>\${escapeHtml(project.name)}</strong>\`;
    selectButton.addEventListener("click", () => {
      selectProject(project.id).catch(err => {
        showError(err);
      });
    });

    const badge = document.createElement("span");
    badge.className = "component-status";
    badge.textContent = project.unit;

    top.append(selectButton, badge);

    const info = document.createElement("span");
    info.textContent = \`Updated \${formatDate(project.updated_at)}\`;

    row.append(top, info);
    projectList.append(row);
  }

  applyProjectListVisibility();
}

export function renderComponentList(components) {
  componentCount.textContent = String(components.length);
  componentList.replaceChildren();

  if (components.length === 0) {
    componentList.append(createEmptyRow("No STL files imported yet."));
    return;
  }

  for (const component of components) {
    const row = document.createElement("div");
    row.className = \`project-row component-row\${component.id === state.selectedComponentId ? " active" : ""}\`;

    const visibility = document.createElement("input");
    visibility.className = "component-checkbox";
    visibility.type = "checkbox";
    visibility.checked = component.visible;
    visibility.title = component.visible ? "Hide component" : "Show component";
    visibility.addEventListener("change", (event) => {
      event.stopPropagation();
      updateComponentVisibility(component.id, visibility.checked).catch(err => {
        showError(err);
      });
    });

    const metaButton = document.createElement("button");
    metaButton.type = "button";
    metaButton.className = "component-meta";
    metaButton.innerHTML = \`
      <strong>\${escapeHtml(component.name)}</strong>
      <span>\${escapeHtml(component.source_filename)} | \${escapeHtml(component.unit)} | \${escapeHtml(component.fileSizeLabel)}</span>
      <span class="component-status\${component.validation_status === "warning" ? " warning" : ""}">
        \${escapeHtml(component.validation_status)} | \${escapeHtml(component.mesh_format)}
      </span>
    \`;
    metaButton.addEventListener("click", () => {
      state.selectedComponentId = component.id;
      renderComponentList(state.activeProject.components);
      renderProjectDetails(state.activeProject);
      renderSettingsPanel();
      highlightSelectedMesh();
    });

    const lockBadge = document.createElement("span");
    lockBadge.className = \`project-lock\${component.locked ? "" : " free"}\`;
    lockBadge.textContent = component.locked ? "Constant" : "Editable";

    row.append(visibility, metaButton, lockBadge);
    componentList.append(row);
  }
}

export function renderProjectDetails(project) {
  const component = getSelectedComponent();
  inspectorTitle.textContent = component ? component.name : project.name;

  const projectUnitOptions = ["mm", "cm", "m", "in"]
    .map((unit) => \`<option value="\${unit}"\${unit === project.unit ? " selected" : ""}>\${unit}</option>\`)
    .join("");

  const details = [
    \`
      <div>
        <dt>Project ID</dt>
        <dd>\${escapeHtml(project.id)}</dd>
      </div>
    \`,
    \`
      <div>
        <dt>Project Unit</dt>
        <dd class="unit-inline">
          <select id="projectUnitEditor">\${projectUnitOptions}</select>
          <span>\${project.components.length} components</span>
        </dd>
      </div>
    \`,
    \`
      <div>
        <dt>Storage Path</dt>
        <dd>\${escapeHtml(project.storagePath)}</dd>
      </div>
    \`,
  ];

  if (component) {
    const warningText = component.validationWarnings.length > 0
      ? escapeHtml(component.validationWarnings.join(" | "))
      : "No warnings";

    details.push(\`
      <div>
        <dt>Source File</dt>
        <dd>\${escapeHtml(component.source_filename)}</dd>
      </div>
    \`);
    details.push(\`
      <div>
        <dt>Transform</dt>
        <dd>
          P(\${formatAxisValue(component.transform.position.x)}, \${formatAxisValue(component.transform.position.y)}, \${formatAxisValue(component.transform.position.z)}) |
          R(\${formatAxisValue(component.transform.rotation.x)}, \${formatAxisValue(component.transform.rotation.y)}, \${formatAxisValue(component.transform.rotation.z)})
        </dd>
      </div>
    \`);
    details.push(\`
      <div>
        <dt>State</dt>
        <dd>\${component.locked ? "Constant" : "Editable"} | \${escapeHtml(component.validation_status)} | \${escapeHtml(component.mesh_format)}</dd>
      </div>
    \`);
    details.push(\`
      <div>
        <dt>Physics</dt>
        <dd>\${escapeHtml(state.physicsMessage)}</dd>
      </div>
    \`);
    details.push(\`
      <div>
        <dt>Warnings</dt>
        <dd>\${warningText}</dd>
      </div>
    \`);
  }

  projectDetails.innerHTML = details.join("");
  projectDetails.querySelector("#projectUnitEditor")?.addEventListener("change", async (event) => {
    await updateProjectUnit(event.target.value);
  });
}

export function renderImportWarnings(components) {
  importWarnings.replaceChildren();

  const withWarnings = components.filter((component) => component.validationWarnings.length > 0);
  if (withWarnings.length === 0) return;

  for (const component of withWarnings) {
    const card = document.createElement("div");
    card.className = "warning-card";
    card.innerHTML = \`
      <strong>\${escapeHtml(component.source_filename)}</strong>
      <span>\${escapeHtml(component.validationWarnings.join(" | "))}</span>
    \`;
    importWarnings.append(card);
  }
}

export function renderSettingsPanel() {
  settingsPanel.classList.toggle("hidden", !state.settingsOpen);
  if (!state.settingsOpen) return;

  const selectedComponent = getSelectedComponent();

  const axisButtons = AXIS_MODES.map((mode) => {
    const disabled = state.axisModeLocked && mode.id !== state.axisMode;
    return \`
      <button
        class="axis-button\${mode.id === state.axisMode ? " active" : ""}"
        data-axis-mode="\${mode.id}"
        type="button"
        \${disabled ? "disabled" : ""}
      >\${escapeHtml(mode.label)}</button>
    \`;
  }).join("");

  const objectBlock = selectedComponent
    ? \`
      <div class="panel-block">
        <div class="section-title">
          <h3>Selected Object</h3>
          <span>\${escapeHtml(selectedComponent.name)}</span>
        </div>
        <div class="switch-row">
          <span>Set Object as Constant</span>
          \${renderSwitch("componentLockToggle", selectedComponent.locked, "Toggle object constant state")}
        </div>
        <div class="object-actions">
          <button id="openMoveTool" class="menu-button" type="button" \${selectedComponent.locked ? "disabled" : ""}>Move Object</button>
          <button id="openRotateTool" class="menu-button" type="button" \${selectedComponent.locked ? "disabled" : ""}>Rotate Object</button>
        </div>
        \${renderTransformEditor(selectedComponent)}
      </div>
    \`
    : \`
      <div class="panel-block">
        <h3>Selected Object</h3>
        <div class="panel-note">Select an STL component to edit lock, move, or rotation settings.</div>
      </div>
    \`;

  settingsPanel.innerHTML = \`
    <div class="panel-block">
      <div class="section-title">
        <h3>Axis Controls</h3>
        <span>\${escapeHtml(describeAxisMode(state.axisMode))}</span>
      </div>
      <div class="axis-grid">\${axisButtons}</div>
      <div class="switch-row">
        <span>Set Axis as Constant</span>
        \${renderSwitch("axisLockToggle", state.axisModeLocked, "Toggle axis lock")}
      </div>
      <div class="switch-row">
        <span>Show axis scale markings</span>
        \${renderSwitch("axisMarkingsToggle", state.showAxisMarkings, "Toggle axis markings")}
      </div>
    </div>
    \${objectBlock}
  \`;

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

export function renderTransformEditor(component) {
  if (!state.objectToolMode) return "";

  const mode = state.objectToolMode;
  const allowed = getAllowedAxes(state.axisMode);
  const descriptor = mode === "move" ? "relative offset" : "relative angle";
  const unit = mode === "move" ? state.activeProject.unit : "deg";

  return \`
    <div class="panel-block">
      <h3>\${mode === "move" ? "Move Object" : "Rotate Object"}</h3>
      <div class="panel-note">Enter \${descriptor} values. Active constraint: \${escapeHtml(describeAxisMode(state.axisMode))}.</div>
      <div class="transform-grid">
        \${renderTransformInput("x", allowed.includes("x"), unit)}
        \${renderTransformInput("y", allowed.includes("y"), unit)}
        \${renderTransformInput("z", allowed.includes("z"), unit)}
      </div>
      <div class="form-actions">
        <button id="cancelTransformButton" type="button">Cancel</button>
        <button id="applyTransformButton" type="button" \${component.locked ? "disabled" : ""}>Apply</button>
      </div>
    </div>
  \`;
}

function renderTransformInput(axis, enabled, unit) {
  return \`
    <label>
      \${axis.toUpperCase()} (\${escapeHtml(unit)})
      <input
        id="\${state.objectToolMode}-\${axis}"
        type="number"
        step="0.1"
        value="0"
        \${enabled ? "" : "disabled"}
      />
    </label>
  \`;
}

export function renderSwitch(id, checked, label) {
  return \`
    <label class="switch" aria-label="\${escapeHtml(label)}">
      <input id="\${id}" type="checkbox" \${checked ? "checked" : ""} />
      <span class="switch-slider"></span>
    </label>
  \`;
}

export function setAxisMode(modeId) {
  if (state.axisModeLocked && state.axisMode !== modeId) return;

  state.axisMode = modeId;
  updateAxisGuides();
  renderSettingsPanel();
}

export function openContextMenu(clientX, clientY) {
  const component = getSelectedComponent();
  if (!component) return;

  const allowed = getAllowedAxes(state.axisMode);
  const unit = state.activeProject.unit;

  contextMenu.innerHTML = \`
    <div class="panel-block" style="padding: 0; min-width: 240px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: #16211b;">Transform Offset</h3>
        <button id="contextConstantToggle" class="icon-button" type="button" title="Toggle Lock" style="font-size: 14px;">
          \${component.locked ? "🔒" : "🔓"}
        </button>
      </div>

      <div class="panel-note" style="margin-bottom: 6px; font-size: 12px; font-weight: 600;">Move (\${unit})</div>
      <div class="transform-grid">
        <label>X <input id="move-x" type="number" step="0.1" value="0" \${allowed.includes("x") && !component.locked ? "" : "disabled"} /></label>
        <label>Y <input id="move-y" type="number" step="0.1" value="0" \${allowed.includes("y") && !component.locked ? "" : "disabled"} /></label>
        <label>Z <input id="move-z" type="number" step="0.1" value="0" \${allowed.includes("z") && !component.locked ? "" : "disabled"} /></label>
      </div>

      <div class="panel-note" style="margin-top: 12px; margin-bottom: 6px; font-size: 12px; font-weight: 600;">Rotate (deg)</div>
      <div class="transform-grid">
        <label>X <input id="rotate-x" type="number" step="1" value="0" \${allowed.includes("x") && !component.locked ? "" : "disabled"} /></label>
        <label>Y <input id="rotate-y" type="number" step="1" value="0" \${allowed.includes("y") && !component.locked ? "" : "disabled"} /></label>
        <label>Z <input id="rotate-z" type="number" step="1" value="0" \${allowed.includes("z") && !component.locked ? "" : "disabled"} /></label>
      </div>

      <div class="form-actions" style="margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px;">
        <button id="contextCancelTransform" class="menu-button" type="button" style="padding: 4px 12px; font-weight: 500;">Cancel</button>
        <button id="contextApplyTransform" type="button" \${component.locked ? "disabled" : ""} style="padding: 4px 12px; background: \${component.locked ? '#a3b1ab' : '#0f766e'}; color: white; border: none; border-radius: 4px; font-weight: 500; cursor: \${component.locked ? 'not-allowed' : 'pointer'};">Apply</button>
      </div>
    </div>
  \`;

  const viewportRect = viewportCanvas.getBoundingClientRect();
  contextMenu.style.left = \`\${Math.min(clientX - viewportRect.left, viewportRect.width - 260)}px\`;
  contextMenu.style.top = \`\${Math.min(clientY - viewportRect.top, viewportRect.height - 250)}px\`;
  contextMenu.classList.remove("hidden");

  contextMenu.querySelector("#contextConstantToggle").addEventListener("click", async () => {
    await updateComponentState(component.id, { locked: !component.locked });
    openContextMenu(clientX, clientY);
  });

  contextMenu.querySelector("#contextCancelTransform").addEventListener("click", () => {
    hideContextMenu();
  });

  contextMenu.querySelector("#contextApplyTransform").addEventListener("click", async () => {
    await submitTransformEditor();
    hideContextMenu();
  });
}

export function hideContextMenu() {
  contextMenu.classList.add("hidden");
}

export function applyProjectListVisibility() {
  projectList.classList.toggle("hidden", !state.projectListExpanded);
  projectSectionToggle.innerHTML = state.projectListExpanded ? "&#9662;" : "&#9656;";
}

export function applySidebarVisibility() {
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
  import("./viewer.js").then(m => setTimeout(m.onResize, 0));
}

export function setViewportMessage(title, detail) {
  viewportEmptyTitle.textContent = title;
  viewportEmptyDetail.textContent = detail;
}

export function setViewportLoading(completed, total) {
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
  viewportLoadingDetail.textContent = \`\${completed} / \${total} components\`;
  viewportLoadingBar.style.width = \`\${percent}%\`;
}

export function hideViewportLoading() {
  viewportLoading.hidden = true;
  viewportLoading.classList.add("hidden");
  viewportLoadingBar.style.width = "100%";
}

export function setViewportTool(tool) {
  state.viewportTool = tool;
  selectToolButton.classList.toggle("active", tool === "select");
  moveToolButton.classList.toggle("active", tool === "move");
  viewportCanvas.classList.toggle("move-cursor", tool === "move");
}
