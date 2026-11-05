import * as THREE from 'three';
import { gsap } from '../vendor/gsap/index.js';
import { RENDER, SUN, EARTH, STATES, TIMELINE } from './config.js';
import { clamp, smoothstep, DEG } from './utils.js';
import { AssetLoader } from './assets.js';
import { Starfield } from './starfield.js';
import { SolarSystem } from './solar-system.js';
import { Earth } from './earth.js';
import { RegionMarker } from './region.js';
import { Atlas } from './atlas.js';
import { CameraDirector } from './camera-director.js';
import { ExplorerControls } from './controls.js';
import { SpaceDive } from './space-dive.js';
import { UI } from './ui.js';

const MODE = {
  SOLAR: 'solar',
  EXPLORE: 'explore',
  FLYING: 'flying',
  ATLAS: 'atlas'
};

class App {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.mode = MODE.SOLAR;
    this.started = false;
    this.skipping = false;
    this.hoveringHotspot = false;
    this.hotspotArmed = false;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-10, -10);
    this.pointerInside = false;
    this._world = new THREE.Vector3();
    this._projected = new THREE.Vector3();
    this._hit = new THREE.Vector3();
  }

  async init() {
    this.ui = new UI({
      onSelect: (category) => this.onSelect(category),
      onBack: () => this.onBack(),
      onSkip: () => this.onSkip()
    });

    this.loaderEffect = new SpaceDive(document.getElementById('loader-scene'));
    this.loaderEffect.start();

    this.ui.setLoaderSub('Loading observatory imagery\u2026');
    const loader = new AssetLoader((ratio) => this.ui.setProgress(ratio * 0.96));
    this.textures = await loader.loadAll();
    this.ui.setProgress(0.98);

    this.buildRenderer();
    this.buildScene();
    this.buildWorld();
    this.bindEvents();
    this.ui.setProgress(1);

    // Compile shaders and upload textures while the loader still covers the
    // scene, so the reveal does not inherit a first-frame stall.
    this.renderer.compile(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);

    this.clock.start();
    this.onEnter();
    this.loop();
  }

  buildRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = RENDER.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  buildScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      RENDER.fov,
      window.innerWidth / window.innerHeight,
      RENDER.near,
      RENDER.far
    );
    this.scene.add(this.camera);
  }

  buildWorld() {
    const pixelRatio = this.renderer.getPixelRatio();

    this.starfield = new Starfield(pixelRatio, this.textures['smoke.png']);
    this.scene.add(this.starfield.group);

    this.solar = new SolarSystem(this.textures, this.renderer);
    this.scene.add(this.solar.group);

    this.sunLight = new THREE.PointLight(0xfff3e2, SUN.lightIntensity, 0, 0);
    this.scene.add(this.sunLight);

    this.ambient = new THREE.AmbientLight(0x35558a, SUN.ambient);
    this.scene.add(this.ambient);

    this.hemi = new THREE.HemisphereLight(0x24406e, 0x05070c, 0.16);
    this.scene.add(this.hemi);

    const body = this.solar.planets.find((p) => p.def.key === 'earth');
    this.earth = new Earth(this.textures, body.spin, this.solar.sunPosition);
    this.earthBody = body;
    this.earthBody.tiltGroup.rotation.z = EARTH.axisTiltDeg * DEG;
    this.earth.spinAngle = EARTH.startSpinDeg * DEG;

    this.region = new RegionMarker(this.earth);
    this.region.setPixelRatio(pixelRatio);
    this.earth.setRegionLocalDirection(this.region.localDirection);
    this.earth.refresh();

    this.scene.updateMatrixWorld(true);

    this.director = new CameraDirector(this.camera, this.earth, this.region);
    this.director.solveSunFraming(this.earthBody);
    this.director.onStateChange = (state) => this.onStateChange(state);
    this.director.punch = 0;

    this.controls = new ExplorerControls(this.camera, this.canvas, this.director);
    this.controls.onUserIntent = () => this.onUserIntent();

    this.atlas = new Atlas(this.camera, this.textures);
    this.camera.add(this.atlas.group);

    this.director.apply();
    this.ui.setReadoutState(`01 \u00b7 ${STATES.SOLAR_SYSTEM.name}`);
  }

  bindEvents() {
    window.addEventListener('resize', () => this.onResize());
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerenter', () => {
      this.pointerInside = true;
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.pointerInside = false;
      this.pointer.set(-10, -10);
    });
    this.canvas.addEventListener('click', () => this.onCanvasClick());
    window.addEventListener('keydown', (event) => this.onKey(event));
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const ratio = this.renderer.getPixelRatio();
    this.starfield.setPixelRatio(ratio);
    this.region.setPixelRatio(ratio);
  }

  onEnter() {
    if (this.started) return;
    this.started = true;
    if (this.loaderEffect) this.loaderEffect.boost(2.4);
    const fade = this.ui.dismissLoader();
    if (fade && fade.then) {
      fade.then(() => {
        if (this.loaderEffect) this.loaderEffect.stop();
        this.ui.scheduleVeilNoise();
      });
    } else if (this.loaderEffect) {
      this.loaderEffect.stop();
      this.ui.scheduleVeilNoise();
    }
    this.ui.setPanelEnabled(true);
    this.controls.setEnabled(true);
    this.director.introDolly(5.2);
    this.ui.showHint('Select what you want to hear', 6);
    window.setTimeout(() => {
      if (this.mode === MODE.SOLAR) this.ui.showHint('Or click Earth to move closer', 4.5);
    }, 8200);
  }

  onSelect(category) {
    if (!this.started || this.mode === MODE.FLYING) return;
    this.ui.setActiveCategory(category ? category.key : 'place');
    this.ui.showSelectionNote(category);
    this.ui.setPanelEnabled(false);
    this.mode = MODE.FLYING;
    this.hotspotArmed = false;
    this.region.setHover(0);
    this.ui.showSkip();
    this.director.beginFlight(() => this.onFlightComplete());
    const speed = TIMELINE.speed || 1;
    window.setTimeout(() => this.ui.hidePanel(1.6 / speed), 1700 / speed);
  }

  onFlightComplete() {
    this.mode = MODE.ATLAS;
    this.skipping = false;
    this.hotspotArmed = false;
    this.region.setHover(0);
    this.ui.setAnchor(0, 0, false);
    this.ui.hideSelectionNote();
    this.ui.hideSkip();
    this.ui.showDestination();
    this.controls.setEnabled(false);
    this.ui.showHint("Cox's Bazar \u00b7 listening arrives in a later phase", 6.5);
  }

  onBack() {
    if (this.mode === MODE.FLYING) return;
    this.mode = MODE.FLYING;
    this.hotspotArmed = false;
    this.region.setHover(0);
    this.ui.hideDestination(0.8);
    this.ui.hideSelectionNote();
    this.ui.setPanelEnabled(false);
    this.ui.setAnchor(0, 0, false);
    this.director.exitAtlas(() => {
      this.mode = MODE.SOLAR;
      this.skipping = false;
      this.controls.setEnabled(true);
      this.ui.setActiveCategory(null);
      this.ui.showPanel(1.4);
      this.ui.setPanelEnabled(true);
      this.ui.showHint('Observatory view', 3.5);
    });
  }

  onSkip() {
    if (!this.started || this.skipping || this.mode !== MODE.FLYING) return;
    this.skipping = true;
    this.mode = MODE.FLYING;
    this.hotspotArmed = false;
    this.hoveringHotspot = false;
    this.region.setHover(0);
    this.ui.setAnchor(0, 0, false);
    this.ui.hidePanel(0.4);
    this.ui.hideSelectionNote();
    this.ui.setPanelEnabled(false);
    this.ui.hideSkip(0.3);
    this.controls.setEnabled(false);
    document.body.classList.remove('grab', 'pointing');
    this.ui.showHint("Skipping to Cox's Bazar", 2.2);
    this.director.skipToRegion(() => this.onFlightComplete());
  }

  onUserIntent() {
    if (this.mode !== MODE.FLYING) return;
    if (!this.director.interrupt()) return;
    const near = this.director.rig.dist < 6;
    this.mode = near ? MODE.EXPLORE : MODE.SOLAR;
    this.ui.hideSkip();
    this.ui.hideSelectionNote();
    this.ui.showPanel(1.2);
    this.ui.setPanelEnabled(true);
    this.hotspotArmed = near;
    this.ui.showHint('Flight interrupted \u00b7 manual control restored', 4);
  }

  onStateChange(state) {
    this.ui.setReadoutState(`${String(state.id).padStart(2, '0')} \u00b7 ${state.name}`);
    if (state === STATES.EARTH_APPROACH) {
      this.hotspotArmed = false;
      this.ui.hidePanel(1.4);
    }
    if (state === STATES.CONTINENT) {
      // From here on the camera is inside a flat map: dragging and zooming have
      // nothing to act on, so input stays inert until Back.
      this.hotspotArmed = false;
      this.region.setHover(0);
      this.ui.setAnchor(0, 0, false);
      this.controls.setEnabled(false);
    }
  }

  onPointerMove(event) {
    this.pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    this.pointerInside = true;
    const grabbable = this.mode === MODE.SOLAR || this.mode === MODE.EXPLORE;
    document.body.classList.toggle('grab', grabbable && !this.hoveringHotspot);
  }

  onKey(event) {
    if (!this.started) return;
    if (event.key === 'Escape' && (this.mode === MODE.ATLAS || this.mode === MODE.EXPLORE)) {
      this.onBack();
    }
  }

  onCanvasClick() {
    if (!this.started || this.controls.dragged) {
      this.controls.dragged = false;
      return;
    }
    if (this.hoveringHotspot && this.hotspotArmed) {
      this.onHotspotClick();
      return;
    }
    if (this.mode === MODE.SOLAR) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObject(this.earth.surface, false);
      if (hits.length) this.enterExplore();
    }
  }

  onHotspotClick() {
    this.region.triggerPulse(1.4);
    gsap.fromTo(
      this.director,
      { punch: 0 },
      { punch: 1, duration: 0.5, ease: 'power2.out', yoyo: true, repeat: 1 }
    );
    if (this.mode === MODE.ATLAS) {
      return;
    }
    this.mode = MODE.FLYING;
    this.ui.setPanelEnabled(false);
    this.ui.hideSelectionNote();
    this.ui.hidePanel(1.1);
    this.ui.showSkip();
    this.director.continueToRegion(() => {
      this.mode = MODE.ATLAS;
      this.hotspotArmed = false;
      this.ui.hideSkip();
      this.ui.showDestination();
      this.controls.setEnabled(false);
    });
  }

  enterExplore() {
    this.mode = MODE.EXPLORE;
    this.hotspotArmed = true;
    this.director.enterFreeOrbit({ keepAz: true, dist: 3.5, elDeg: 19, fov: 42, focus: 0.85 });
    this.ui.setPanelEnabled(false);
    this.ui.showHint('Explore the globe \u00b7 find Cox\u2019s Bazar', 6.5);
  }

  updateHotspot(delta) {
    if (this.director.atlasVisible) {
      if (this.hoveringHotspot) {
        this.hoveringHotspot = false;
        this.region.setHover(0);
        document.body.classList.remove('pointing');
      }
      this.ui.setAnchor(0, 0, false);
      this.region.update(delta, this.elapsed, this.camera, 0);
      return;
    }

    const rigDist = this.director.rig.dist;
    const distanceFactor = smoothstep(9, 4, rigDist);
    const facing = this.region.facingScore(this.camera.position);
    const facingFactor = smoothstep(0.06, 0.5, facing);
    const active = this.hotspotArmed && distanceFactor > 0.02 && facingFactor > 0.02;
    const visibility =
      this.director.regionVisibility * distanceFactor * (1 + this.director.punch * 0.55);

    let hovered = false;
    if (active && this.pointerInside) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      hovered = this.raycaster.intersectObject(this.region.hitTarget, false).length > 0;
    }

    if (hovered !== this.hoveringHotspot) {
      this.hoveringHotspot = hovered;
      this.region.setHover(hovered ? 1 : 0);
      document.body.classList.toggle('pointing', hovered);
      const grabbable = this.mode === MODE.SOLAR || this.mode === MODE.EXPLORE;
      document.body.classList.toggle('grab', !hovered && grabbable);
    }

    this.region.update(delta, this.elapsed, this.camera, visibility * (0.3 + 0.7 * facingFactor));
    this.updateAnchorLabel(facingFactor, visibility);
  }

  updateAnchorLabel(facingFactor, visibility) {
    if (visibility < 0.3 || facingFactor < 0.12) {
      this.ui.setAnchor(0, 0, false);
      return;
    }
    this.region.getWorldPosition(this._world);
    this._projected.copy(this._world).project(this.camera);
    if (this._projected.z > 1) {
      this.ui.setAnchor(0, 0, false);
      return;
    }
    const x = (this._projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this._projected.y * 0.5 + 0.5) * window.innerHeight;
    this.ui.setAnchor(x + 24, y - 9, true, 0.92 + 0.08 * facingFactor);
  }

  loop = () => {
    requestAnimationFrame(this.loop);
    if (!this.started || !this.director) return;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += delta;

    this.solar.update(this.elapsed);
    this.solar.setOrbitLines(this.director.orbitLineFade);
    this.solar.setCorona(this.director.coronaScale);

    this.earth.refresh();
    this.earth.setSpinRate(this.director.spinScale);
    this.earth.update(delta, this.elapsed, this.director.rig.dist);
    this.earth.setCloudOpacity(this.director.cloudOpacity);
    this.earth.setNormalScale(0.5 + smoothstep(9, 1.4, this.director.rig.dist) * 0.75);

    this.sunLight.position.copy(this.solar.sunPosition);

    this.controls.update(delta);
    this.director.apply();
    this.atlas.sync([this.director.atlasA, this.director.atlasB]);
    this.atlas.update();
    this.scene.updateMatrixWorld(true);

    this.updateHotspot(delta);
    this.starfield.update(this.elapsed, this.camera);
    this.ui.setVeil(this.director.veil);

    this.renderer.render(this.scene, this.camera);
  };
}

const app = new App();
app.init().catch((error) => {
  console.error(error);
  const sub = document.getElementById('loader-sub');
  if (sub) sub.textContent = 'Unable to initialise the observatory';
});

window.__jukebox = app;
