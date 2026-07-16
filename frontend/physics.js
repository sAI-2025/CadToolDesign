import * as THREE from "three";
import { state, sceneState, getSelectedComponent } from "./state.js";
import { getAllowedAxes, showError } from "./utils.js";
import { updateComponentState } from "./api.js";
import { positionUndoManager } from "./undo.js";
import { renderProjectDetails, hideContextMenu } from "./ui.js";
import { applyMeshTransform } from "./viewer.js";

export async function submitTransformEditor() {
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
      state.physicsMessage = \`Movement stopped early by physical constraint. (\${successCount}/\${steps} steps)\`;
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

export function tryApplyPhysicsTransform(component, nextTransform, options = {}, visited = new Set()) {
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

export function revertPhysicsTransform(component, pushResult) {
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
