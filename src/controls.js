import { clamp, TAU } from './utils.js';

const MIN_DIST = 1.055;
const MAX_DIST = 15;
const MIN_EL = -72 * (Math.PI / 180);
const MAX_EL = 78 * (Math.PI / 180);

export class ExplorerControls {
  constructor(camera, domElement, director) {
    this.camera = camera;
    this.dom = domElement;
    this.director = director;
    this.rig = director.rig;

    this.enabled = true;
    this.dragging = false;
    this.pointerId = null;
    this.pointers = new Map();
    this.pinchDistance = 0;
    this.dragged = false;
    this.onUserIntent = null;
    this.onPointerMove = null;
    this.hoverEnabled = false;

    this.velAz = 0;
    this.velEl = 0;
    this.velDist = 0;

    this.bind();
  }

  bind() {
    const dom = this.dom;
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMoveHandler);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  onPointerDown = (event) => {
    if (!this.enabled) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 1) {
      this.dragging = true;
      this.dragged = false;
      this.pointerId = event.pointerId;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.velAz = 0;
      this.velEl = 0;
      this.dom.setPointerCapture(event.pointerId);
      document.body.classList.add('grabbing');
    } else if (this.pointers.size === 2) {
      this.pinchDistance = this.currentPinchDistance();
    }
  };

  onPointerMoveHandler = (event) => {
    if (this.pointers.has(event.pointerId)) {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (this.onPointerMove) this.onPointerMove(event);

    if (!this.enabled) return;

    if (this.pointers.size === 2) {
      const distance = this.currentPinchDistance();
      if (this.pinchDistance > 0) {
        const delta = (this.pinchDistance - distance) * 0.004;
        this.notifyIntent();
        this.zoomBy(delta);
      }
      this.pinchDistance = distance;
      return;
    }

    if (!this.dragging || event.pointerId !== this.pointerId) return;

    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;

    if (Math.abs(dx) + Math.abs(dy) > 2) this.dragged = true;
    if (!this.dragged) return;

    this.notifyIntent();
    const speed = 0.0042 * clamp(this.rig.dist / 3, 0.4, 1.6);
    this.rig.az -= dx * speed;
    this.rig.el = clamp(this.rig.el + dy * speed * 0.86, MIN_EL, MAX_EL);
    this.velAz = -dx * speed;
    this.velEl = dy * speed * 0.86;
  };

  onPointerUp = (event) => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchDistance = 0;
    if (event.pointerId === this.pointerId || this.pointers.size === 0) {
      this.dragging = false;
      this.pointerId = null;
      document.body.classList.remove('grabbing');
    }
  };

  onWheel = (event) => {
    if (!this.enabled) return;
    event.preventDefault();
    this.notifyIntent();
    this.zoomBy(event.deltaY * 0.0012);
  };

  currentPinchDistance() {
    const values = [...this.pointers.values()];
    if (values.length < 2) return 0;
    return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  }

  notifyIntent() {
    if (this.onUserIntent) this.onUserIntent();
  }

  zoomBy(amount) {
    this.rig.dist = clamp(this.rig.dist * (1 + amount), MIN_DIST, MAX_DIST);
  }

  nudge(distanceFactor) {
    this.rig.dist = clamp(this.rig.dist * distanceFactor, MIN_DIST, MAX_DIST);
  }

  setEnabled(value) {
    this.enabled = value;
    if (!value) {
      this.dragging = false;
      document.body.classList.remove('grabbing');
    }
  }

  update(delta) {
    if (this.dragging || this.director.locked) {
      this.velAz *= 0.86;
      this.velEl *= 0.86;
      return;
    }
    if (Math.abs(this.velAz) < 1e-5 && Math.abs(this.velEl) < 1e-5) return;
    this.rig.az = (this.rig.az + this.velAz * delta * 12) % TAU;
    this.rig.el = clamp(this.rig.el + this.velEl * delta * 12, MIN_EL, MAX_EL);
    this.velAz *= 0.9;
    this.velEl *= 0.9;
  }
}
