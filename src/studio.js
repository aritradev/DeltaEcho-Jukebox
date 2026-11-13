// Sonification lab wiring: load the filmstrip, measure each frame, then drive
// both picture and sound from the audio clock so they cannot drift apart.

import { FILMSTRIP_PRESETS, MONTHS, frameDate, loadFilmstrip } from './filmstrip.js';
import { Sonifier, soundForFrame } from './sonify.js';
import { initStudioSky } from './studio-sky.js';

const $ = (id) => document.getElementById(id);

const els = {
  canvas: $('frame'),
  scan: $('frame-scan'),
  year: $('year-label'),
  month: $('month-label'),
  timeline: $('timeline'),
  ticks: $('timeline-ticks'),
  head: $('timeline-head'),
  scale: $('timeline-scale'),
  play: $('play-btn'),
  playLabel: $('play-label'),
  restart: $('restart-btn'),
  retry: $('retry-btn'),
  speed: $('speed-select'),
  dataset: $('dataset-select'),
  datasetTitle: $('dataset-title'),
  weatherBlock: $('weather-block'),
  announce: $('announce-toggle'),
  status: $('status'),
  hint: $('hint'),
  sentence: $('sentence'),
  live: $('live'),
  analysis: $('analysis'),
  temp: $('v-temp'),
  rain: $('v-rain'),
  humidity: $('v-humidity'),
  wind: $('v-wind'),
  solar: $('v-solar')
};

const bars = {};
document.querySelectorAll('.bar').forEach((el) => {
  bars[el.dataset.key] = {
    fill: el.querySelector('.bar-fill'),
    value: el.querySelector('.bar-value')
  };
});

initStudioSky($('studio-sky'));

const state = {
  strip: null,
  climate: null,
  presetKey: 'coxs_bazar',
  preset: FILMSTRIP_PRESETS.coxs_bazar,
  sonifier: new Sonifier(),
  playing: false,
  pendingPlay: null,
  suspendTimer: null,
  suspending: null,
  frame: 0,
  secondsPerFrame: 0.5,
  startTime: 0,
  loadToken: 0,
  ready: false
};

const tickEls = [];
const stripCache = new Map();

function monthIndexOf(index) {
  const { year, month } = frameDate(index, state.preset);
  // GISTEMP runs 2000-2010; later EIC years clamp to its last month.
  return (year - 2000) * 12 + (month - 1);
}

function climateFor(index) {
  if (!state.climate || state.presetKey !== 'coxs_bazar') return null;
  const { year, month } = frameDate(index, state.preset);
  const key = `${year}${String(month).padStart(2, '0')}`;
  return state.climate[key] || null;
}

function currentSound() {
  return soundForFrame(state.strip.frames[state.frame], climateFor(state.frame), monthIndexOf(state.frame));
}

async function loadClimate() {
  try {
    const res = await fetch('./assets/data/coxs-bazar-power.json');
    if (!res.ok) return null;
    const json = await res.json();
    const params = json.properties?.parameter || {};
    const fields = {
      tempC: 'T2M', rainMm: 'PRECTOTCORR', humidity: 'RH2M',
      windMs: 'WS2M', solar: 'ALLSKY_SFC_SW_DWN'
    };
    const keys = new Set(Object.values(fields).flatMap((name) => Object.keys(params[name] || {})));
    const out = {};
    for (const key of keys) {
      const month = Number(key.slice(4));
      if (!/^\d{6}$/.test(key) || month < 1 || month > 12) continue;
      const record = {};
      for (const [field, name] of Object.entries(fields)) {
        const value = params[name]?.[key];
        const valid = Number.isFinite(value) && value !== json.header?.fill_value && value > -900 &&
          (field === 'tempC' || value >= 0) && (field !== 'humidity' || value <= 100);
        record[field] = valid ? value : null;
      }
      if (Object.values(record).some((value) => value !== null)) out[key] = record;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

function buildTicks() {
  els.ticks.innerHTML = '';
  tickEls.length = 0;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < state.preset.frames; i += 1) {
    const tick = document.createElement('i');
    fragment.appendChild(tick);
    tickEls.push(tick);
  }
  els.ticks.appendChild(fragment);
  els.timeline.setAttribute('aria-valuemax', String(state.preset.frames - 1));
}

function presetShort(preset = state.preset) {
  return preset.title.split('\u00B7')[0].trim();
}

function idlePlayLabel() {
  return state.presetKey === 'coxs_bazar' ? 'Play the decade' : 'Play the series';
}

function coverageNote(preset) {
  const first = frameDate(0, preset);
  const last = frameDate(preset.frames - 1, preset);
  return preset.stepMode === 'yearly'
    ? `Annual frames ${first.year}\u2013${last.year}, fixed ${MONTHS[first.month - 1]} acquisition month; exact days not recorded.`
    : `${MONTHS[first.month - 1]} ${first.year}\u2013${MONTHS[last.month - 1]} ${last.year} month slots; acquisition days not recorded.`;
}

function readyStatus() {
  if (state.presetKey !== 'coxs_bazar') return 'Ready \u00B7 image only';
  return state.climate ? 'Ready \u00B7 image and weather' : 'Ready \u00B7 weather unavailable';
}

function applyPresetMeta() {
  const preset = state.preset;
  els.datasetTitle.textContent = preset.title.replace(/\s*\([^)]*\)\s*$/, '');
  els.weatherBlock.hidden = preset.id !== 'coxs_bazar';
  if (els.scale) {
    const labels = [];
    for (let i = 0; i <= 4; i += 1) {
      const index = Math.round((i / 4) * (preset.frames - 1));
      labels.push(`<span>${frameDate(index, preset).year}</span>`);
    }
    els.scale.innerHTML = labels.join('');
  }
}

// The scanline is a DOM overlay, not canvas pixels, so it can glide between
// frames without forcing a redraw of the satellite cell.
function updateScan(position = state.frame) {
  if (!els.scan) return;
  const frames = state.preset.frames;
  const ratio = frames > 1 ? position / (frames - 1) : 0;
  els.scan.style.left = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  els.scan.classList.toggle('active', state.playing);
}

function drawFrame(index, progress = index) {
  const ctx = els.canvas.getContext('2d');
  state.strip.draw(ctx, index, els.canvas.width);
  updateScan(progress);
}

function describe(features, climate, index) {
  const { year, month } = frameDate(index, state.preset);
  const where = `${MONTHS[month - 1]} ${year}`;
  const hasWeather = state.presetKey === 'coxs_bazar';
  const weatherNote = !hasWeather
    ? ''
    : !climate
      ? ' Weather data is unavailable; weather-driven sounds use defaults.'
      : Object.values(climate).some((value) => value === null)
        ? ' Some weather readings are unavailable; missing sound inputs use defaults.'
        : '';
  if (features.blank) {
    return `${where}. No usable satellite observation for this frame. ` +
      (hasWeather && climate
        ? 'Sound uses available weather and the global GISTEMP layer, with no usable image measurement.'
        : 'Sound uses fallback settings and the global GISTEMP layer, not local observations.') + weatherNote;
  }

  const cloud = features.cloud;
  const texture = cloud > 0.85
    ? 'cloud seals the scene, and the noise bed becomes a wall'
    : cloud > 0.5
      ? 'heavy cloud smears the view under a dense hiss'
      : cloud > 0.2
        ? 'scattered cloud softens the outline'
        : 'the scene is clear and the noise bed almost silent';

  const chord = features.green < 0.33
    ? 'a minor chord'
    : features.green < 0.66
      ? 'a major chord'
      : 'an open, suspended chord';

  const motion = features.edge > 0.6
    ? 'the pulse runs fast'
    : features.edge > 0.3
      ? 'the pulse is steady'
      : 'the pulse is slow and sparse';

  const rain = hasWeather && climate && climate.rainMm >= 8 ? ' Rain is heavy this month.' : '';
  return `${where}. ${texture.charAt(0).toUpperCase() + texture.slice(1)}, over ${chord}; ${motion}.${rain}${weatherNote}`;
}

function render() {
  const index = state.frame;
  const preset = state.preset;
  const data = state.strip.frames[index];
  const raw = data.raw;
  const climate = climateFor(index);
  const { year, month } = frameDate(index, preset);

  drawFrame(index, index);

  els.year.textContent = String(year);
  els.month.textContent = preset.stepMode === 'yearly'
    ? `${MONTHS[month - 1]} \u00B7 annual`
    : MONTHS[month - 1];

  for (let i = 0; i < tickEls.length; i += 1) {
    const el = tickEls[i];
    const current = i === index;
    if (el.classList.contains('current') !== current) el.classList.toggle('current', current);
    const past = i < index;
    if (el.classList.contains('past') !== past) el.classList.toggle('past', past);
  }

  els.head.style.left = `${((index + 0.5) / preset.frames) * 100}%`;

  els.timeline.setAttribute('aria-valuenow', String(index));
  els.timeline.setAttribute('aria-valuetext', `${MONTHS[month - 1]} ${year}`);

  bars.cloud.fill.style.width = `${data.cloud * 100}%`;
  bars.cloud.value.textContent = `${Math.round(raw.cloudPct * 100)}%`;
  bars.lum.fill.style.width = `${data.lum * 100}%`;
  bars.lum.value.textContent = String(Math.round(raw.meanLum));
  bars.green.fill.style.width = `${data.green * 100}%`;
  bars.green.value.textContent = `${raw.greenness >= 0 ? '+' : ''}${raw.greenness.toFixed(1)}`;
  bars.edge.fill.style.width = `${data.edge * 100}%`;
  bars.edge.value.textContent = raw.edgeMean.toFixed(1);
  bars.water.fill.style.width = `${data.water * 100}%`;
  bars.water.value.textContent = `${Math.round(raw.waterPct * 100)}%`;

  const sentence = describe(data, climate, index);
  els.sentence.textContent = sentence;

  const reading = (value, digits, unit, divisor = 1) => Number.isFinite(value)
    ? `${(value / divisor).toFixed(digits)}${unit}` : 'Unavailable';
  els.temp.textContent = reading(climate?.tempC, 1, ' \u00B0C');
  els.rain.textContent = reading(climate?.rainMm, 1, ' mm/day');
  els.humidity.textContent = reading(climate?.humidity, 0, '%');
  els.wind.textContent = reading(climate?.windMs, 1, ' m/s');
  // POWER supplies MJ/m²/day; 3.6 MJ = 1 kWh. Keep the daily basis.
  els.solar.textContent = reading(climate?.solar, 2, ' kWh/m\u00B2/day', 3.6);

  els.canvas.setAttribute(
    'aria-label',
    data.blank
      ? `No usable satellite observation for ${presetShort(preset)} in ${MONTHS[month - 1]} ${year}.`
      : `Satellite frame of ${presetShort(preset)}, ${MONTHS[month - 1]} ${year}. ` +
        `${Math.round(raw.cloudPct * 100)} percent cloud cover.`
  );

  if (els.announce.checked) els.live.textContent = sentence;
}

function updateAnalysis() {
  if (!state.strip) return;
  const preset = state.preset;
  const lastYear = frameDate(preset.frames - 1, preset).year;
  const detune = lastYear > 2010
    ? 'Audio detune: GISTEMP v4 global anomalies, trailing 12-month mean; that series ends in 2010, so later frames hold its last value.'
    : 'Audio detune: GISTEMP v4 global anomalies, trailing 12-month mean.';
  els.analysis.textContent =
    `${preset.frames} frames measured in ${state.strip.analysisMs} ms \u00B7 ` +
    `${(preset.frames * state.secondsPerFrame).toFixed(0)} s per loop \u00B7 ` +
    `${preset.sourceCredit}. ${coverageNote(preset)} ${detune}`;
}

function setFrame(index, fromClock = false) {
  if (!state.ready) return;
  const frames = state.preset.frames;
  const next = ((index % frames) + frames) % frames;
  const changed = next !== state.frame;
  state.frame = next;

  if (state.playing && !fromClock) {
    state.startTime = state.sonifier.now - state.frame * state.secondsPerFrame;
  }

  if (changed || !fromClock) render();
}

function updateTransport() {
  const pending = state.pendingPlay;
  els.play.disabled = !state.ready || Boolean(pending?.cancelled);
  els.restart.disabled = !state.ready;
  els.speed.disabled = !state.ready;
  els.dataset.disabled = !state.ready;
  els.timeline.setAttribute('aria-disabled', String(!state.ready));
  els.timeline.tabIndex = state.ready ? 0 : -1;
  els.play.classList.toggle('playing', state.playing);
  els.play.setAttribute('aria-pressed', String(state.playing));
  els.playLabel.textContent = pending
    ? (pending.cancelled ? 'Canceling\u2026' : 'Cancel start')
    : state.playing ? 'Pause' : idlePlayLabel();
  els.play.querySelector('.btn-icon').innerHTML = state.playing ? '&#10073;&#10073;' : '&#9654;';
}

function muteAudio() {
  const { ctx, master } = state.sonifier;
  if (!ctx || !master || ctx.state === 'closed') return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(0, ctx.currentTime);
}

function suspendAudio() {
  if (!state.suspending) {
    state.suspending = state.sonifier.suspend().catch(() => {
      // Even if the browser refuses to suspend, paused audio must stay silent.
      muteAudio();
    }).finally(() => { state.suspending = null; });
  }
  return state.suspending;
}

async function play() {
  if (!state.ready || state.playing || state.pendingPlay) return;
  window.clearTimeout(state.suspendTimer);
  const request = { cancelled: false };
  state.pendingPlay = request;
  updateTransport();
  els.hint.textContent = 'Starting audio\u2026 press Cancel start or Space to cancel.';

  try {
    // Drain an earlier pause before resuming; only one start may own the graph.
    if (state.suspending) await state.suspending;
    if (request.cancelled) return;
    if (state.sonifier.ctx && !state.sonifier.ready) throw new Error('Audio initialization incomplete');
    await state.sonifier.init();
    if (request.cancelled) return;
    await state.sonifier.resume();
    if (request.cancelled) return;
    if (state.sonifier.ctx.state !== 'running') throw new Error('Audio did not resume');

    state.startTime = state.sonifier.now - state.frame * state.secondsPerFrame;
    state.sonifier.nextPulse = state.sonifier.now + 0.12;
    state.sonifier.apply(currentSound());
    state.sonifier.fadeIn(1.2);
    state.playing = true;
    els.hint.textContent = 'Space pauses \u00B7 arrow keys step one frame';
  } catch {
    if (!request.cancelled) {
      els.hint.textContent = 'Audio could not start. Press Play to retry, or reload if it stays unavailable.';
    }
  } finally {
    if (!state.playing) {
      muteAudio();
      if (!state.sonifier.ready && state.sonifier.ctx) {
        // A partially built graph must be closed before another can be created.
        try {
          await state.sonifier.ctx.close();
          state.sonifier = new Sonifier();
        } catch {
          els.hint.textContent = 'Audio unavailable. Reload this page to try again.';
        }
      } else {
        await suspendAudio();
      }
    }
    state.pendingPlay = null;
    if (request.cancelled) els.hint.textContent = 'Audio start canceled. Press Play to try again.';
    updateTransport();
  }
}

function pause() {
  if (state.pendingPlay) {
    state.pendingPlay.cancelled = true;
    muteAudio();
    els.hint.textContent = 'Canceling audio start\u2026';
    updateTransport();
    return;
  }
  if (!state.playing) return;
  state.playing = false;
  state.sonifier.fadeOut(0.3);
  window.clearTimeout(state.suspendTimer);
  state.suspendTimer = window.setTimeout(() => {
    if (!state.playing && !state.pendingPlay) suspendAudio();
  }, 340);
  els.hint.textContent = 'Paused \u00B7 Space plays \u00B7 arrow keys step one frame';
  updateTransport();
}

function togglePlay() {
  if (state.playing || state.pendingPlay) pause();
  else play();
}

function seekFromEvent(event) {
  if (!state.ready) return;
  const rect = els.timeline.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const frames = state.preset.frames;
  setFrame(Math.min(frames - 1, Math.floor(ratio * frames)));
}

function bindUi() {
  els.play.addEventListener('click', togglePlay);
  els.retry.addEventListener('click', () => window.location.reload());

  // Return to the observatory through history when it is still in this tab:
  // the home page restores from cache without replaying its loader.
  const backLinks = [$('studio-back-btn'), document.querySelector('.mast-mark')].filter(Boolean);
  const goBack = (event) => {
    let sameOrigin = false;
    if (document.referrer) {
      try {
        sameOrigin = new URL(document.referrer).origin === window.location.origin;
      } catch {
        sameOrigin = false;
      }
    }
    if (!sameOrigin || window.history.length <= 1) return;
    event.preventDefault();
    pause();
    window.history.back();
  };
  backLinks.forEach((link) => link.addEventListener('click', goBack));

  els.restart.addEventListener('click', () => {
    setFrame(0);
    if (state.playing) state.startTime = state.sonifier.now;
  });

  els.speed.addEventListener('change', () => {
    if (!state.ready) return;
    const previous = state.secondsPerFrame;
    const next = Number(els.speed.value) || 0.5;
    if (state.playing) {
      const now = state.sonifier.now;
      const elapsed = Math.max(0, now - state.startTime);
      const progress = (elapsed % previous) / previous;
      state.secondsPerFrame = next;
      state.startTime = now - (state.frame + progress) * next;
    } else {
      state.secondsPerFrame = next;
    }
    updateAnalysis();
  });

  els.dataset.addEventListener('change', () => {
    switchDataset(els.dataset.value);
  });

  let dragging = false;
  els.timeline.addEventListener('pointerdown', (event) => {
    if (!state.ready) return;
    dragging = true;
    try {
      els.timeline.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or cancelled pointers cannot be captured; dragging still works.
    }
    seekFromEvent(event);
  });
  els.timeline.addEventListener('pointermove', (event) => {
    if (dragging) seekFromEvent(event);
  });
  els.timeline.addEventListener('pointerup', (event) => {
    dragging = false;
    try {
      els.timeline.releasePointerCapture(event.pointerId);
    } catch {
      // Nothing captured.
    }
  });
  els.timeline.addEventListener('pointercancel', () => { dragging = false; });

  els.timeline.addEventListener('keydown', (event) => {
    if (!state.ready) return;
    const step = event.shiftKey ? 12 : 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setFrame(state.frame + step);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setFrame(state.frame - step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setFrame(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setFrame(state.preset.frames - 1);
    }
  });

  window.addEventListener('keydown', (event) => {
    if (!state.ready || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    const typing = target?.closest?.('input, select, textarea, button, a, summary, .timeline, [contenteditable]');
    if (typing) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) togglePlay();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setFrame(state.frame + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
}

function loop() {
  requestAnimationFrame(loop);
  if (!state.ready || !state.playing) {
    updateScan(state.frame);
    return;
  }

  const frames = state.preset.frames;
  const elapsed = Math.max(0, state.sonifier.now - state.startTime);
  const exact = (elapsed / state.secondsPerFrame) % frames;
  const index = Math.floor(exact);
  if (index !== state.frame) setFrame(index, true);
  else updateScan(exact);

  const sound = currentSound();
  state.sonifier.apply(sound);
  state.sonifier.tick(sound);
}

async function switchDataset(key) {
  const preset = FILMSTRIP_PRESETS[key];
  if (!preset || key === state.presetKey) return;

  // Any in-flight load is superseded by this one; only the latest token commits.
  const token = (state.loadToken += 1);

  pause();
  state.ready = false;
  state.pendingPlay = null;
  updateTransport();
  els.status.textContent = `Loading ${preset.title.split('\u00B7')[0].trim()}\u2026`;
  els.status.classList.remove('ready', 'error');
  els.retry.hidden = true;
  els.hint.textContent = 'Loading the selected filmstrip\u2026';

  let strip = stripCache.get(key);
  if (!strip) {
    strip = await loadFilmstrip(key).catch(() => null);
    if (strip) stripCache.set(key, strip);
  }
  if (token !== state.loadToken) return;

  if (!strip) {
    els.dataset.value = state.presetKey;
    els.status.textContent = 'Filmstrip could not load';
    els.status.classList.add('error');
    els.sentence.textContent = 'That filmstrip could not be loaded or read. Choose another dataset, or retry.';
    els.canvas.setAttribute('aria-label', 'Satellite filmstrip unavailable.');
    els.hint.textContent = 'Playback is unavailable until a filmstrip loads.';
    els.retry.hidden = false;
    state.ready = Boolean(state.strip);
    updateTransport();
    if (state.ready) render();
    return;
  }

  state.presetKey = key;
  state.preset = preset;
  state.strip = strip;
  state.frame = 0;
  state.startTime = 0;
  state.ready = true;
  els.dataset.value = key;

  buildTicks();
  applyPresetMeta();
  updateAnalysis();
  updateTransport();
  els.status.textContent = readyStatus();
  els.status.classList.add('ready');
  els.hint.textContent = 'Space plays and pauses \u00B7 arrow keys step one frame';
  render();
}

async function start() {
  buildTicks();
  bindUi();
  applyPresetMeta();
  updateTransport();
  render0();
  requestAnimationFrame(loop);

  const [strip, climate] = await Promise.all([
    loadFilmstrip(state.presetKey).catch(() => null),
    loadClimate()
  ]);

  if (!strip) {
    els.status.textContent = 'Filmstrip could not load';
    els.status.classList.add('error');
    els.sentence.textContent = 'The satellite filmstrip could not be loaded or read. Check your connection, then retry.';
    els.canvas.setAttribute('aria-label', 'Satellite filmstrip unavailable.');
    els.hint.textContent = 'Playback is unavailable until the filmstrip loads.';
    els.retry.hidden = false;
    els.dataset.disabled = false;
    return;
  }

  stripCache.set(state.presetKey, strip);
  state.strip = strip;
  state.climate = climate;
  state.ready = true;

  updateTransport();
  els.status.textContent = readyStatus();
  els.status.classList.add('ready');

  updateAnalysis();
  render();
}

function render0() {
  const ctx = els.canvas.getContext('2d');
  ctx.fillStyle = '#060a12';
  ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
}

start();
