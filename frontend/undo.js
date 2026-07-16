export class PositionUndoManager {
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

export const positionUndoManager = new PositionUndoManager();
