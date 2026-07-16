import * as THREE from "three";
import { OrbitControls } from "/vendor/three/examples/jsm/controls/OrbitControls.js";
import { OBB } from "/vendor/three/examples/jsm/math/OBB.js";
import { state, sceneState } from "./state.js";
import { getAllowedAxes, activeAxisColor } from "./utils.js";
import { viewportCanvas } from "./dom.js";
import { setViewportMessage, setViewportLoading, hideViewportLoading } from "./ui.js";
import { requestBuffer } from "./api.js";

export function initializeViewer() {
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

    const nameLabel = createAxisNameLabel(axis.toUpperCase(), meta.color);
    nameLabel.position.copy(meta.dir.clone().multiplyScalar(195));
    nameLabel.userData.axisKey = axis;
    nameLabel.userData.isAxisName = true;
    group.add(nameLabel);

    for (let step = -150; step <= 150; step += 50) {
      if (step === 0) continue;

      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshBasicMaterial({ color: meta.color }),
      );
      tick.position.copy(meta.dir.clone().multiplyScalar(step));
      tick.userData.axisKey = axis;
      tick.userData.tickValue = step;
      group.add(tick);

      const label = createAxisLabel(\`\${step}\`, meta.color);
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
  context.fillStyle = \`#\${color.toString(16).padStart(6, "0")}\`;
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

export function updateAxisGuides() {
  const allowed = getAllowedAxes(state.axisMode);
  state.rulerStep = chooseRulerStep();

  sceneState.axisGuides.children.forEach((child) => {
    const axis = child.userData.axisKey;
    if (!axis) return;

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
  if (!sceneState.camera) return 50;

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
  context.fillText(\`\${position}\`, canvas.width / 2, canvas.height / 2 - 8);
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

export function onResize() {
  const width = viewportCanvas.clientWidth;
  const height = Math.max(viewportCanvas.clientHeight, 1);
  sceneState.camera.aspect = width / height;
  sceneState.camera.updateProjectionMatrix();
  sceneState.renderer.setSize(width, height);
}

export async function loadProjectIntoScene(project) {
  clearSceneMeshes();
  if (project.components.length === 0) {
    hideViewportLoading();
    setViewportMessage("No STL components loaded", "Import one or more \`.stl\` files.");
    const viewportEmpty = document.querySelector("#viewportEmpty");
    viewportEmpty.hidden = false;
    return;
  }

  setViewportLoading(0, project.components.length);

  let loadedCount = 0;
  try {
    for (const component of project.components) {
      try {
        const buffer = await requestBuffer(\`/api/projects/\${project.id}/components/\${component.id}/asset\`);
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

  const viewportEmpty = document.querySelector("#viewportEmpty");
  viewportEmpty.hidden = sceneState.meshEntries.size > 0;
  if (sceneState.meshEntries.size === 0) {
    setViewportMessage("STL components could not be displayed", "Check the import warnings and try again.");
  }
  centerCameraOnMeshes();
  syncMeshVisibility();
  highlightSelectedMesh();
}

export function clearSceneMeshes() {
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

export function applyMeshTransform(component, providedMesh = null) {
  const mesh = providedMesh || sceneState.meshEntries.get(component.id);
  if (!mesh) return;

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

export function orientCameraToVector(vector) {
  const target = sceneState.controls.target.clone();
  const direction = new THREE.Vector3(...vector).normalize();
  const distance = sceneState.camera.position.distanceTo(target);
  const nextPosition = target.clone().add(direction.multiplyScalar(distance));
  sceneState.camera.position.copy(nextPosition);
  sceneState.camera.lookAt(target);
}

export function syncMeshVisibility() {
  if (!state.activeProject) return;
  for (const component of state.activeProject.components) {
    const mesh = sceneState.meshEntries.get(component.id);
    if (mesh) {
      mesh.visible = component.visible;
    }
  }
}

export function highlightSelectedMesh() {
  if (!state.activeProject) return;
  for (const component of state.activeProject.components) {
    const mesh = sceneState.meshEntries.get(component.id);
    if (!mesh) continue;
    mesh.material.color.setHex(component.id === state.selectedComponentId ? 0x0f766e : 0x6d7a73);
  }
}

export function createDragPlane(origin) {
  const normal = new THREE.Vector3();
  sceneState.camera.getWorldDirection(normal);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
}
