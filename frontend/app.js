import { state, sceneState } from "./state.js";
import { showError } from "./utils.js";
import { loadProjects } from "./api.js";
import { applyProjectListVisibility, applySidebarVisibility, setViewportTool, hideContextMenu } from "./ui.js";
import { initializeViewer, onResize } from "./viewer.js";
import { bindEvents } from "./events.js";

async function initializeApp() {
  try {
    initializeViewer();
    applyProjectListVisibility();
    applySidebarVisibility();
    setViewportTool("select");
    hideContextMenu();
    
    bindEvents();
    
    await loadProjects();
    
    window.addEventListener("error", (event) => {
      showError(event.error || new Error(event.message));
    });
    
    window.addEventListener("unhandledrejection", (event) => {
      showError(event.reason);
    });
  } catch (error) {
    showError(error);
  }
}

document.addEventListener("DOMContentLoaded", initializeApp);
