import { gsap } from '../vendor/gsap/index.js';
import { REGIONS, COUNTRIES, SIGNALS, YEAR_RANGE } from './regions.js';

const countryById = Object.fromEntries(COUNTRIES.map((country) => [country.id, country]));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalise(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019-]/g, '');
}

function formatCoord(value, positive, negative) {
  return `${Math.abs(value).toFixed(2)}\u00b0${value >= 0 ? positive : negative}`;
}

export class UI {
  constructor(handlers) {
    this.handlers = handlers;
    this.el = {
      loader: document.getElementById('loader'),
      loaderSub: document.getElementById('loader-sub'),
      loaderFill: document.getElementById('loader-fill'),
      masthead: document.getElementById('masthead'),
      readout: document.getElementById('readout'),
      roState: document.getElementById('ro-state'),
      roTarget: document.getElementById('ro-target'),
      panel: document.getElementById('panel'),
      placesView: document.getElementById('places-view'),
      signalsView: document.getElementById('signals-view'),
      searchInput: document.getElementById('search-input'),
      searchClear: document.getElementById('search-clear'),
      placeList: document.getElementById('place-list'),
      placeScroll: document.getElementById('place-scroll'),
      signalList: document.getElementById('signal-list'),
      signalCountry: document.getElementById('signal-country'),
      signalRegion: document.getElementById('signal-region'),
      signalCount: document.getElementById('signal-count'),
      yearLabel: document.getElementById('year-label'),
      yearInput: document.getElementById('year-input'),
      yearMin: document.getElementById('year-min'),
      yearMax: document.getElementById('year-max'),
      play1985: document.getElementById('play-1985'),
      play2025: document.getElementById('play-2025'),
      compareBtn: document.getElementById('compare-btn'),
      note: document.getElementById('selection-note'),
      noteEyebrow: document.getElementById('sn-eyebrow'),
      noteLine: document.querySelector('.sn-line'),
      noteDest: document.getElementById('sn-dest'),
      anchor: document.getElementById('anchor'),
      anchorName: document.querySelector('#anchor .anchor-copy strong'),
      destination: document.getElementById('destination'),
      backbar: document.getElementById('backbar'),
      backBtn: document.getElementById('back-btn'),
      backLabel: document.getElementById('back-label'),
      skipBtn: document.getElementById('skip-btn'),
      hint: document.getElementById('hint'),
      veil: document.getElementById('veil'),
      veilNoise: document.getElementById('veil-noise')
    };

    this.anchorVisible = false;
    this.hintTimer = null;
    this.veilNoiseReady = false;
    this.veilNoiseScheduled = false;

    this.panelEnabled = false;
    this.query = '';
    this.expanded = new Set(COUNTRIES.map((country) => country.name));
    this.visibleRows = [];
    this.selectedIndex = 0;
    this.activeRegion = null;
    this.activeYear = YEAR_RANGE.start;
    this.enabledSignals = new Set(SIGNALS.map((signal) => signal.key));
    this.signalRows = new Map();
    this.compareTimer = null;
    this.compareIndex = 0;

    this.el.yearInput.min = String(YEAR_RANGE.start);
    this.el.yearInput.max = String(YEAR_RANGE.end);
    this.el.yearMin.textContent = String(YEAR_RANGE.start);
    this.el.yearMax.textContent = String(YEAR_RANGE.end);

    this.buildSignalList();
    this.renderPlaces();
    this.bind();
  }

  // ---------------------------------------------------------------- places

  matches(region, query) {
    const haystack = normalise(
      [region.name, region.fullName, region.short, region.category, region.country].join(' ')
    );
    return haystack.includes(query);
  }

  createRegionRow(region) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'region-row';
    row.dataset.id = region.id;
    row.setAttribute('role', 'option');
    row.innerHTML = [
      `<span class="region-name">${escapeHtml(region.name)}</span>`,
      `<span class="region-meta">${escapeHtml(region.short)}</span>`,
      '<span class="region-chevron" aria-hidden="true">\u203a</span>'
    ].join('');
    row.addEventListener('click', () => this.chooseRegion(region));
    row.addEventListener('focus', () => {
      const index = this.visibleRows.findIndex((item) => item.id === region.id);
      if (index >= 0) {
        this.selectedIndex = index;
        this.applySelection();
      }
    });
    return row;
  }

  renderPlaces() {
    const list = this.el.placeList;
    list.innerHTML = '';
    this.visibleRows = [];
    const query = normalise(this.query);
    const matches = REGIONS.filter((region) => !query || this.matches(region, query));

    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = [
        '<p class="empty-title">No places found</p>',
        '<p class="empty-copy">Try another place or region.</p>',
        '<button class="empty-clear" type="button">Clear search</button>'
      ].join('');
      empty.querySelector('.empty-clear').addEventListener('click', () => this.clearSearch(true));
      list.appendChild(empty);
      return;
    }

    const grouped = new Map();
    for (const region of matches) {
      if (!grouped.has(region.country)) grouped.set(region.country, []);
      grouped.get(region.country).push(region);
    }

    for (const [country, regions] of grouped) {
      const group = document.createElement('div');
      group.className = 'country-group';

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'group-head';
      const open = query ? true : this.expanded.has(country);
      head.setAttribute('aria-expanded', String(open));
      head.innerHTML = [
        `<span class="group-toggle" aria-hidden="true">${open ? '\u25be' : '\u25b8'}</span>`,
        `<span class="group-name">${escapeHtml(country)}</span>`,
        `<span class="group-count">${String(regions.length).padStart(2, '0')}</span>`
      ].join('');
      head.addEventListener('click', () => {
        if (this.query) return;
        if (this.expanded.has(country)) this.expanded.delete(country);
        else this.expanded.add(country);
        this.renderPlaces();
      });
      group.appendChild(head);

      const body = document.createElement('div');
      body.className = 'group-body';
      body.hidden = !open;
      for (const region of regions) {
        body.appendChild(this.createRegionRow(region));
        this.visibleRows.push(region);
      }
      group.appendChild(body);
      list.appendChild(group);
    }

    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.visibleRows.length - 1));
    this.applySelection();
  }

  applySelection() {
    const rows = this.el.placeList.querySelectorAll('.region-row');
    const target = this.visibleRows[this.selectedIndex];
    rows.forEach((row) => {
      const active = Boolean(target) && row.dataset.id === target.id;
      row.classList.toggle('active', active);
      row.setAttribute('aria-selected', String(active));
    });
  }

  moveSelection(delta, focus = false) {
    if (!this.visibleRows.length) return;
    const count = this.visibleRows.length;
    this.selectedIndex = (this.selectedIndex + delta + count) % count;
    this.applySelection();
    const row = this.el.placeList.querySelector(`.region-row[data-id="${this.visibleRows[this.selectedIndex].id}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    if (focus) row.focus({ preventScroll: true });
  }

  chooseRegion(region) {
    if (!this.panelEnabled) return;
    this.setActiveRegion(region);
    this.handlers.onSelect(region);
  }

  setActiveRegion(region) {
    this.activeRegion = region || null;
    if (!region) {
      this.applySelection();
      return;
    }
    const index = this.visibleRows.findIndex((item) => item.id === region.id);
    if (index >= 0) this.selectedIndex = index;
    this.applySelection();
    this.setReadoutTarget(region);
  }

  setQuery(value) {
    this.query = value;
    this.selectedIndex = 0;
    this.el.searchClear.hidden = !value;
    this.renderPlaces();
  }

  clearSearch(focus = false) {
    this.el.searchInput.value = '';
    this.setQuery('');
    if (focus) this.el.searchInput.focus();
  }

  // ---------------------------------------------------------------- signals

  buildSignalList() {
    const list = this.el.signalList;
    list.innerHTML = '';
    for (const signal of SIGNALS) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'signal-row on';
      row.dataset.key = signal.key;
      row.setAttribute('role', 'switch');
      row.setAttribute('aria-checked', 'true');
      row.setAttribute('aria-label', `${signal.label}, ${signal.audio}`);
      row.innerHTML = [
        '<span class="signal-toggle" aria-hidden="true"></span>',
        `<span class="signal-name">${escapeHtml(signal.label)}</span>`,
        '<span class="signal-value">\u2014</span>'
      ].join('');
      row.addEventListener('click', () => {
        if (!this.panelEnabled || row.disabled) return;
        if (this.enabledSignals.has(signal.key)) this.enabledSignals.delete(signal.key);
        else this.enabledSignals.add(signal.key);
        this.renderSignals();
        if (this.handlers.onSignalToggle) this.handlers.onSignalToggle(signal.key, this.enabledSignals.has(signal.key));
      });
      list.appendChild(row);
      this.signalRows.set(signal.key, row);
    }
  }

  formatSignal(signal) {
    const region = this.activeRegion;
    if (!region) return '\u2014';
    if (region.unavailable.includes(signal.key)) return 'N/A';
    const value = region.years[this.activeYear]?.[signal.key];
    if (value === undefined || value === null) return 'N/A';
    let text;
    if (signal.key === 'rain') text = Math.round(value).toLocaleString('en-US');
    else text = Number(value).toFixed(signal.decimals);
    if (signal.key === 'groundwater' && value > 0) text = `+${text}`;
    return signal.unit ? `${text} ${signal.unit}` : text;
  }

  renderSignals() {
    if (!this.activeRegion) return;
    this.el.signalCountry.textContent = this.activeRegion.country;
    this.el.signalRegion.textContent = this.activeRegion.name;

    for (const signal of SIGNALS) {
      const row = this.signalRows.get(signal.key);
      if (!row) continue;
      const unavailable = this.activeRegion.unavailable.includes(signal.key);
      const on = this.enabledSignals.has(signal.key);
      row.classList.toggle('unavailable', unavailable);
      row.classList.toggle('on', on && !unavailable);
      row.classList.toggle('off', !on && !unavailable);
      row.disabled = unavailable || !this.panelEnabled;
      row.setAttribute('aria-checked', String(on && !unavailable));
      row.setAttribute('aria-disabled', String(unavailable));
      row.querySelector('.signal-value').textContent = this.formatSignal(signal);
    }

    const enabled = SIGNALS.filter((signal) => this.enabledSignals.has(signal.key) && !this.activeRegion.unavailable.includes(signal.key));
    this.el.signalCount.textContent = `${enabled.length} of ${SIGNALS.length} on`;
  }

  setYear(year, fromCompare = false) {
    if (!fromCompare) this.stopCompare();
    const value = Math.max(YEAR_RANGE.start, Math.min(YEAR_RANGE.end, Number(year)));
    this.activeYear = value;
    this.el.yearInput.value = String(value);
    this.el.yearLabel.textContent = String(value);
    this.renderSignals();
    if (this.handlers.onYearChange) this.handlers.onYearChange(value);
  }

  startCompare() {
    this.stopCompare();
    this.compareIndex = 0;
    this.el.compareBtn.classList.add('active');
    this.el.compareBtn.textContent = 'Stop compare';
    this.setYear(1985, true);
    this.compareTimer = window.setInterval(() => {
      this.compareIndex = this.compareIndex === 0 ? 1 : 0;
      this.setYear(this.compareIndex === 0 ? 1985 : 2025, true);
    }, 2600);
  }

  stopCompare() {
    if (this.compareTimer) {
      window.clearInterval(this.compareTimer);
      this.compareTimer = null;
    }
    if (this.el.compareBtn.classList.contains('active')) {
      this.el.compareBtn.classList.remove('active');
      this.el.compareBtn.textContent = 'Compare 1985 \u2194 2025';
    }
  }

  toggleCompare() {
    if (this.compareTimer) this.stopCompare();
    else this.startCompare();
  }

  showSignals(region) {
    if (region) this.activeRegion = region;
    this.el.placesView.hidden = true;
    this.el.signalsView.hidden = false;
    this.setYear(this.activeYear, true);
  }

  showPlaces() {
    this.el.signalsView.hidden = true;
    this.el.placesView.hidden = false;
  }

  // ---------------------------------------------------------------- bindings

  bind() {
    this.el.searchInput.addEventListener('input', () => this.setQuery(this.el.searchInput.value));
    this.el.searchInput.addEventListener('keydown', (event) => this.onSearchKey(event));
    this.el.searchClear.addEventListener('click', () => this.clearSearch(true));

    this.el.yearInput.addEventListener('input', () => this.setYear(this.el.yearInput.value));
    this.el.play1985.addEventListener('click', () => {
      this.setYear(1985);
      if (this.handlers.onPlay) this.handlers.onPlay(1985);
    });
    this.el.play2025.addEventListener('click', () => {
      this.setYear(2025);
      if (this.handlers.onPlay) this.handlers.onPlay(2025);
    });
    this.el.compareBtn.addEventListener('click', () => {
      if (!this.panelEnabled) return;
      this.toggleCompare();
      if (this.handlers.onCompare) this.handlers.onCompare(this.compareTimer !== null);
    });

    this.el.backBtn.addEventListener('click', () => this.handlers.onBack());
    this.el.skipBtn.addEventListener('click', () => this.handlers.onSkip());

    window.addEventListener('keydown', (event) => this.onGlobalKey(event));
  }

  onSearchKey(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveSelection(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const region = this.visibleRows[this.selectedIndex];
      if (region) this.chooseRegion(region);
    } else if (event.key === 'Escape') {
      if (this.query) {
        event.preventDefault();
        this.clearSearch(true);
      } else {
        this.el.searchInput.blur();
      }
    }
  }

  onGlobalKey(event) {
    if (!this.panelEnabled || this.el.placesView.hidden) return;
    const target = event.target;
    const tag = target && target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (target && target.isContentEditable)) return;

    if (event.key === '/') {
      event.preventDefault();
      this.el.searchInput.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveSelection(1, true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveSelection(-1, true);
    } else if (event.key === 'Enter') {
      // Select from the list or from an unfocused page. Other buttons (group
      // headers, clear-search) keep their native Enter behaviour.
      const isRow = target && target.classList && target.classList.contains('region-row');
      const isBody = !target || target === document.body;
      if (!isRow && !isBody) return;
      event.preventDefault();
      const region = this.visibleRows[this.selectedIndex];
      if (region) this.chooseRegion(region);
    }
  }

  // ---------------------------------------------------------------- loader / panel

  // Building the veil noise is only needed once a flight starts, and it is
  // expensive enough to stall a frame. Keep it off the startup path and bake it
  // during idle after the reveal instead.
  scheduleVeilNoise() {
    if (this.veilNoiseReady || this.veilNoiseScheduled) return;
    this.veilNoiseScheduled = true;
    const run = () => {
      this.veilNoiseScheduled = false;
      this.makeVeilNoise();
    };
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      window.setTimeout(run, 800);
    }
  }

  makeVeilNoise() {
    if (this.veilNoiseReady) return;
    this.veilNoiseReady = true;
    const size = 340;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(size, size);
    let seed = 8123;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        const wave =
          Math.sin(x * 0.06 + Math.sin(y * 0.04) * 2.2) * 0.5 +
          Math.sin(y * 0.05 + Math.cos(x * 0.035) * 2.6) * 0.5;
        const v = Math.max(0, Math.min(1, 0.5 + wave * 0.22 + (rand() - 0.5) * 0.4));
        const level = Math.round(120 + v * 135);
        image.data[i] = level;
        image.data[i + 1] = level;
        image.data[i + 2] = level;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    this.el.veilNoise.style.backgroundImage = `url(${canvas.toDataURL('image/png')})`;
    this.el.veilNoise.style.backgroundSize = `${size}px ${size}px`;
    gsap.to(this.el.veilNoise, {
      backgroundPosition: `${-size}px ${-size * 0.6}px`,
      duration: 26,
      ease: 'none',
      repeat: -1
    });
  }

  setProgress(value) {
    this.el.loaderFill.style.width = `${Math.round(value * 100)}%`;
    if (value >= 1) this.el.loaderSub.textContent = 'Observatory ready';
  }

  setLoaderSub(text) {
    this.el.loaderSub.textContent = text;
  }

  dismissLoader() {
    return gsap
      .timeline()
      .to(this.el.loader, { opacity: 0, duration: 1.1, ease: 'power2.inOut' })
      .set(this.el.loader, { display: 'none' })
      .fromTo(
        [this.el.masthead, this.el.readout],
        { opacity: 0 },
        { opacity: 1, duration: 1.2, ease: 'power2.out', stagger: 0.15 },
        '-=0.4'
      )
      .fromTo(this.el.panel, { opacity: 0, x: -26 }, { opacity: 1, x: 0, duration: 1.4, ease: 'power2.out' }, '-=1')
      .then();
  }

  isSkipVisible() {
    return !this.el.skipBtn.disabled;
  }

  showSkip() {
    this.el.skipBtn.disabled = false;
    gsap.killTweensOf(this.el.skipBtn);
    gsap.set(this.el.skipBtn, { pointerEvents: 'auto' });
    gsap.to(this.el.skipBtn, { opacity: 1, duration: 0.6, ease: 'power2.out' });
  }

  hideSkip(duration = 0.4) {
    this.el.skipBtn.disabled = true;
    gsap.killTweensOf(this.el.skipBtn);
    gsap.set(this.el.skipBtn, { pointerEvents: 'none' });
    gsap.to(this.el.skipBtn, { opacity: 0, duration, ease: 'power2.in' });
  }

  showSelectionNote(region) {
    this.el.noteEyebrow.textContent = region ? region.country : 'Explore Earth';
    this.el.noteLine.textContent = 'Let\u2019s find somewhere to listen.';
    this.el.noteDest.textContent = region ? `Destination available \u00b7 ${region.name}` : 'Choose a place';
    gsap.killTweensOf(this.el.note);
    gsap.fromTo(
      this.el.note,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out' }
    );
  }

  hideSelectionNote() {
    gsap.killTweensOf(this.el.note);
    gsap.to(this.el.note, { opacity: 0, y: 8, duration: 0.7, ease: 'power2.in' });
  }

  hidePanel(duration = 1.2) {
    gsap.killTweensOf(this.el.panel);
    gsap.to(this.el.panel, { opacity: 0, x: -30, duration, ease: 'power2.inOut' });
  }

  showPanel(duration = 1.2) {
    gsap.killTweensOf(this.el.panel);
    gsap.to(this.el.panel, { opacity: 1, x: 0, duration, ease: 'power2.out' });
  }

  setPanelEnabled(enabled) {
    this.panelEnabled = enabled;
    this.el.searchInput.disabled = !enabled;
    this.el.searchClear.disabled = !enabled;
    this.el.yearInput.disabled = !enabled;
    this.el.play1985.disabled = !enabled;
    this.el.play2025.disabled = !enabled;
    this.el.compareBtn.disabled = !enabled;
    this.el.placeList.querySelectorAll('.region-row, .group-head, .empty-clear').forEach((element) => {
      element.disabled = !enabled;
    });
    this.signalRows.forEach((row) => {
      const unavailable = this.activeRegion && this.activeRegion.unavailable.includes(row.dataset.key);
      row.disabled = !enabled || Boolean(unavailable);
    });
    this.renderSignals();
  }

  setBackLabel(target) {
    this.el.backLabel.textContent = `Back to ${target}`;
  }

  showDestination(region) {
    document.body.classList.add('destination-open');
    this.showSignals(region || this.activeRegion);
    this.showPanel(0.9);
    this.setPanelEnabled(true);
    gsap.to(this.el.backbar, { opacity: 1, duration: 0.9, delay: 0.5, ease: 'power2.out' });
    gsap.set(this.el.backbar, { pointerEvents: 'auto' });
  }

  hideDestination(duration = 0.9) {
    this.stopCompare();
    document.body.classList.remove('destination-open');
    this.showPlaces();
    gsap.to(this.el.backbar, { opacity: 0, duration: 0.6, ease: 'power2.in' });
    gsap.set(this.el.backbar, { pointerEvents: 'none' });
  }

  setReadoutState(name) {
    this.el.roState.textContent = name;
  }

  setReadoutTarget(region) {
    if (!region) return;
    this.el.roTarget.textContent = `${region.name.toLowerCase()} \u00b7 ${formatCoord(region.lat, 'N', 'S')} ${formatCoord(region.lon, 'E', 'W')}`;
    this.el.anchorName.textContent = region.name;
  }

  setVeil(value) {
    if (value > 0 && !this.veilNoiseReady && !this.veilNoiseScheduled) this.makeVeilNoise();
    this.el.veil.style.opacity = String(value);
    this.el.veilNoise.style.opacity = String(value * 0.12);
  }

  setAnchor(x, y, visible, scale = 1) {
    if (visible !== this.anchorVisible) {
      this.anchorVisible = visible;
      gsap.to(this.el.anchor, {
        opacity: visible ? 1 : 0,
        duration: 0.55,
        ease: 'power2.out',
        overwrite: true
      });
    }
    if (!visible) return;
    this.el.anchor.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale.toFixed(3)})`;
  }

  showHint(text, duration = 5) {
    this.el.hint.textContent = text;
    gsap.killTweensOf(this.el.hint);
    gsap.fromTo(
      this.el.hint,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out', onComplete: () => {
        gsap.to(this.el.hint, { opacity: 0, duration: 0.7, delay: duration, ease: 'power2.in' });
      } }
    );
  }
}
