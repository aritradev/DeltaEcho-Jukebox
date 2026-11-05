import * as THREE from 'three';
import { gsap } from '../vendor/gsap/index.js';
import { STATES, TIMELINE, EARTH, FRAMING, CLOUDS, ATLAS } from './config.js';
import { sphericalToVector3, latLonToVector3, clamp, DEG } from './utils.js';

const WIDE = {
  dist: 10.8,
  azOffsetDeg: 128,
  elDeg: 15,
  fov: 56,
  focus: 0,
  offX: -0.278,
  offY: 0
};

const REGION_EL = 3.2 * DEG;

// One global multiplier keeps every transition in sync. Base durations live in
// `TIMELINE`; `scaled()` converts them to runtime seconds.
const SPEED = TIMELINE.speed || 1;
const scaled = (seconds) => seconds / SPEED;
const T = Object.fromEntries(
  Object.entries(TIMELINE)
    .filter(([key]) => key !== 'speed')
    .map(([key, value]) => [key, value / SPEED])
);

export class CameraDirector {
  constructor(camera, earth, region) {
    this.camera = camera;
    this.earth = earth;
    this.region = region;

    this.rig = {
      dist: WIDE.dist,
      az: 0,
      el: WIDE.elDeg * DEG,
      fov: WIDE.fov,
      focus: WIDE.focus,
      offX: WIDE.offX,
      offY: WIDE.offY
    };

    this.state = STATES.SOLAR_SYSTEM;
    this.timeline = null;
    this.locked = false;
    this.pendingComplete = null;

    this.spinScale = 0.55;
    this.cloudOpacity = CLOUDS.opacity.solarRest;
    this.veil = 0;
    this.regionVisibility = 0;
    this.coronaScale = 1;
    this.orbitLineFade = 0;

    const asia = ATLAS.levels.asia.start;
    const coxs = ATLAS.levels.coxs.start;
    this.atlasA = { u: asia.u, v: asia.v, zoom: asia.zoom, opacity: 0 };
    this.atlasB = { u: coxs.u, v: coxs.v, zoom: coxs.zoom, opacity: 0 };

    this.onStateChange = null;
    this.onComplete = null;

    this._pos = new THREE.Vector3();
    this._local = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._span = 1;
    this._forward = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._upAxis = new THREE.Vector3(0, 1, 0);
    this._sunLocal = new THREE.Vector3();

    const dir = latLonToVector3(region.config.lat, region.config.lon, 1);
    this.regionAz = Math.atan2(dir.x, dir.z);
    this.regionEl = Math.asin(clamp(dir.y, -1, 1));
    this.regionAzTilt = this.regionAz;
    this.regionElTilt = this.regionEl;

    this.setWideAzimuth();
  }

  setWideAzimuth() {
    this.earth.getLocalSunDirectionTilt(this._sunLocal);
    this.wideAz = Math.atan2(this._sunLocal.x, this._sunLocal.z) + WIDE.azOffsetDeg * DEG;
    this.rig.az = this.wideAz;
  }

  refreshRegionTilt() {
    const { az, el } = this.earth.getRegionAzElTilt();
    this.regionAzTilt = az;
    this.regionElTilt = el;
  }

  solveSunFraming(earthBody) {
    const earth = this.earth;
    const dir = this._sunLocal;
    const targetAz = this.regionAz + FRAMING.sunAzimuthFromRegionDeg * DEG;

    earth.setSpin(0);
    earth.refresh();
    earth.getLocalSunDirection(dir);
    earthBody.def.startAngle = 0;
    earthBody.pivot.rotation.y = 0;
    earth.setSpin(Math.atan2(dir.x, dir.z) - targetAz);
    this.setWideAzimuth();
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    if (this.onStateChange) this.onStateChange(state);
  }

  introDolly(duration) {
    const seconds = scaled(duration);
    return gsap.fromTo(
      this.rig,
      {
        dist: WIDE.dist + 4.4,
        fov: WIDE.fov + 5,
        offX: -0.145,
        offY: -0.026
      },
      {
        dist: WIDE.dist,
        fov: WIDE.fov,
        offX: WIDE.offX,
        offY: WIDE.offY,
        duration: seconds,
        ease: 'power2.out'
      }
    );
  }

  nearestAligned(from, to) {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return from + delta;
  }

  apply() {
    const { camera, rig } = this;
    const center = this.earth.center;

    sphericalToVector3(rig.dist * EARTH.radius, rig.az, rig.el, this._local);
    this._pos.copy(this._local).applyQuaternion(this.earth.orbitFrameQuaternion(this._quat)).add(center);

    this.earth.getRegionWorldPosition(this._target);
    this._look.copy(center).lerp(this._target, rig.focus);

    this._forward.subVectors(this._look, this._pos).normalize();
    this._span = Math.max(0.2, this._pos.distanceTo(this._look));
    this._right.crossVectors(this._forward, this._upAxis);
    if (this._right.lengthSq() < 1e-8) this._right.set(1, 0, 0);
    this._right.normalize();
    this._up.crossVectors(this._right, this._forward).normalize();

    this._look.addScaledVector(this._right, rig.offX * this._span);
    this._look.addScaledVector(this._up, rig.offY * this._span);

    camera.position.copy(this._pos);
    camera.lookAt(this._look);

    if (Math.abs(camera.fov - rig.fov) > 1e-4) {
      camera.fov = rig.fov;
      camera.updateProjectionMatrix();
    }
  }

  scheduleState(tl, state, time) {
    tl.call(() => this.setState(state), null, time);
  }

  buildRegionSequence(tl, time) {
    const rig = this.rig;
    this.refreshRegionTilt();
    const alignAz = this.nearestAligned(rig.az, this.regionAzTilt);
    const approach = T.regionApproach;
    const cloud = T.cloudEntry;

    this.scheduleState(tl, STATES.REGION_APPROACH, time);
    tl.to(rig, { dist: 1.44, duration: approach, ease: 'power2.in' }, time);
    tl.to(rig, { az: alignAz, duration: approach, ease: 'power2.inOut' }, time);
    tl.to(rig, { el: this.regionElTilt + REGION_EL, duration: approach, ease: 'power2.inOut' }, time);
    tl.to(rig, { fov: 47, duration: approach, ease: 'power2.inOut' }, time);
    tl.to(rig, { focus: 1, duration: approach * 0.8, ease: 'power2.inOut' }, time);
    tl.to(rig, { offX: -0.028, offY: 0.06, duration: approach, ease: 'power2.inOut' }, time);
    tl.to(this, { spinScale: 0.55, duration: approach * 0.55, ease: 'power2.out' }, time);
    tl.to(this, { regionVisibility: 0.14, duration: approach * 0.6, ease: 'power1.in' }, time);
    tl.to(this, { cloudOpacity: CLOUDS.opacity.regionApproach, duration: approach, ease: 'power1.inOut' }, time);
    tl.to(this, { orbitLineFade: 1, duration: scaled(1.6) }, time);

    let t = time + approach;
    this.scheduleState(tl, STATES.CLOUD_ENTRY, t);
    tl.to(rig, { dist: 1.052, duration: cloud, ease: 'power1.in' }, t);
    tl.to(rig, { fov: 53, duration: cloud, ease: 'power1.in' }, t);
    tl.to(rig, { offX: 0, offY: 0.03, duration: cloud, ease: 'power1.in' }, t);
    tl.to(this, { veil: 0.9, duration: cloud * 0.55, ease: 'power2.in' }, t);
    tl.to(this, { cloudOpacity: CLOUDS.opacity.cloudEntry, duration: cloud * 0.5, ease: 'power1.in' }, t);
    tl.to(this, { regionVisibility: 0.1, duration: cloud * 0.5, ease: 'power2.in' }, t);

    t += cloud;
    const asia = ATLAS.levels.asia;
    const coxs = ATLAS.levels.coxs;

    // The veil is still up from cloud entry: the globe hands over to the flat
    // Asia map underneath it, so the swap is never seen.
    this.scheduleState(tl, STATES.CONTINENT, t);
    tl.set(this.atlasA, { u: asia.start.u, v: asia.start.v, zoom: asia.start.zoom }, t);
    tl.set(this.atlasB, { opacity: 0 }, t);
    tl.to(this.atlasA, { opacity: 1, duration: T.continent * 0.5, ease: 'power2.out' }, t);
    tl.to(this.atlasA, { zoom: asia.start.zoom * 1.15, duration: T.continent, ease: 'sine.inOut' }, t);
    tl.to(this, { veil: 0, duration: T.continent * 0.78, ease: 'power2.out' }, t);
    tl.to(this, { cloudOpacity: CLOUDS.opacity.regionReveal, duration: T.continent * 0.7, ease: 'power1.out' }, t);

    t += T.continent;
    this.scheduleState(tl, STATES.COUNTRY, t);
    tl.to(this.atlasA, { u: asia.end.u, v: asia.end.v, duration: T.country, ease: 'power3.out' }, t);
    tl.to(this.atlasA, { zoom: asia.end.zoom, duration: T.country, ease: 'power2.inOut' }, t);

    // Bangladesh dissolves into the beach: the incoming plate fades up while the
    // outgoing one keeps diving, so the jump in scale reads as a fall, not a cut.
    t += T.country;
    tl.set(this.atlasB, { u: coxs.start.u, v: coxs.start.v, zoom: coxs.start.zoom }, t);
    tl.to(this.atlasB, { opacity: 1, duration: T.dissolve, ease: 'power2.inOut' }, t);
    tl.to(this.atlasA, { opacity: 0, duration: T.dissolve * 0.8, ease: 'power2.in' }, t + T.dissolve * 0.2);
    tl.to(this.atlasA, { zoom: asia.end.zoom * 1.4, duration: T.dissolve, ease: 'power2.in' }, t);
    tl.to(this, { veil: 0.34, duration: T.dissolve * 0.45, ease: 'power2.in' }, t);
    tl.to(this, { veil: 0, duration: T.dissolve * 0.8, ease: 'power2.out' }, t + T.dissolve * 0.45);

    t += T.dissolve;
    this.scheduleState(tl, STATES.LOCALITY, t);
    tl.to(
      this.atlasB,
      { u: coxs.end.u, v: coxs.end.v, zoom: coxs.end.zoom, duration: T.locality, ease: 'power2.out' },
      t
    );

    return t + T.locality;
  }

  beginFlight(onComplete) {
    this.killTimeline();
    this.locked = true;
    this.pendingComplete = onComplete || null;

    const rig = this.rig;
    this.refreshRegionTilt();
    const startAz = rig.az;
    const orbitAz = this.nearestAligned(startAz, this.regionAzTilt + 0.3);

    const tl = gsap.timeline({
      onComplete: () => {
        this.timeline = null;
        this.locked = false;
        const fn = this.pendingComplete;
        this.pendingComplete = null;
        if (fn) fn();
      }
    });

    const t0 = T.acknowledge;
    this.scheduleState(tl, STATES.EARTH_APPROACH, t0);
    tl.to(rig, { dist: 5.1, duration: T.approach, ease: 'power1.inOut' }, t0);
    tl.to(rig, { el: 11.5 * DEG, duration: T.approach, ease: 'power1.inOut' }, t0);
    tl.to(rig, { fov: 45, duration: T.approach, ease: 'power1.inOut' }, t0);
    tl.to(rig, { offX: 0.02, offY: 0.01, duration: T.approach, ease: 'power2.inOut' }, t0);
    tl.to(rig, { focus: 0.45, duration: T.approach, ease: 'power1.inOut' }, t0);
    tl.to(this, { cloudOpacity: CLOUDS.opacity.earthApproach, duration: T.approach * 0.9, ease: 'power1.in' }, t0);
    tl.to(this, { spinScale: 0.62, duration: T.approach * 0.5, ease: 'power2.out' }, t0);
    tl.to(this, { coronaScale: 0.85, duration: T.approach }, t0);
    tl.to(this, { orbitLineFade: 0.55, duration: T.approach }, t0);

    let t = t0 + T.approach;
    this.scheduleState(tl, STATES.EARTH_ORBIT, t);
    tl.to(rig, { dist: 2.7, duration: T.orbit, ease: 'power2.inOut' }, t);
    tl.to(rig, { az: orbitAz, duration: T.orbit, ease: 'power2.inOut' }, t);
    tl.to(rig, { el: 15 * DEG, duration: T.orbit, ease: 'power2.inOut' }, t);
    tl.to(rig, { fov: 40, duration: T.orbit, ease: 'power2.inOut' }, t);
    tl.to(rig, { focus: 0.85, duration: T.orbit, ease: 'power2.inOut' }, t);
    tl.to(rig, { offX: 0, offY: 0.022, duration: T.orbit, ease: 'power2.inOut' }, t);
    tl.to(this, { cloudOpacity: CLOUDS.opacity.earthOrbit, duration: T.orbit, ease: 'power1.inOut' }, t);
    tl.to(this, { spinScale: 0.55, duration: T.orbit * 0.5, ease: 'power2.out' }, t + T.orbit * 0.2);

    this.buildRegionSequence(tl, t + T.orbit);

    this.timeline = tl;
    return tl;
  }

  continueToRegion(onComplete) {
    this.killTimeline();
    this.locked = true;
    this.pendingComplete = onComplete || null;
    const tl = gsap.timeline({
      onComplete: () => {
        this.timeline = null;
        this.locked = false;
        const fn = this.pendingComplete;
        this.pendingComplete = null;
        if (fn) fn();
      }
    });
    this.buildRegionSequence(tl, 0);
    this.timeline = tl;
    return tl;
  }

  // Abandons whatever is playing and cuts straight to the end of the region
  // sequence: the flat beach map, fully zoomed. The veil flashes once so the
  // jump reads as a deliberate cut rather than a glitch, then fades to reveal
  // the destination. `onComplete` fires when the reveal is visible.
  skipToRegion(onComplete) {
    this.killTimeline();
    this.locked = false;
    this.pendingComplete = null;
    this.refreshRegionTilt();

    const coxs = ATLAS.levels.coxs;
    const rig = this.rig;
    rig.dist = 1.052;
    rig.az = this.regionAzTilt;
    rig.el = this.regionElTilt + REGION_EL;
    rig.fov = 53;
    rig.focus = 1;
    rig.offX = 0;
    rig.offY = 0.03;

    this.spinScale = 0.55;
    this.regionVisibility = 0.1;
    this.cloudOpacity = CLOUDS.opacity.regionReveal;
    this.orbitLineFade = 1;
    this.coronaScale = 0.85;

    // Only the beach plate is up at the end of the sequence; the Asia plate has
    // already faded out beneath it.
    this.atlasA.opacity = 0;
    this.atlasB.u = coxs.end.u;
    this.atlasB.v = coxs.end.v;
    this.atlasB.zoom = coxs.end.zoom;
    this.atlasB.opacity = 1;

    this.setState(STATES.LOCALITY);
    this.veil = 0.85;
    return gsap.to(this, {
      veil: 0,
      duration: scaled(0.7),
      ease: 'power2.out',
      onComplete: () => {
        if (onComplete) onComplete();
      }
    });
  }

  enterFreeOrbit(options = {}) {
    this.killTimeline();
    this.locked = false;
    const rig = this.rig;
    const duration = scaled(options.duration ?? 3.4);
    this.refreshRegionTilt();
    const az = options.keepAz ? rig.az : this.nearestAligned(rig.az, options.az ?? this.regionAzTilt);

    this.setState(options.state ?? STATES.EARTH_ORBIT);
    gsap.to(rig, {
      dist: options.dist ?? 3.2,
      el: (options.elDeg ?? 17) * DEG,
      fov: options.fov ?? 42,
      focus: options.focus ?? 0.85,
      offX: options.offX ?? 0,
      offY: options.offY ?? 0.023,
      az,
      duration,
      ease: 'power2.inOut',
      onComplete: () => {
        if (this.onComplete) this.onComplete();
      }
    });
    gsap.to(this, {
      spinScale: options.spinScale ?? 0.55,
      cloudOpacity: options.cloudOpacity ?? CLOUDS.opacity.freeOrbit,
      regionVisibility: options.regionVisibility ?? 0.85,
      orbitLineFade: 1,
      duration,
      ease: 'power2.inOut'
    });
  }

  returnToSolarSystem(onComplete) {
    this.killTimeline();
    this.locked = true;
    const rig = this.rig;
    const wideAz = this.wideAz;

    const tl = gsap.timeline({
      onComplete: () => {
        this.timeline = null;
        this.locked = false;
        this.setState(STATES.SOLAR_SYSTEM);
        if (onComplete) onComplete();
      }
    });

    this.scheduleState(tl, STATES.CONTINENT, 0);
    tl.to([this.atlasA, this.atlasB], { opacity: 0, duration: scaled(0.9), ease: 'power2.in' }, 0);
    tl.to(this, { regionVisibility: 0, duration: scaled(1.8), ease: 'power2.in' }, 0);
    tl.to(this, { veil: 0, duration: scaled(1.2) }, 0);
    tl.to(this, { cloudOpacity: CLOUDS.opacity.returnReveal, duration: scaled(2.2), ease: 'power1.inOut' }, 0);
    tl.to(this, { spinScale: 0.55, duration: scaled(2), ease: 'power2.out' }, 0);
    tl.to(rig, { dist: 2.6, fov: 44, offX: 0, offY: 0.023, duration: scaled(3.2), ease: 'power2.inOut' }, 0);

    this.scheduleState(tl, STATES.EARTH_APPROACH, scaled(2.6));
    tl.to(rig, { dist: 5.2, fov: 46, focus: 0.45, duration: scaled(4.4), ease: 'power2.inOut' }, scaled(2.6));
    tl.to(rig, { el: 12 * DEG, az: wideAz, duration: scaled(4.4), ease: 'power2.inOut' }, scaled(2.6));
    tl.to(this, { cloudOpacity: CLOUDS.opacity.returnApproach, duration: scaled(4.4), ease: 'power1.out' }, scaled(2.6));
    tl.to(this, { spinScale: 0.55, duration: scaled(4), ease: 'power2.out' }, scaled(2.6));
    tl.to(this, { orbitLineFade: 0, duration: scaled(4) }, scaled(2.6));
    tl.to(this, { coronaScale: 1, duration: scaled(4) }, scaled(2.6));

    this.scheduleState(tl, STATES.SOLAR_SYSTEM, scaled(6.4));
    tl.to(rig, {
      dist: WIDE.dist,
      fov: WIDE.fov,
      focus: WIDE.focus,
      offX: WIDE.offX,
      offY: WIDE.offY,
      el: WIDE.elDeg * DEG,
      az: wideAz,
      duration: scaled(5.6),
      ease: 'power2.inOut'
    }, scaled(5.4));
    tl.to({}, { duration: scaled(0.1) }, scaled(11.0));

    this.timeline = tl;
    return tl;
  }

  // Leaves the flat map and flies back out. When no map is up this is just the
  // ordinary return, so callers do not need to know which mode they were in.
  exitAtlas(onComplete) {
    if (!this.atlasVisible) {
      this.returnToSolarSystem(onComplete);
      return null;
    }
    this.killTimeline();
    const duration = scaled(0.5);
    gsap.to(this, { veil: 1, duration, ease: 'power2.in' });
    return gsap.to([this.atlasA, this.atlasB], {
      opacity: 0,
      duration,
      ease: 'power2.in',
      onComplete: () => {
        this.atlasA.opacity = 0;
        this.atlasB.opacity = 0;
        const asia = ATLAS.levels.asia.start;
        const coxs = ATLAS.levels.coxs.start;
        this.atlasA.u = asia.u;
        this.atlasA.v = asia.v;
        this.atlasA.zoom = asia.zoom;
        this.atlasB.u = coxs.u;
        this.atlasB.v = coxs.v;
        this.atlasB.zoom = coxs.zoom;
        this.returnToSolarSystem(onComplete);
      }
    });
  }

  killTimeline() {
    if (this.timeline) this.timeline.kill();
    this.timeline = null;
    this.pendingComplete = null;
    gsap.killTweensOf(this.rig);
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.atlasA);
    gsap.killTweensOf(this.atlasB);
  }

  restoreSolarState(duration = scaled(0.9)) {
    gsap.to([this.atlasA, this.atlasB], {
      opacity: 0,
      duration,
      ease: 'power2.out',
      overwrite: 'auto'
    });
    gsap.to(this, {
      orbitLineFade: 0,
      regionVisibility: 0,
      coronaScale: 1,
      veil: 0,
      cloudOpacity: CLOUDS.opacity.solarRest,
      spinScale: 0.55,
      duration,
      ease: 'power2.out',
      overwrite: 'auto'
    });
  }

  interrupt() {
    if (!this.timeline) return false;
    this.killTimeline();
    this.locked = false;
    this.restoreSolarState();
    return true;
  }

  // True while any map plate is on screen; the 3D marker must stay quiet then.
  get atlasVisible() {
    return this.atlasA.opacity > 0.02 || this.atlasB.opacity > 0.02;
  }

  get isFlying() {
    return Boolean(this.timeline);
  }
}
