export const AXIS_MODES = [
  { id: "x", label: "Set to X-Axis", type: "axis", axes: ["x"] },
  { id: "y", label: "Set to Y-Axis", type: "axis", axes: ["y"] },
  { id: "z", label: "Set to Z-Axis", type: "axis", axes: ["z"] },
  { id: "xy", label: "Set to X-Y Plane", type: "plane", axes: ["x", "y"] },
  { id: "yz", label: "Set to Y-Z Plane", type: "plane", axes: ["y", "z"] },
  { id: "zx", label: "Set to Z-X Plane", type: "plane", axes: ["z", "x"] },
  { id: "xyz", label: "Set to XYZ (3D)", type: "all", axes: ["x", "y", "z"] },
];

export const NAV_PRESETS = [
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
