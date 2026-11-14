import * as THREE from 'three';
import { gsap } from '../vendor/gsap/index.js';
import { RENDER, SUN, EARTH, STATES, TIMELINE, ATLAS, GLOBE_PINS } from './config.js';
import { clamp, smoothstep, DEG, latLonToVector3 } from './utils.js';
import { AssetLoader } from './assets.js';
import { Starfield } from './starfield.js';
import { SolarSystem } from './solar-system.js';
import { Earth } from './earth.js';
import { RegionMarker } from './region.js';
import { Atlas, makeRegionPlate } from './atlas.js';
import { REGIONS, REGION_BY_ID } from './regions.js';
import { REGION_IMAGERY } from './region-imagery.js';
import { CloudPass } from './cloud-pass.js';
import { CameraDirector } from './camera-director.js';
import { ExplorerControls } from './controls.js';
import { SpaceDive } from './space-dive.js';
import { UI } from './ui.js';
import { SignalAudio } from './signal-audio.js';

const yieldToBrowser = () => new Promise((resolve) => requestAnimationFrame(() => window.setTimeout(resolve, 0)));

const WARM_KEY = 'jukebox:warmed';

// The inline script in index.html sets this class before first paint. Read it
// here as well so a storage-blocked fallback still reports the warm state.
function isWarmReturn() {
  if (document.documentElement.classList.contains('is-warm-return')) return true;
  try {
    return sessionStorage.getItem(WARM_KEY) === '1';
  } catch (error) {
    return false;
  }
}

const MODE = {
  SOLAR: 'solar',
  EXPLORE: 'explore',
  FLYING: 'flying',
  ATLAS: 'atlas'
};

class App {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.isWarmReturn = isWarmReturn();
    if (this.isWarmReturn) document.documentElement.classList.add('is-warm-return');
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.mode = MODE.SOLAR;
    // Where Back should return after a destination: the wide solar view or the
    // zoomed Earth orbit the flight started from.
    this.returnMode = MODE.SOLAR;
    this.started = false;
    this.skipping = false;
    this.hoveringHotspot = false;
    this.hotspotArmed = false;
    this.globePins = [];
    this.hoveredPinId = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-10, -10);
    this.pointerInside = false;
    this._world = new THREE.Vector3();
    this._projected = new THREE.Vector3();
    this._hit = new THREE.Vector3();
    this._pinWorld = new THREE.Vector3();
    this._pinNormal = new THREE.Vector3();
    this._pinCamera = new THREE.Vector3();
    this._pinNdc = new THREE.Vector3();
    this.audio = new SignalAudio();
    this.selectionToken = 0;
    this.pendingSelection = null;
    this.warmedTextures = new WeakSet();
    this.qualityRatio = Math.min(window.devicePixelRatio, window.matchMedia('(pointer: coarse)').matches ? RENDER.mobilePixelRatio : RENDER.maxPixelRatio);
    this.qualitySamples = [];
    this.qualityChangedAt = 0;
    this.previousFrame = 0;
    this.qualityCeiling = Math.min(window.devicePixelRatio, RENDER.maxPixelRatio);
  }

  async init() {
    performance.mark('jukebox:start');
    this.ui = new UI({
      onSelect: (region) => this.onSelect(region),
      onBack: () => this.onBack(),
      onSkip: () => this.onSkip(),
      onSignalToggle: (key, on) => this.audio.setEnabled(key, on),
      onYearChange: (year) => this.audio.setYear(year),
      onPlay: (year) => this.audio.setYear(year),
      onMuteChange: (muted) => this.audio.setMuted(muted),
      onVolumeChange: (volume) => this.audio.setVolume(volume),
      onToggleAudio: () => this.toggleDestinationAudio(),
      onSwitchRegion: (region) => this.switchDestinationInAtlas(region),
      onPinSelect: (pin) => this.onGlobePinSelect(pin),
      onPinHover: (pin) => this.onGlobePinHover(pin),
      onCancelSelection: () => this.cancelSelection(),
      onRetrySelection: () => {
        if (this.pendingSelection) this.selectDestination(this.pendingSelection.region, this.pendingSelection.fromHotspot);
      }
    });
    this.audio.onStateChange = (state) => this.ui.setAudioState(state);
    this.ui.setAudioState(this.audio.state);
    this.buildGlobePins();
    if (!this.isWarmReturn) {
      this.loaderEffect = new SpaceDive(document.getElementById('loader-scene'));
      this.loaderEffect.start();
    }
    this.assetLoader = new AssetLoader((ratio) => this.ui.setProgress(ratio * 0.6));
    await this.prepareStage('imagery', 0, 'Loading observatory imagery\u2026', async () => {
      this.textures = await this.assetLoader.loadCritical();
    });
    await this.prepareStage('surface', 0.61, 'Preparing Earth\u2026', () => this.assetLoader.buildRoughness());
    await this.prepareStage('world', 0.66, 'Preparing the environment\u2026', async () => {
      this.buildRenderer();
      this.buildScene();
      await this.buildWorld();
    });
    await this.prepareStage('graphics', 0.92, 'Preparing graphics\u2026', async () => {
      // Compile programs now, but let the first render upload only the textures
      // the opening frame uses. Eagerly uploading every texture delays the
      // loader by about a second for work that is not needed yet.
      await this.renderer.compileAsync(this.scene, this.camera);
      await yieldToBrowser();
      this.renderer.render(this.scene, this.camera);
    });
    this.bindEvents();
    this.ui.setProgress(1);
    this.ui.setLoaderSub(this.assetLoader.warnings.length ? 'Ready \u00b7 some surface detail is unavailable' : 'Observatory ready');
    performance.measure('jukebox:startup', 'jukebox:start');
    this.clock.start();
    this.onEnter();
    this.loop();
  }

  async prepareStage(name, progress, label, prepare) {
    this.ui.setProgress(progress);
    this.ui.setLoaderSub(label);
    await yieldToBrowser();
    const start = performance.now();
    await prepare();
    performance.measure(`jukebox:${name}`, { start });
  }

  async warmTextures() {
    const textures = new Set(Object.values(this.textures));
    this.scene.traverse((object) => {
      const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
      for (const material of materials) {
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        for (const uniform of Object.values(material.uniforms || {})) if (uniform.value?.isTexture) textures.add(uniform.value);
      }
    });
    let batchStart = performance.now();
    for (const texture of textures) {
      if (this.warmedTextures.has(texture)) continue;
      this.renderer.initTexture(texture);
      this.warmedTextures.add(texture);
      if (performance.now() - batchStart > 8) {
        await yieldToBrowser();
        batchStart = performance.now();
      }
    }
  }

  buildRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.qualityRatio));
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

  async buildWorld() {
    const pixelRatio = this.renderer.getPixelRatio();

    // Nebula and cloud pixels are independent; generating them in parallel
    // keeps both workers busy while the rest of the world is assembled.
    const cloudPassPromise = CloudPass.create(this.camera);
    cloudPassPromise.catch(() => {});

    this.starfield = await Starfield.create(pixelRatio, this.textures['smoke.png']);
    this.scene.add(this.starfield.group);
    this.ui.setProgress(0.76);
    await yieldToBrowser();

    this.solar = new SolarSystem(this.textures, this.renderer);
    this.scene.add(this.solar.group);
    this.ui.setProgress(0.8);
    await yieldToBrowser();

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

    this.currentRegion = REGION_BY_ID.coxs_bazar;
    this.region = new RegionMarker(this.earth, this.currentRegion);
    this.region.setPixelRatio(pixelRatio);
    this.earth.setRegionLocalDirection(this.region.localDirection);
    this.earth.refresh();
    this.ui.setActiveRegion(this.currentRegion);

    this.scene.updateMatrixWorld(true);

    this.director = new CameraDirector(this.camera, this.earth, this.region);
    this.director.solveSunFraming(this.earthBody);
    this.director.onStateChange = (state) => this.onStateChange(state);
    this.director.punch = 0;

    this.controls = new ExplorerControls(this.camera, this.canvas, this.director);
    this.controls.onUserIntent = () => this.onUserIntent();

    this.atlas = new Atlas(this.camera, this.textures);
    this.camera.add(this.atlas.group);

    this.ui.setProgress(0.84);
    this.ui.setLoaderSub('Preparing cloud textures\u2026');
    await yieldToBrowser();
    this.cloudPass = await cloudPassPromise;
    this.camera.add(this.cloudPass.group);

    this.director.apply();
    this.ui.setReadoutState(`01 \u00b7 ${STATES.SOLAR_SYSTEM.name}`);
  }

  bindEvents() {
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('pageshow', (event) => this.onPageShow(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerdown', () => this.onCanvasPointerDown(), { passive: true });
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.qualityRatio));
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.director) this.director.refreshWideFraming();
    const ratio = this.renderer.getPixelRatio();
    this.starfield.setPixelRatio(ratio);
    this.region.setPixelRatio(ratio);
  }

  updateQuality(now) {
    const gap = this.previousFrame ? now - this.previousFrame : 0;
    this.previousFrame = now;
    if (document.hidden || this.mode === MODE.FLYING || this.pendingSelection || gap > 1000 || now - this.qualityChangedAt < RENDER.qualityCooldownMs) {
      this.qualitySamples.length = 0;
      this.qualityWindowStart = now;
      return;
    }
    if (gap <= 0) return;
    this.qualitySamples.push(gap);
    if (now - this.qualityWindowStart < RENDER.qualitySampleMs) return;
    const sorted = this.qualitySamples.sort((a, b) => a - b);
    const frameMs = sorted[Math.floor(sorted.length * 0.8)];
    let next = this.qualityRatio;
    if (frameMs > RENDER.slowFrameMs) {
      next = Math.max(RENDER.minPixelRatio, this.qualityRatio - RENDER.qualityStep);
      this.qualityCeiling = Math.min(this.qualityCeiling, next);
    } else if (frameMs < RENDER.fastFrameMs) {
      next = Math.min(this.qualityCeiling, this.qualityRatio + RENDER.qualityStep);
    }
    this.qualitySamples.length = 0;
    this.qualityWindowStart = now;
    if (next === this.qualityRatio) return;
    this.qualityRatio = next;
    this.qualityChangedAt = now;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, next));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.starfield.setPixelRatio(this.renderer.getPixelRatio());
    this.region.setPixelRatio(this.renderer.getPixelRatio());
  }

  onEnter() {
    if (this.started) return;
    this.started = true;
    try {
      sessionStorage.setItem(WARM_KEY, '1');
    } catch (error) {
      // Storage can be unavailable in private modes; the page still works.
    }
    this.qualityChangedAt = performance.now();
    this.ui.setPanelEnabled(true);
    this.controls.setEnabled(true);
    if (this.isWarmReturn) {
      // A return from the Lab is already warm: no dive, no loader fade, no
      // intro dolly. Place the camera and reveal the HUD immediately.
      this.ui.dismissLoaderInstant();
      this.ui.scheduleVeilNoise();
      this.assetLoader.loadAtlas().catch(() => {});
      this.director.refreshWideFraming();
      this.director.apply();
    } else {
      if (this.loaderEffect) this.loaderEffect.boost(2.4);
      this.ui.dismissLoader(() => this.loaderEffect?.stop()).then(() => {
        this.ui.scheduleVeilNoise();
        this.assetLoader.loadAtlas().catch(() => {});
      });
      this.director.introDolly(5.2);
    }
    this.ui.showHint('Select a place to listen', 6);
    window.setTimeout(() => {
      if (this.mode === MODE.SOLAR) this.ui.showHint('Or click Earth to move closer', 4.5);
    }, 8200);
  }

  // Back-forward cache restores the running scene without re-running init().
  // Drop the frozen frame gap so the first restored frame does not jump.
  onPageShow(event) {
    if (!event.persisted) return;
    this.isWarmReturn = true;
    document.documentElement.classList.add('is-warm-return');
    if (this.loaderEffect) {
      this.loaderEffect.stop();
      this.loaderEffect = null;
    }
    this.ui?.dismissLoaderInstant();
    this.clock.getDelta();
  }

  // Moves the marker, the camera target and the flat-map plate to the chosen
  // region. The camera choreography itself is unchanged.
  applyRegion(region) {
    this.currentRegion = region;
    this.region.setRegion(region);
    this.earth.setRegionLocalDirection(this.region.localDirection);
    this.earth.refresh();
    this.director.setRegion(region);
    this.ui.setReadoutTarget(region);
    this.ui.setActiveRegion(region);
  }

  // Pins are static definitions; only their projection changes each frame. The
  // cluster badges group every destination by country/EIC series, so the badge
  // count comes from the generated region index rather than a hard-coded label.
  buildGlobePins() {
    const pins = [];
    for (const cluster of GLOBE_PINS.clusters) {
      const regions = REGIONS.filter((region) => region.countryId === cluster.countryId);
      if (!regions.length) continue;
      pins.push({
        id: `cluster:${cluster.countryId}`,
        kind: 'cluster',
        countryId: cluster.countryId,
        label: cluster.label,
        count: String(regions.length).padStart(2, '0'),
        regions,
        direction: latLonToVector3(cluster.lat, cluster.lon, 1)
      });
    }
    for (const region of REGIONS) {
      pins.push({
        id: `region:${region.id}`,
        kind: 'region',
        region,
        label: region.name,
        direction: latLonToVector3(region.lat, region.lon, 1),
        labelOffset: GLOBE_PINS.labelOffsets[region.id] || null
      });
    }
    this.globePins = pins;
    this.ui.buildGlobePins(pins);
  }

  onGlobePinHover(pin) {
    if (!this.started || !this.director || this.director.atlasVisible) return;
    if (
      !pin || pin.kind === 'cluster'
      || this.mode === MODE.FLYING || this.mode === MODE.ATLAS
    ) {
      this.clearPinHover();
      return;
    }
    if (this.hoveredPinId === pin.id) return;
    this.hoveredPinId = pin.id;
    this.region.setRegion(pin.region);
    this.region.setHover(1);
    this.ui.setPlacePreview(pin.region);
    document.body.classList.add('pointing');
  }

  clearPinHover() {
    if (!this.hoveredPinId) return;
    this.hoveredPinId = null;
    this.ui.setPlacePreview(null);
    this.region.setRegion(this.currentRegion);
    this.region.setHover(0);
    document.body.classList.toggle('pointing', this.hoveringHotspot);
  }

  onGlobePinSelect(pin) {
    if (!this.started || this.mode === MODE.FLYING || this.mode === MODE.ATLAS) return;
    this.clearPinHover();
    if (pin.kind === 'cluster') {
      if (pin.countryId === 'bangladesh') this.focusBangladesh();
      else if (pin.regions.length === 1) this.selectDestination(pin.regions[0], true);
      return;
    }
    this.selectDestination(pin.region, true);
  }

  // Bangladesh's six destinations sit inside a few degrees of each other, so a
  // single badge is the useful far-view control. Clicking it orbits in to the
  // country; crossing `GLOBE_PINS.clusterDistance` then splits the badge into
  // the six destination pins.
  focusBangladesh() {
    if (!this.started || this.mode === MODE.FLYING || this.mode === MODE.ATLAS) return;
    const cluster = GLOBE_PINS.clusters.find((item) => item.countryId === 'bangladesh');
    if (!cluster) return;
    this.cancelSelection();
    const direction = latLonToVector3(cluster.lat, cluster.lon, 1);
    const { az } = this.earth.getAzElTiltForDirection(direction);
    this.mode = MODE.EXPLORE;
    this.hotspotArmed = false;
    this.ui.setPanelEnabled(false);
    this.ui.showHint('Bangladesh \u00b7 six destinations on the globe', 5);
    this.director.enterFreeOrbit({
      keepAz: false,
      az,
      dist: 1.95,
      elDeg: 21,
      fov: 40,
      focus: 0.92,
      duration: 4.6,
      onComplete: () => {
        if (this.mode !== MODE.EXPLORE) return;
        this.hotspotArmed = true;
        if (this.ui.isMobileSheet()) this.ui.setSheetState('peek');
        this.ui.setPanelEnabled(true);
      }
    });
  }

  // The AudioContext has to be created or resumed inside a user gesture, so it
  // is prepared on the selection click and only faded in once the flight lands.
  prepareAudio() {
    const token = this.selectionToken;
    this.audio.start().then(() => {
      if (token !== this.selectionToken && !this.pendingSelection && this.mode !== MODE.ATLAS) this.audio.suspend();
    }).catch((error) => console.warn('Audio unavailable', error));
  }

  startDestinationAudio() {
    this.audio.setDestination(this.currentRegion);
    this.audio.setYear(this.ui.activeYear);
    this.audio.setEnabledSet(this.ui.enabledSignals);
    this.audio
      .start()
      .then(() => {
        if (this.mode === MODE.ATLAS) this.audio.fadeIn(1.8);
        else this.audio.suspend();
      })
      .catch((error) => console.warn('Audio unavailable', error));
  }

  toggleDestinationAudio() {
    if (this.mode !== MODE.ATLAS) return;
    this.audio.togglePlay().catch((error) => console.warn('Audio unavailable', error));
  }

  // Switch destination from the signals view while the flat map stage is
  // already open. The camera stays put; only the marker, plate, readout and
  // audio target change.
  async switchDestinationInAtlas(region) {
    if (!region || this.mode !== MODE.ATLAS || !this.started) return;
    if (this.currentRegion?.id === region.id) return;
    const token = ++this.selectionToken;
    try {
      await this.assetLoader.loadAtlas(region.id);
      if (token !== this.selectionToken || this.mode !== MODE.ATLAS) return;
      const plateFile = REGION_IMAGERY[region.id]?.file;
      const plateTexture = plateFile && this.textures[plateFile];
      this.atlas.setRegionTexture(plateTexture || makeRegionPlate(region), { owned: !plateTexture });
      this.applyRegion(region);
      this.ui.showSignals(region);
      this.audio.setDestination(region);
      this.audio.setYear(this.ui.activeYear);
      this.audio.setEnabledSet(this.ui.enabledSignals);
      this.ui.showHint(`${region.name} \u00b7 adjust the sound layers`, 4.5);
    } catch (error) {
      console.warn('Destination imagery unavailable', error);
    }
  }

  onSelect(region) {
    this.selectDestination(region);
  }

  async selectDestination(region, fromHotspot = false) {
    if (!this.started || this.mode === MODE.FLYING || this.mode === MODE.ATLAS || !region) return;
    this.clearPinHover();
    const token = ++this.selectionToken;
    this.pendingSelection = { region, fromHotspot };
    this.prepareAudio();
    this.ui.setMapStatus(region);
    try {
      await this.assetLoader.loadAtlas(region.id);
      if (token !== this.selectionToken) return;
      const asiaTexture = this.textures[ATLAS.levels.asia.map];
      if (asiaTexture) this.atlas.setBaseTexture('asia', asiaTexture);
      const plateFile = REGION_IMAGERY[region.id]?.file;
      const plateTexture = plateFile && this.textures[plateFile];
      this.atlas.setRegionTexture(plateTexture || makeRegionPlate(region), { owned: !plateTexture });
      await this.warmTextures();
      if (token !== this.selectionToken) return;
      await this.renderer.compileAsync(this.scene, this.camera);
      if (token !== this.selectionToken) return;
    } catch (error) {
      if (token !== this.selectionToken) return;
      this.ui.setMapStatus(region, true);
      console.warn('Destination imagery unavailable', error);
      this.audio.suspend();
      return;
    }
    this.pendingSelection = null;
    this.ui.setMapStatus(null);
    this.returnMode = this.mode === MODE.EXPLORE ? MODE.EXPLORE : MODE.SOLAR;
    this.applyRegion(region);
    this.ui.setPanelEnabled(false);
    this.mode = MODE.FLYING;
    this.hotspotArmed = false;
    this.region.setHover(0);
    this.ui.showSkip();
    if (fromHotspot) {
      this.region.triggerPulse(1.4);
      gsap.fromTo(this.director, { punch: 0 }, { punch: 1, duration: 0.5, ease: 'power2.out', yoyo: true, repeat: 1 });
      this.ui.hideSelectionNote();
      this.ui.hidePanel(1.1);
      this.director.continueToRegion(() => this.onFlightComplete());
    } else {
      this.ui.showSelectionNote(region);
      this.director.beginFlight(() => this.onFlightComplete());
      const speed = TIMELINE.speed || 1;
      this.ui.hidePanel(1.6 / speed, { delay: 600 / speed });
    }
  }

  cancelSelection() {
    if (!this.pendingSelection) return false;
    this.selectionToken += 1;
    this.pendingSelection = null;
    this.ui.setMapStatus(null);
    this.audio.fadeOut(0.1);
    this.audio.suspend();
    return true;
  }

  onFlightComplete() {
    this.mode = MODE.ATLAS;
    this.skipping = false;
    this.hotspotArmed = false;
    this.region.setHover(0);
    this.ui.setAnchor(0, 0, false);
    this.ui.hideSelectionNote();
    this.ui.hideSkip();
    this.ui.setBackLabel(this.returnMode === MODE.EXPLORE ? 'Earth orbit' : 'solar system');
    this.ui.showDestination(this.currentRegion);
    this.controls.setEnabled(false);
    this.startDestinationAudio();
    this.ui.showHint(`${this.currentRegion.name} \u00b7 adjust the sound layers`, 6.5);
  }

  onBack() {
    if (this.cancelSelection()) return;
    if (this.mode === MODE.FLYING) return;
    const returnToOrbit = this.mode === MODE.ATLAS && this.returnMode === MODE.EXPLORE;
    this.mode = MODE.FLYING;
    this.hotspotArmed = false;
    this.region.setHover(0);
    this.audio.fadeOut(0.8);
    window.setTimeout(() => {
      if (this.mode === MODE.SOLAR || this.mode === MODE.EXPLORE) this.audio.suspend();
    }, 1200);
    this.ui.hideDestination(0.8);
    this.ui.hideSelectionNote();
    if (this.ui.isMobileSheet()) this.ui.hidePanel(0.6);
    this.ui.setPanelEnabled(false);
    this.ui.setAnchor(0, 0, false);

    const settle = () => {
      this.mode = returnToOrbit ? MODE.EXPLORE : MODE.SOLAR;
      this.skipping = false;
      this.hotspotArmed = returnToOrbit;
      this.controls.setEnabled(true);
      this.ui.showPlaces();
      this.ui.setActiveRegion(this.currentRegion);
      this.ui.showPanel(1.4);
      this.ui.setPanelEnabled(true);
      this.ui.showHint(returnToOrbit ? 'Earth orbit \u00b7 choose a place' : 'Observatory view', 3.5);
      this.audio.suspend();
    };

    if (returnToOrbit) this.director.exitAtlasToOrbit(settle);
    else this.director.exitAtlas(settle);
  }

  onSkip() {
    if (!this.started || this.skipping || this.mode !== MODE.FLYING) return;
    if (!this.ui.isSkipVisible()) return;
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
    this.ui.showHint(`Skipping to ${this.currentRegion.name}`, 2.2);
    this.director.skipToRegion(() => this.onFlightComplete());
  }

  onUserIntent() {
    this.cancelSelection();
    if (this.mode !== MODE.FLYING) return;
    if (!this.director.interrupt()) return;
    const near = this.director.rig.dist < 6;
    this.mode = near ? MODE.EXPLORE : MODE.SOLAR;
    this.audio.fadeOut(0.5);
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
    if (!this.started || event.key !== 'Escape' || event.defaultPrevented) return;
    if (this.ui.handleEscape()) {
      event.preventDefault();
      return;
    }
    if (this.cancelSelection()) {
      event.preventDefault();
      return;
    }
    // During an outbound flight, Escape does what the Skip control does. During
    // the Back transition the Skip control is hidden, so this stays inert.
    if (this.mode === MODE.FLYING) this.onSkip();
    else if (this.mode === MODE.ATLAS || this.mode === MODE.EXPLORE) this.onBack();
  }

  onCanvasPointerDown() {
    if (this.mode !== MODE.EXPLORE) return;
    this.ui.collapseOnGlobe();
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
    if (this.mode === MODE.EXPLORE) this.selectDestination(this.currentRegion, true);
  }

  enterExplore() {
    this.cancelSelection();
    this.mode = MODE.EXPLORE;
    this.hotspotArmed = false;
    this.ui.setPanelEnabled(false);
    this.director.enterFreeOrbit({
      keepAz: true,
      dist: 3.5,
      elDeg: 19,
      fov: 42,
      focus: 0.85,
      onComplete: () => {
        if (this.mode !== MODE.EXPLORE) return;
        this.hotspotArmed = true;
        if (this.ui.isMobileSheet()) this.ui.setSheetState('peek');
        this.ui.setPanelEnabled(true);
      }
    });
    this.ui.showHint(`Explore the globe \u00b7 find ${this.currentRegion.name}`, 6.5);
  }

  updateHotspot(delta) {
    if (this.director.atlasVisible) {
      if (this.hoveringHotspot) {
        this.hoveringHotspot = false;
        this.region.setHover(0);
        document.body.classList.remove('pointing');
      }
      this.ui.setAnchor(0, 0, false);
      this.ui.updateGlobePins(false);
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
    if (active && this.pointerInside && !this.hoveredPinId) {
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
    this.updateGlobePins();
  }

  // Projects every front-facing pin from the spinning globe into screen space.
  // The cluster set is drawn while the camera is wide; crossing the threshold
  // swaps it for the individual destination pins in the same frame. Pins on the
  // far hemisphere (or behind the camera) are omitted, so they cannot be
  // clicked through the planet.
  updateGlobePins() {
    if (!this.globePins.length) return;
    const active = this.mode !== MODE.ATLAS && this.mode !== MODE.FLYING
      && !this.director.atlasVisible;
    if (!active) {
      this.ui.updateGlobePins(false);
      return;
    }

    const rigDist = this.director.rig.dist;
    const clusterMode = rigDist > GLOBE_PINS.clusterDistance;
    const stagger = rigDist > GLOBE_PINS.staggerDistance;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const views = [];

    for (const pin of this.globePins) {
      const isCluster = pin.kind === 'cluster';
      if (isCluster !== clusterMode) continue;

      this._pinWorld
        .copy(pin.direction)
        .multiplyScalar(this.earth.radius * GLOBE_PINS.surfaceScale);
      this.earth.spin.localToWorld(this._pinWorld);
      this._pinNormal
        .copy(pin.direction)
        .transformDirection(this.earth.spin.matrixWorld)
        .normalize();
      this._pinCamera.subVectors(this.camera.position, this._pinWorld).normalize();
      const facing = this._pinNormal.dot(this._pinCamera);
      if (facing <= GLOBE_PINS.facingThreshold) continue;

      this._pinNdc.copy(this._pinWorld).project(this.camera);
      const x = (this._pinNdc.x * 0.5 + 0.5) * width;
      const y = (-this._pinNdc.y * 0.5 + 0.5) * height;
      if (this._pinNdc.z > 1 || x < -180 || x > width + 180 || y < -140 || y > height + 100) continue;

      views.push({
        id: pin.id,
        x,
        y,
        offset: stagger && !isCluster ? pin.labelOffset : null
      });
    }

    this.ui.updateGlobePins(true, views);
  }

  updateAnchorLabel(facingFactor, visibility) {
    if (this.hoveredPinId || visibility < 0.3 || facingFactor < 0.12) {
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
    this.updateQuality(performance.now());
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
    this.director.apply(delta);
    this.audio.update();
    this.atlas.sync([this.director.atlasA, this.director.atlasB]);
    this.atlas.update();
    this.cloudPass.update(delta, this.director.cloudPass);
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
  app.loaderEffect?.stop();
  app.ui?.showLoaderError(error.message || 'Unable to initialise the observatory. Please reload to retry.');
});

window.__jukebox = app;
