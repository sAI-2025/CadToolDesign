import * as THREE from "three";
import { state, sceneState, getSelectedComponent } from "./state.js";
import { NAV_PRESETS, AXIS_MODES } from "./constants.js";
import { getAllowedAxes, showError } from "./utils.js";
import {
  deleteActiveProject, importFiles, updateComponentState, getProjectsSnapshot, loadProjects, requestJson
} from "./api.js";
import {
  setViewportTool, openContextMenu, hideContextMenu, renderSettingsPanel, 
  applyProjectListVisibility, applySidebarVisibility, renderProjectDetails, renderComponentList
} from "./ui.js";
import {
  onResize, orientCameraToVector, createDragPlane, applyMeshTransform, highlightSelectedMesh
} from "./viewer.js";
import { tryApplyPhysicsTransform } from "./physics.js";
import { positionUndoManager } from "./undo.js";

// DOM imports
import {
  projectSectionToggle, leftSidebarToggle, rightSidebarToggle, deleteProjectButton,
  projectForm, refreshProjects, pickFilesButton, fileInput, dropZone, settingsToggle,
  selectToolButton, moveToolButton, viewportCanvas, navCube
} from "./dom.js";

export function bindEvents() {
  window.addEventListener("resize", onResize);
  
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

  deleteProjectButton.addEventListener("click", deleteActiveProject);

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

  refreshProjects.addEventListener("click", loadProjects);
  pickFilesButton.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    if (fileInput.files?.length > 0) {
      await importFiles(Array.from(fileInput.files));
      fileInput.value = "";
    }
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("active");
  });

  dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropZone.classList.remove("active");
  });

  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("active");
    if (e.dataTransfer?.files?.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter((file) => file.name.toLowerCase().endsWith(".stl"));
      if (files.length > 0) {
        await importFiles(files);
      }
    }
  });

  settingsToggle.addEventListener("click", () => {
    state.settingsOpen = !state.settingsOpen;
    renderSettingsPanel();
  });

  selectToolButton.addEventListener("click", () => setViewportTool("select"));
  moveToolButton.addEventListener("click", () => setViewportTool("move"));

  viewportCanvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (!state.activeProject || sceneState.meshEntries.size === 0) return;

    const rect = viewportCanvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    sceneState.raycaster.setFromCamera(mouse, sceneState.camera);
    const intersects = sceneState.raycaster.intersectObjects(Array.from(sceneState.meshEntries.values()));
    const visibleIntersects = intersects.filter(hit => hit.object.visible);

    if (visibleIntersects.length > 0) {
      const hitMesh = visibleIntersects[0].object;
      const componentId = hitMesh.userData.componentId;

      if (state.selectedComponentId !== componentId) {
        state.selectedComponentId = componentId;
        renderComponentList(state.activeProject.components);
        renderProjectDetails(state.activeProject);
        renderSettingsPanel();
        highlightSelectedMesh();
      }

      openContextMenu(event.clientX, event.clientY);
    } else {
      hideContextMenu();
    }
  });

  document.addEventListener("click", (event) => {
    if (!contextMenu.contains(event.target) && event.target !== viewportCanvas) {
      hideContextMenu();
    }
  });

  window.addEventListener("keydown", async (event) => {
    if (event.ctrlKey && event.key === 'z') {
      event.preventDefault();
      
      const component = getSelectedComponent();
      if (!component || component.locked) return;

      const prevPos = positionUndoManager.popLastPosition(component.id);
      if (prevPos) {
        const nextTransform = {
          position: { ...prevPos },
          rotation: { ...component.transform.rotation }
        };

        const result = tryApplyPhysicsTransform(component, nextTransform, { silent: false });
        
        if (result.accepted) {
          state.physicsMessage = "Undo applied successfully.";
          try {
            await updateComponentState(component.id, { transform: component.transform });
            
            const uniquePushed = Array.from(new Set((result.pushedComponents || []).map(c => c.id)))
              .map(id => state.activeProject.components.find(c => c.id === id))
              .filter(Boolean);
              
            for (const pushedComp of uniquePushed) {
              await updateComponentState(pushedComp.id, { transform: pushedComp.transform });
            }
            renderProjectDetails(state.activeProject);
          } catch (err) {
            showError(err);
          }
        }
      }
    }
  });

  viewportCanvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !state.activeProject || sceneState.meshEntries.size === 0) return;

    const rect = viewportCanvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    sceneState.raycaster.setFromCamera(mouse, sceneState.camera);
    const intersects = sceneState.raycaster.intersectObjects(Array.from(sceneState.meshEntries.values()));
    const visibleIntersects = intersects.filter(hit => hit.object.visible);

    if (visibleIntersects.length > 0) {
      const hitMesh = visibleIntersects[0].object;
      const componentId = hitMesh.userData.componentId;

      if (state.selectedComponentId !== componentId) {
        state.selectedComponentId = componentId;
        renderComponentList(state.activeProject.components);
        renderProjectDetails(state.activeProject);
        renderSettingsPanel();
        highlightSelectedMesh();
      }

      if (state.viewportTool === "move") {
        const component = state.activeProject.components.find(c => c.id === componentId);
        if (component && !component.locked) {
          sceneState.controls.enabled = false;
          
          state.drag = {
            componentId: component.id,
            mesh: hitMesh,
            startMouse: mouse.clone(),
            startComponentPos: { ...component.transform.position },
            plane: createDragPlane(hitMesh.position),
            intersectionOffset: new THREE.Vector3(),
            pushedThisMove: new Set()
          };
          
          positionUndoManager.recordPosition(component.id, { ...component.transform.position });

          const planeIntersect = new THREE.Vector3();
          sceneState.raycaster.ray.intersectPlane(state.drag.plane, planeIntersect);
          if (planeIntersect) {
            state.drag.intersectionOffset.copy(hitMesh.position).sub(planeIntersect);
          }
        }
      }
    }
  });

  viewportCanvas.addEventListener("pointermove", (event) => {
    if (!state.drag) return;

    const component = state.activeProject.components.find((item) => item.id === state.drag.componentId);
    if (!component) return;

    const rect = viewportCanvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    sceneState.raycaster.setFromCamera(mouse, sceneState.camera);
    const planeIntersect = new THREE.Vector3();
    sceneState.raycaster.ray.intersectPlane(state.drag.plane, planeIntersect);

    if (planeIntersect) {
      const targetPos = planeIntersect.add(state.drag.intersectionOffset);
      const allowed = getAllowedAxes(state.axisMode);
      
      const nextTransform = {
        position: {
          x: allowed.includes("x") ? targetPos.x : state.drag.startComponentPos.x,
          y: allowed.includes("y") ? targetPos.y : state.drag.startComponentPos.y,
          z: allowed.includes("z") ? targetPos.z : state.drag.startComponentPos.z,
        },
        rotation: { ...component.transform.rotation }
      };

      const result = tryApplyPhysicsTransform(component, nextTransform, { silent: false });
      
      if (!result.accepted) {
        state.physicsMessage = "Movement stopped by physical constraint.";
        renderProjectDetails(state.activeProject);
      } else {
        if (result.pushedComponents) {
          result.pushedComponents.forEach(c => state.drag.pushedThisMove.add(c.id));
        }
      }
    }
  });

  viewportCanvas.addEventListener("pointerup", async () => {
    if (state.drag) {
      const component = state.activeProject.components.find((item) => item.id === state.drag.componentId);
      sceneState.controls.enabled = true;
      const pushedCompIds = Array.from(state.drag.pushedThisMove);
      state.drag = null;

      if (component) {
        try {
          await updateComponentState(component.id, { transform: component.transform });
          for (const pid of pushedCompIds) {
            const pushedComp = state.activeProject.components.find(c => c.id === pid);
            if (pushedComp) {
              await updateComponentState(pushedComp.id, { transform: pushedComp.transform });
            }
          }
          renderProjectDetails(state.activeProject);
        } catch (err) {
          showError(err);
        }
      }
    }
  });

  viewportCanvas.addEventListener("pointercancel", () => {
    if (state.drag) {
      sceneState.controls.enabled = true;
      state.drag = null;
    }
  });

  NAV_PRESETS.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = \`nav-cube-\${preset.type}\`;
    button.title = preset.label;
    button.textContent = preset.type === "face" ? preset.label : "";
    button.style.top = \`\${preset.top}%\`;
    button.style.left = \`\${preset.left}%\`;

    button.addEventListener("click", () => {
      if (state.axisModeLocked) {
        const primary = state.axisMode === "xy" || state.axisMode === "z" ? "z" :
                        state.axisMode === "yz" || state.axisMode === "x" ? "x" : "y";
        if (preset.vector[2] !== 0 && primary !== "z") return;
        if (preset.vector[0] !== 0 && primary !== "x") return;
        if (preset.vector[1] !== 0 && primary !== "y") return;
      }
      orientCameraToVector(preset.vector);
    });

    navCube.append(button);
  });
}
