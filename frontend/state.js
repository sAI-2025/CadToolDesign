import * as THREE from "three";
import { STLLoader } from "/vendor/three/examples/jsm/loaders/STLLoader.js";

export function readPanelState() {
  try {
    return JSON.parse(window.localStorage.getItem("cadtool.panelState") || "{}");
  } catch {
    return {};
  }
}

const savedPanelState = readPanelState();

export const state = {
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

export const sceneState = {
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

export function getSelectedComponent() {
  return state.activeProject?.components.find((item) => item.id === state.selectedComponentId) || null;
}
