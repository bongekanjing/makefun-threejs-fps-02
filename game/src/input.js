// Keyboard + mouse (pointer lock) input. The game never reads the mouse
// without pointer lock; clicking the canvas requests it.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.mouseDown = false;
    this.mouseDownRight = false;
    this.locked = false;
    this._pressed = new Set();
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this._pressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.mouseDownRight = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseDownRight = false;
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.mouseDown = false;
        this.mouseDownRight = false;
      }
    };
    this._onContext = (e) => e.preventDefault();
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    this.canvas.addEventListener('contextmenu', this._onContext);
  }

  requestLock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
    } catch {
      try { this.canvas.requestPointerLock(); } catch { /* pointer lock unavailable */ }
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** True once for the frame the key went down; call after reading each frame. */
  pressed(code) {
    return this._pressed.has(code);
  }

  endFrame() {
    this.lookDX = 0;
    this.lookDY = 0;
    this._pressed.clear();
  }
}
