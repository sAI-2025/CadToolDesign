import { AXIS_MODES } from "./constants.js";
import { inspectorTitle, projectDetails } from "./dom.js";

export function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatAxisValue(value) {
  return Number(value || 0).toFixed(1);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function showError(error) {
  inspectorTitle.textContent = "Local app error";
  projectDetails.innerHTML = `
    <div>
      <dt>Message</dt>
      <dd>${escapeHtml(error.message)}</dd>
    </div>
  `;
}

export function createEmptyRow(message) {
  const row = document.createElement("div");
  row.className = "empty-row";
  row.textContent = message;
  return row;
}

export function getAllowedAxes(modeId) {
  return AXIS_MODES.find((mode) => mode.id === modeId)?.axes || ["x", "y", "z"];
}

export function describeAxisMode(modeId) {
  return AXIS_MODES.find((mode) => mode.id === modeId)?.label || "Set to XYZ (3D)";
}

export function activeAxisColor(axis) {
  if (axis === "x") return 0xd14343;
  if (axis === "y") return 0x0f766e;
  return 0x2563eb;
}

export function vectorToTransform(vector) {
  return { x: vector.x, y: vector.y, z: vector.z };
}
