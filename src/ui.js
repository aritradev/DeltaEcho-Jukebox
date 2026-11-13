import { gsap } from '../vendor/gsap/index.js';
import { REGIONS, COUNTRIES, SIGNALS, YEAR_RANGE, COMPARISON_PAIRS } from './regions.js';
import { REGION_IMAGERY } from './region-imagery.js';

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
      loaderProgress: document.getElementById('loader-progress'),
      loaderRetry: document.getElementById('loader-retry'),
      mapStatus: document.getElementById('map-status'),
      mapStatusText: document.getElementById('map-status-text'),
      mapRetry: document.getElementById('map-retry'),
      mapCancel: document.getElementById('map-cancel'),
      mapProvenance: document.getElementById('map-provenance'),
      signalUnavailable: document.getElementById('signal-unavailable'),
      audioControls: document.getElementById('audio-controls'),
      audioStatus: document.getElementById('audio-status'),
      audioMute: document.getElementById('audio-mute'),
      audioVolume: document.getElementById('audio-volume'),
      audioToggle: document.getElementById('audio-toggle'),
      masthead: document.getElementById('masthead'),
      readout: document.getElementById('readout'),
      roState: document.getElementById('ro-state'),
      roTarget: document.getElementById('ro-target'),
      panel: document.getElementById('panel'),
      panelPeek: document.getElementById('panel-peek'),
      peekLabel: document.getElementById('peek-label'),
      peekValue: document.getElementById('peek-value'),
      sheetScrim: document.getElementById('sheet-scrim'),
      placesView: document.getElementById('places-view'),
      signalsView: document.getElementById('signals-view'),
      searchInput: document.getElementById('search-input'),
      searchClear: document.getElementById('search-clear'),
      placeList: document.getElementById('place-list'),
      placeScroll: document.getElementById('place-scroll'),
      signalList: document.getElementById('signal-list'),
      signalCountry: document.getElementById('signal-country'),
      signalRegion: document.getElementById('signal-region'),
      regionSwitcher: document.getElementById('region-switcher'),
      regionSwitcherToggle: document.getElementById('region-switcher-toggle'),
      regionSwitcherMenu: document.getElementById('region-switcher-menu'),
      signalCount: document.getElementById('signal-count'),
      yearLabel: document.getElementById('year-label'),
      yearInput: document.getElementById('year-input'),
      yearMin: document.getElementById('year-min'),
      yearMax: document.getElementById('year-max'),
      play1985: document.getElementById('play-1985'),
      play2025: document.getElementById('play-2025'),
      compareBtn: document.getElementById('compare-btn'),
      comparePairSelect: document.getElementById('compare-pair-select'),
      speakToggle: document.getElementById('speak-toggle'),
      note: document.getElementById('selection-note'),
      noteEyebrow: document.getElementById('sn-eyebrow'),
      noteLine: document.querySelector('.sn-line'),
      noteDest: document.getElementById('sn-dest'),
      anchor: document.getElementById('anchor'),
      anchorName: document.querySelector('#anchor .anchor-copy strong'),
      backbar: document.getElementById('backbar'),
      backBtn: document.getElementById('back-btn'),
      backLabel: document.getElementById('back-label'),
      skipBtn: document.getElementById('skip-btn'),
      hint: document.getElementById('hint'),
      veil: document.getElementById('veil'),
      veilNoise: document.getElementById('veil-noise')
    };

    this.loaderVisible = true;
    this.loaderFailed = false;
    this.loaderProgress = 0;
    this.loaderRegions = document.querySelectorAll('[data-loader-inert]');
    this.warmReturn = document.documentElement.classList.contains('is-warm-return');
    this.pendingRegion = null;
    this.audioState = { status: 'idle', muted: false, volume: 1 };
    this.anchorVisible = false;
    this.hintTimer = null;
    this.veilNoiseReady = false;
    this.veilNoiseScheduled = false;

    this.panelEnabled = false;
    this.panelVisible = true;
    this.sheetState = 'peek';
    this.sheetView = 'places';
    this.sheetInstantTimer = null;
    this.sheetSearchReturn = null;
    this.sheetDrag = null;
    this.suppressPeekClickUntil = 0;
    this.mq = window.matchMedia('(max-width: 820px), (max-width: 1024px) and (max-height: 560px)');
    this.query = '';
    this.expanded = new Set(COUNTRIES.map((country) => country.name));
    this.visibleRows = [];
    this.selectedIndex = 0;
    this.activeRegion = null;
    this.activeYear = YEAR_RANGE.start;
    this.regionSwitcherOpen = false;
    this.regionOptionEls = new Map();
    this.enabledSignals = new Set(SIGNALS.map((signal) => signal.key));
    this.signalRows = new Map();
    this.compareTimer = null;
    this.compareIndex = 0;
    this.compareYearA = 1985;
    this.compareYearB = 2025;
    this.speechEnabled = false;
    this.speech = window.speechSynthesis || null;
    this.speechUtterance = null;
    this.speechTimer = null;
    if (!this.speech) {
      this.el.speakToggle.disabled = true;
      this.el.speakToggle.title = 'Speech synthesis is not available in this browser.';
    }

    this.el.yearInput.min = String(YEAR_RANGE.start);
    this.el.yearInput.max = String(YEAR_RANGE.end);
    this.el.yearMin.textContent = String(YEAR_RANGE.start);
    this.el.yearMax.textContent = String(YEAR_RANGE.end);

    this.defaultPairOptions = [...this.el.comparePairSelect.options].map((option) => ({
      value: option.value,
      text: option.textContent
    }));

    this.readComparePair();
    this.syncCompareLabels();
    this.buildSignalList();
    this.buildRegionSwitcher();
    this.renderPlaces();
    this.bind();
    this.bindViewport();
    this.setView(this.sheetView);
    this.setSheetState(this.el.panel.dataset.sheet || 'peek', { animate: false });
    this.setAudioState(this.audioState);
    if (this.warmReturn) this.dismissLoaderInstant();
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
    row.disabled = !this.panelEnabled;
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
      head.disabled = !this.panelEnabled;
      const open = query ? true : this.expanded.has(country);
      head.setAttribute('aria-expanded', String(open));
      head.innerHTML = [
        `<span class="group-toggle" aria-hidden="true">${open ? '\u25be' : '\u25b8'}</span>`,
        `<span class="group-name">${escapeHtml(country)}</span>`,
        `<span class="group-count">${String(regions.length).padStart(2, '0')}</span>`
      ].join('');
      head.addEventListener('click', () => {
        if (this.query || !this.panelEnabled) return;
        if (this.expanded.has(country)) this.expanded.delete(country);
        else this.expanded.add(country);
        const hadFocus = document.activeElement === head;
        this.renderPlaces();
        if (hadFocus) {
          const replacement = [...list.querySelectorAll('.group-head')]
            .find((item) => item.querySelector('.group-name').textContent === country);
          replacement?.focus({ preventScroll: true });
        }
      });
      group.appendChild(head);

      const body = document.createElement('div');
      body.className = 'group-body';
      body.hidden = !open;
      for (const region of regions) {
        body.appendChild(this.createRegionRow(region));
        if (open) this.visibleRows.push(region);
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
      const active = row.dataset.id === this.activeRegion?.id;
      const focused = row.dataset.id === target?.id;
      row.classList.toggle('active', active);
      row.classList.toggle('focused', focused);
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
    this.handlers.onSelect(region);
  }

  setActiveRegion(region) {
    this.activeRegion = region || null;
    this.syncRegionSwitcher();
    if (!region) {
      this.applySelection();
      this.syncPeek();
      return;
    }
    this.syncYearRange(region);
    const index = this.visibleRows.findIndex((item) => item.id === region.id);
    if (index >= 0) this.selectedIndex = index;
    this.applySelection();
    this.setReadoutTarget(region);
    this.syncPeek();
  }

  setQuery(value) {
    this.query = value;
    this.selectedIndex = 0;
    this.el.searchClear.hidden = !value;
    this.renderPlaces();
    if (!value && this.activeRegion) {
      const index = this.visibleRows.findIndex((region) => region.id === this.activeRegion.id);
      if (index >= 0) this.selectedIndex = index;
      this.applySelection();
    }
  }

  clearSearch(focus = false) {
    this.el.searchInput.value = '';
    this.setQuery('');
    if (focus) this.el.searchInput.focus();
  }

  setMapStatus(region, failed = false) {
    this.pendingRegion = region || null;
    const hadFocus = this.el.mapStatus.contains(document.activeElement);
    this.el.mapStatus.hidden = !region;
    this.el.mapStatus.classList.toggle('failed', Boolean(region && failed));
    this.el.panel.dataset.mapStatus = region ? (failed ? 'failed' : 'pending') : '';
    this.el.mapRetry.hidden = !region || !failed;
    this.el.mapRetry.disabled = !region || !failed;
    this.el.mapCancel.disabled = !region;
    this.el.mapStatusText.textContent = !region ? '' : failed
      ? `Could not prepare maps for ${region.name}. Retry, cancel, or choose another place.`
      : `Preparing maps for ${region.name}`;
    if (region) {
      if (this.isMobileSheet() && this.sheetState === 'peek') this.setSheetState('half');
      this.el.placeScroll.scrollTop = 0;
    } else if (hadFocus) {
      if (this.isMobileSheet()) this.el.panelPeek.focus({ preventScroll: true });
      else this.el.searchInput.focus({ preventScroll: true });
    }
    this.syncPeek();
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
        '<span class="signal-body">',
        `<span class="signal-name">${escapeHtml(signal.label)}</span>`,
        `<span class="signal-audio">${escapeHtml(signal.audio)}</span>`,
        '</span>',
        '<span class="signal-delta" hidden></span>',
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

  // In-place destination switcher for the signals view. Options are grouped by
  // country/EIC series so all eight destinations are reachable without flying
  // back to the solar system first.
  buildRegionSwitcher() {
    const menu = this.el.regionSwitcherMenu;
    menu.innerHTML = '';
    this.regionOptionEls.clear();

    const appendGroup = (label, regions) => {
      if (!regions.length) return;
      const group = document.createElement('div');
      group.className = 'region-switcher-group';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', label);
      const head = document.createElement('p');
      head.className = 'region-switcher-group-label';
      head.textContent = label;
      head.setAttribute('aria-hidden', 'true');
      group.appendChild(head);
      for (const region of regions) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'region-switcher-option';
        option.dataset.id = region.id;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.tabIndex = -1;
        option.innerHTML = [
          `<span class="region-switcher-name">${escapeHtml(region.name)}</span>`,
          `<span class="region-switcher-option-meta">${escapeHtml(region.short)}</span>`
        ].join('');
        option.addEventListener('click', () => this.selectRegionFromSwitcher(region));
        group.appendChild(option);
        this.regionOptionEls.set(region.id, option);
      }
      menu.appendChild(group);
    };

    const grouped = new Set();
    for (const country of COUNTRIES) {
      grouped.add(country.name);
      appendGroup(country.name, REGIONS.filter((region) => region.country === country.name));
    }
    appendGroup('More destinations', REGIONS.filter((region) => !grouped.has(region.country)));
    this.syncRegionSwitcher();
  }

  syncRegionSwitcher() {
    const activeId = this.activeRegion?.id || null;
    for (const [id, option] of this.regionOptionEls) {
      const selected = id === activeId;
      option.setAttribute('aria-selected', String(selected));
      option.tabIndex = selected ? 0 : -1;
    }
    if (!this.regionSwitcherOpen) return;
    const current = activeId && this.regionOptionEls.get(activeId);
    if (current) current.scrollIntoView({ block: 'nearest' });
  }

  setRegionSwitcherOpen(open, { focus = false } = {}) {
    const next = Boolean(open);
    if (next === this.regionSwitcherOpen) {
      if (next && focus) this.focusRegionOption();
      return;
    }
    this.regionSwitcherOpen = next;
    this.el.regionSwitcherMenu.hidden = !next;
    this.el.regionSwitcherToggle.setAttribute('aria-expanded', String(next));
    if (next) {
      this.syncRegionSwitcher();
      if (focus) this.focusRegionOption();
    } else if (focus) {
      this.el.regionSwitcherToggle.focus({ preventScroll: true });
    }
  }

  focusRegionOption() {
    const current = this.activeRegion && this.regionOptionEls.get(this.activeRegion.id);
    const first = this.regionOptionEls.values().next().value;
    const target = current || first;
    target?.focus({ preventScroll: true });
  }

  selectRegionFromSwitcher(region) {
    if (!region) return;
    this.setRegionSwitcherOpen(false, { focus: true });
    if (region.id === this.activeRegion?.id) return;
    this.handlers.onSwitchRegion?.(region);
  }

  onRegionSwitcherKey(event) {
    const options = [...this.regionOptionEls.values()];
    if (!options.length) return;
    const index = options.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.setRegionSwitcherOpen(false, { focus: true });
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = index < 0 ? 0 : (index + step + options.length) % options.length;
      options[next].focus({ preventScroll: true });
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      options[event.key === 'Home' ? 0 : options.length - 1].focus({ preventScroll: true });
    } else if (event.key === 'Tab') {
      this.setRegionSwitcherOpen(false);
    }
  }

  isSignalAvailable(key) {
    const region = this.activeRegion;
    const value = region?.years[this.activeYear]?.[key];
    return Boolean(region) && !region.unavailable.includes(key)
      && value !== undefined && value !== null && Number.isFinite(Number(value));
  }

  firstAvailableYear(region) {
    if (!region) return YEAR_RANGE.start;
    const years = Object.keys(region.years || {}).map(Number).sort((a, b) => a - b);
    return years.length ? years[0] : YEAR_RANGE.start;
  }

  regionYearBounds(region) {
    const years = Object.keys(region?.years || {}).map(Number).sort((a, b) => a - b);
    return {
      first: years.length ? years[0] : YEAR_RANGE.start,
      last: years.length ? years[years.length - 1] : YEAR_RANGE.end
    };
  }

  setPairOptions(options, preferred) {
    const current = this.el.comparePairSelect.value;
    const values = new Set(options.map((option) => option.value));
    const keep = values.has(current)
      ? current
      : values.has(preferred) ? preferred : options[0]?.value;
    this.el.comparePairSelect.innerHTML = options
      .map((option) => `<option value="${option.value}">${escapeHtml(option.text)}</option>`)
      .join('');
    if (keep) this.el.comparePairSelect.value = keep;
  }

  // Restricted datasets (the two NASA EIC regions start in 2000) get a slider
  // and comparison list that only offer years that actually have values.
  syncYearRange(region) {
    const { first, last } = this.regionYearBounds(region);
    this.el.yearInput.min = String(first);
    this.el.yearInput.max = String(last);
    this.el.yearMin.textContent = String(first);
    this.el.yearMax.textContent = String(last);

    const full = first === YEAR_RANGE.start && last === YEAR_RANGE.end;
    if (full) {
      this.setPairOptions(this.defaultPairOptions, '1985:2025');
    } else {
      const options = [{ value: `${first}:${last}`, text: `${first} \u2194 ${last} (Full span)` }];
      for (const pair of COMPARISON_PAIRS) {
        if (!region?.years?.[pair.yearA] || !region?.years?.[pair.yearB]) continue;
        options.push({
          value: `${pair.yearA}:${pair.yearB}`,
          text: `${pair.yearA} \u2194 ${pair.yearB} (${pair.interval})`
        });
      }
      this.setPairOptions(options, `${first}:${last}`);
    }

    if (this.compareTimer) this.stopCompare();
    this.readComparePair();
    this.syncCompareLabels();
  }

  readComparePair() {
    const [a, b] = String(this.el.comparePairSelect?.value || '1985:2025').split(':').map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      this.compareYearA = a;
      this.compareYearB = b;
    }
  }

  syncCompareLabels() {
    const a = this.compareYearA;
    const b = this.compareYearB;
    this.el.play1985.textContent = `Play ${a}`;
    this.el.play2025.textContent = `Play ${b}`;
    this.el.compareBtn.textContent = this.compareTimer ? 'Stop compare' : `Compare ${a} \u2194 ${b}`;
  }

  signalDelta(signal) {
    const region = this.activeRegion;
    if (!this.compareTimer || !region || region.unavailable.includes(signal.key)) return null;
    const a = region.years[this.compareYearA]?.[signal.key];
    const b = region.years[this.compareYearB]?.[signal.key];
    if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return null;
    return Number(b) - Number(a);
  }

  formatDelta(signal, delta) {
    const rounded = signal.decimals === 0
      ? Math.round(delta)
      : Number(delta.toFixed(signal.decimals));
    const unit = signal.unit ? ` ${signal.unit}` : '';
    if (rounded === 0) return `\u0394 0${unit}`;
    const text = Math.abs(rounded).toLocaleString('en-US', {
      minimumFractionDigits: signal.decimals,
      maximumFractionDigits: signal.decimals
    });
    return `\u0394 ${rounded > 0 ? '+' : '\u2212'}${text}${unit}`;
  }

  topChanges(count = 2) {
    const region = this.activeRegion;
    if (!region) return [];
    const baselineYear = this.compareTimer ? this.compareYearA : this.firstAvailableYear(region);
    const baseline = region.years[baselineYear];
    const current = region.years[this.activeYear];
    if (!baseline || !current) return [];
    const changes = [];
    for (const signal of SIGNALS) {
      if (region.unavailable.includes(signal.key)) continue;
      const a = Number(baseline[signal.key]);
      const b = Number(current[signal.key]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const delta = b - a;
      if (!delta) continue;
      const span = Array.isArray(signal.range) ? signal.range[1] - signal.range[0] : 1;
      changes.push({ signal, delta, weight: Math.abs(delta) / (span || 1) });
    }
    changes.sort((a, b) => b.weight - a.weight);
    return changes.slice(0, count).map(({ signal, delta }) => {
      const magnitude = signal.decimals === 0
        ? Math.round(Math.abs(delta)).toLocaleString('en-US')
        : Math.abs(delta).toFixed(signal.decimals);
      return `${signal.label} ${delta > 0 ? 'up' : 'down'} ${magnitude}${signal.unit ? ` ${signal.unit}` : ''}`;
    });
  }

  cancelSpeech() {
    if (this.speech) this.speech.cancel();
    this.speechUtterance = null;
  }

  speak(text) {
    if (!this.speech || !text) return;
    this.speech.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.02;
    utterance.pitch = 1;
    this.speechUtterance = utterance;
    this.speech.speak(utterance);
  }

  speakSummary() {
    if (!this.speechEnabled || !this.activeRegion) return;
    const region = this.activeRegion;
    const parts = [`${region.name}. Year ${this.activeYear}.`];
    const changes = this.topChanges(2);
    if (changes.length) parts.push(`Largest changes: ${changes.join('; ')}.`);
    this.speak(parts.join(' '));
  }

  scheduleSpeech() {
    if (!this.speechEnabled) return;
    window.clearTimeout(this.speechTimer);
    this.speechTimer = window.setTimeout(() => this.speakSummary(), 350);
  }

  setSpeechEnabled(on) {
    this.speechEnabled = Boolean(on) && Boolean(this.speech);
    this.el.speakToggle.setAttribute('aria-pressed', String(this.speechEnabled));
    this.el.speakToggle.textContent = this.speechEnabled ? 'Voice guide on' : 'Voice guide';
    if (!this.speechEnabled) {
      window.clearTimeout(this.speechTimer);
      this.cancelSpeech();
      return;
    }
    this.speakSummary();
  }

  formatSignal(signal) {
    const region = this.activeRegion;
    if (!region) return '\u2014';
    if (!this.isSignalAvailable(signal.key)) return 'N/A';
    const value = region.years[this.activeYear]?.[signal.key];
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
    const plate = REGION_IMAGERY[this.activeRegion.id];
    this.el.mapProvenance.textContent = plate
      ? `Map: ${plate.label}. ${plate.note}${plate.credit ? ` Source: ${plate.credit}.` : ''}`
      : 'Map: generated survey plate, not satellite imagery or imagery for the selected year.';
    this.el.signalUnavailable.hidden = SIGNALS.every((signal) => this.isSignalAvailable(signal.key));

    for (const signal of SIGNALS) {
      const row = this.signalRows.get(signal.key);
      if (!row) continue;
      const unavailable = !this.isSignalAvailable(signal.key);
      const on = this.enabledSignals.has(signal.key);
      row.classList.toggle('unavailable', unavailable);
      row.classList.toggle('on', on && !unavailable);
      row.classList.toggle('off', !on && !unavailable);
      row.disabled = unavailable || !this.panelEnabled;
      row.setAttribute('aria-checked', String(on && !unavailable));
      row.setAttribute('aria-disabled', String(unavailable));
      const value = this.formatSignal(signal);
      row.querySelector('.signal-value').textContent = value;
      const delta = this.signalDelta(signal);
      const deltaEl = row.querySelector('.signal-delta');
      if (deltaEl) {
        deltaEl.hidden = delta === null;
        deltaEl.textContent = delta === null ? '' : this.formatDelta(signal, delta);
      }
      row.classList.toggle('comparing', delta !== null);
      const deltaNote = delta === null ? '' : `, ${this.formatDelta(signal, delta)}`;
      row.setAttribute('aria-label', `${signal.label}, ${unavailable ? 'unavailable: no source value; layer silent' : `${value}${deltaNote}, ${signal.audio}`}`);
      if (unavailable) row.setAttribute('aria-describedby', 'signal-unavailable');
      else row.removeAttribute('aria-describedby');
    }

    const enabled = SIGNALS.filter((signal) => this.enabledSignals.has(signal.key) && this.isSignalAvailable(signal.key));
    this.el.signalCount.textContent = `${enabled.length} of ${SIGNALS.length} on`;
    this.syncRegionSwitcher();
    this.syncPeek();
  }

  setYear(year, fromCompare = false) {
    if (!fromCompare) this.stopCompare();
    const { first, last } = this.regionYearBounds(this.activeRegion);
    const value = Math.max(first, Math.min(last, Number(year)));
    this.activeYear = value;
    this.el.yearInput.value = String(value);
    this.el.yearLabel.textContent = String(value);
    this.renderSignals();
    if (this.handlers.onYearChange) this.handlers.onYearChange(value);
    if (!fromCompare) this.scheduleSpeech();
  }

  startCompare() {
    this.stopCompare();
    this.compareIndex = 0;
    this.el.compareBtn.classList.add('active');
    this.el.compareBtn.textContent = 'Stop compare';
    this.setYear(this.compareYearA, true);
    this.compareTimer = window.setInterval(() => {
      this.compareIndex = this.compareIndex === 0 ? 1 : 0;
      this.setYear(this.compareIndex === 0 ? this.compareYearA : this.compareYearB, true);
    }, 2600);
    this.renderSignals();
  }

  stopCompare() {
    if (this.compareTimer) {
      window.clearInterval(this.compareTimer);
      this.compareTimer = null;
    }
    this.el.compareBtn.classList.remove('active');
    this.syncCompareLabels();
    this.renderSignals();
  }

  toggleCompare() {
    if (this.compareTimer) this.stopCompare();
    else this.startCompare();
  }

  showSignals(region) {
    if (region) this.setActiveRegion(region);
    if (this.activeRegion && !this.activeRegion.years[this.activeYear]) {
      this.activeYear = this.firstAvailableYear(this.activeRegion);
    }
    this.setView('signals');
    this.el.placesView.hidden = true;
    this.el.signalsView.hidden = false;
    this.setYear(this.activeYear, true);
    this.speakSummary();
  }

  showPlaces() {
    this.setView('places');
    this.el.signalsView.hidden = true;
    this.el.placesView.hidden = false;
    this.syncPeek();
  }

  // ---------------------------------------------------------------- audio

  setAudioState(state) {
    this.audioState = { ...state };
    const { status, muted, volume } = this.audioState;
    const labels = {
      idle: 'Audio idle', ready: 'Audio ready', playing: 'Playing',
      paused: 'Audio paused', blocked: 'Audio blocked', unavailable: 'Audio unavailable'
    };
    const text = labels[status] || labels.idle;
    this.el.audioStatus.textContent = `${text}${muted ? ' · muted' : volume === 0 ? ' · volume 0' : ''}`;
    this.el.audioControls.dataset.status = status;
    this.el.audioMute.setAttribute('aria-pressed', String(Boolean(muted)));
    this.el.audioMute.textContent = muted ? 'Muted' : 'Mute';
    this.el.audioVolume.value = String(volume);
    this.el.audioVolume.setAttribute('aria-valuetext', `${Math.round(volume * 100)}%`);
    const canToggle = Boolean(this.activeRegion) && document.body.classList.contains('destination-open')
      && ['playing', 'paused', 'ready', 'blocked', 'idle'].includes(status);
    if (!canToggle && document.activeElement === this.el.audioToggle) {
      this.el.audioMute.focus({ preventScroll: true });
    }
    const playing = status === 'playing';
    this.el.audioToggle.hidden = !canToggle;
    this.el.audioToggle.disabled = !canToggle;
    this.el.audioToggle.textContent = playing ? '⏸ Pause' : '▶ Play';
    this.el.audioToggle.setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
    this.el.audioToggle.setAttribute('aria-pressed', String(playing));
  }

  // ---------------------------------------------------------------- bindings

  bind() {
    this.el.loaderRetry.addEventListener('click', () => window.location.reload());
    this.el.mapRetry.addEventListener('click', () => this.handlers.onRetrySelection?.());
    this.el.mapCancel.addEventListener('click', () => this.handlers.onCancelSelection?.());
    this.el.audioMute.addEventListener('click', () => this.handlers.onMuteChange?.(!this.audioState.muted));
    this.el.audioVolume.addEventListener('input', () => this.handlers.onVolumeChange?.(Number(this.el.audioVolume.value)));
    this.el.audioToggle.addEventListener('click', () => this.handlers.onToggleAudio?.());
    this.el.signalRegion.addEventListener('click', () => this.setRegionSwitcherOpen(!this.regionSwitcherOpen, { focus: true }));
    this.el.regionSwitcherToggle.addEventListener('click', () => this.setRegionSwitcherOpen(!this.regionSwitcherOpen, { focus: true }));
    this.el.regionSwitcherToggle.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.setRegionSwitcherOpen(true, { focus: true });
      }
    });
    this.el.regionSwitcherMenu.addEventListener('keydown', (event) => this.onRegionSwitcherKey(event));
    document.addEventListener('pointerdown', (event) => {
      if (!this.regionSwitcherOpen) return;
      if (this.el.regionSwitcher.contains(event.target)) return;
      this.setRegionSwitcherOpen(false);
    });
    this.el.searchInput.addEventListener('input', () => this.setQuery(this.el.searchInput.value));
    this.el.searchInput.addEventListener('keydown', (event) => this.onSearchKey(event));
    this.el.searchInput.addEventListener('focus', () => this.onSearchFocus());
    this.el.searchInput.addEventListener('blur', () => this.onSearchBlur());
    this.el.searchClear.addEventListener('click', () => this.clearSearch(true));

    this.el.panelPeek.addEventListener('click', (event) => this.onPeekClick(event));
    this.el.panelPeek.addEventListener('keydown', (event) => this.onPeekKey(event));
    this.el.panelPeek.addEventListener('pointerdown', (event) => this.onPeekPointerDown(event));
    this.el.panelPeek.addEventListener('pointermove', (event) => this.onPeekPointerMove(event));
    this.el.panelPeek.addEventListener('pointerup', (event) => this.onPeekPointerUp(event));
    this.el.panelPeek.addEventListener('pointercancel', (event) => this.onPeekPointerUp(event));
    this.el.sheetScrim.addEventListener('click', () => {
      if (this.sheetState === 'full') this.setSheetState('peek');
    });
    this.mq.addEventListener('change', (event) => this.onMobileChange(event));

    this.el.yearInput.addEventListener('input', () => this.setYear(this.el.yearInput.value));
    this.el.play1985.addEventListener('click', () => {
      this.setYear(this.compareYearA);
      if (this.handlers.onPlay) this.handlers.onPlay(this.compareYearA);
    });
    this.el.play2025.addEventListener('click', () => {
      this.setYear(this.compareYearB);
      if (this.handlers.onPlay) this.handlers.onPlay(this.compareYearB);
    });
    this.el.compareBtn.addEventListener('click', () => {
      if (!this.panelEnabled) return;
      this.toggleCompare();
      if (this.handlers.onCompare) this.handlers.onCompare(this.compareTimer !== null);
    });
    this.el.comparePairSelect.addEventListener('change', () => {
      this.readComparePair();
      if (this.compareTimer) this.startCompare();
      else {
        this.syncCompareLabels();
        this.renderSignals();
      }
      this.scheduleSpeech();
    });
    this.el.speakToggle.addEventListener('click', () => this.setSpeechEnabled(!this.speechEnabled));

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
      event.stopPropagation();
      if (this.query) {
        event.preventDefault();
        this.clearSearch(true);
      } else {
        this.el.searchInput.blur();
      }
    }
  }

  onGlobalKey(event) {
    if (this.loaderVisible || !this.panelEnabled || event.defaultPrevented) return;
    const target = event.target;
    if (target instanceof Node && this.el.audioControls.contains(target)) return;
    const tag = target && target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;

    if (!this.el.signalsView.hidden) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.setYear(this.activeYear - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.setYear(this.activeYear + 1);
      } else if ((event.key === 'c' || event.key === 'C') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        this.toggleCompare();
        if (this.handlers.onCompare) this.handlers.onCompare(this.compareTimer !== null);
      }
      return;
    }

    if (this.el.placesView.hidden) return;
    const mobilePeek = this.isMobileSheet() && this.sheetState === 'peek';

    if (event.key === '/') {
      event.preventDefault();
      if (mobilePeek) this.setSheetState('half');
      this.el.searchInput.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (mobilePeek) this.setSheetState('half');
      this.moveSelection(1, true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (mobilePeek) this.setSheetState('half');
      this.moveSelection(-1, true);
    } else if (event.key === 'Enter') {
      if (mobilePeek) {
        event.preventDefault();
        this.setSheetState('half', { focus: true });
        return;
      }
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
    if (this.loaderFailed || !Number.isFinite(Number(value))) return;
    this.loaderProgress = Math.max(this.loaderProgress, Math.max(0, Math.min(1, Number(value))));
    this.el.loaderFill.style.transform = `scaleX(${this.loaderProgress})`;
    this.el.loaderProgress.setAttribute('aria-valuenow', String(Math.round(this.loaderProgress * 100)));
  }

  setLoaderSub(text) {
    if (!this.loaderFailed) this.el.loaderSub.textContent = text;
  }

  showLoaderError(message) {
    this.loaderFailed = true;
    // A warm return hides the loader; a startup failure must bring it back so
    // the error and its Retry control are visible.
    this.loaderVisible = true;
    document.documentElement.classList.remove('is-warm-return');
    try {
      sessionStorage.removeItem('jukebox:warmed');
    } catch (error) {
      // Ignore storage failures; the loader is already visible again.
    }
    gsap.set(this.el.loader, { display: 'flex', opacity: 1 });
    this.el.loader.removeAttribute('aria-hidden');
    this.loaderRegions.forEach((region) => { region.inert = true; });
    this.el.loader.classList.add('failed');
    this.el.loaderProgress.dataset.state = 'failed';
    this.el.loaderProgress.setAttribute('aria-valuetext', 'Loading failed');
    const detail = String(message || 'The observatory could not be prepared.').trim();
    this.el.loaderSub.textContent = `${/[.!?]$/.test(detail) ? detail : `${detail}.`} Reload to try again.`;
    this.el.loaderRetry.hidden = false;
  }

  dismissLoader(onHidden) {
    return gsap
      .timeline()
      .to(this.el.loader, { opacity: 0, duration: 1.1, ease: 'power2.inOut' })
      .set(this.el.loader, { display: 'none', onComplete: () => {
        this.loaderVisible = false;
        this.loaderRegions.forEach((region) => { region.inert = false; });
        this.el.panel.inert = !this.panelVisible;
        this.syncBackbarAria();
        onHidden?.();
      } })
      .fromTo(
        [this.el.masthead, this.el.readout],
        { opacity: 0 },
        { opacity: 1, duration: 1.2, ease: 'power2.out', stagger: 0.15 },
        '-=0.4'
      )
      .fromTo(this.el.panel, { opacity: 0, x: -26 }, { opacity: 1, x: 0, duration: 1.4, ease: 'power2.out' }, '-=1')
      .then();
  }

  // A warm return drops the loader before the first frame: no dive, no fade,
  // no progress bar. The HUD is released from its inert loading state and
  // starts at its resting opacity.
  dismissLoaderInstant() {
    this.loaderVisible = false;
    this.loaderProgress = 1;
    gsap.killTweensOf(this.el.loader);
    gsap.set(this.el.loader, { display: 'none', opacity: 0 });
    this.el.loader.setAttribute('aria-hidden', 'true');
    this.el.loaderFill.style.transform = 'scaleX(1)';
    this.el.loaderProgress.setAttribute('aria-valuenow', '100');
    this.loaderRegions.forEach((region) => { region.inert = false; });
    this.el.panel.inert = !this.panelVisible;
    this.syncBackbarAria();
    gsap.set([this.el.masthead, this.el.readout], { opacity: 1 });
    if (!this.isMobileSheet()) gsap.set(this.el.panel, { opacity: 1, x: 0 });
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

  hidePanel(duration = 1.2, { delay = 0 } = {}) {
    this.panelVisible = false;
    this.el.panel.inert = true;
    if (this.isMobileSheet()) {
      this.setSheetState('hidden', { animate: false });
      return;
    }
    gsap.killTweensOf(this.el.panel);
    gsap.to(this.el.panel, {
      opacity: 0,
      x: -30,
      duration,
      delay,
      ease: 'power2.inOut'
    });
  }

  showPanel(duration = 1.2, { state = 'peek' } = {}) {
    this.panelVisible = true;
    this.el.panel.inert = this.loaderVisible;
    if (this.isMobileSheet()) {
      this.setSheetState(state, { animate: true });
      return;
    }
    gsap.killTweensOf(this.el.panel);
    gsap.to(this.el.panel, { opacity: 1, x: 0, duration, ease: 'power2.out' });
  }

  isMobileSheet() {
    return this.mq.matches;
  }

  setView(view) {
    this.sheetView = view === 'signals' ? 'signals' : 'places';
    if (this.sheetView !== 'signals') this.setRegionSwitcherOpen(false);
    this.el.panel.dataset.view = this.sheetView;
    this.el.panel.setAttribute('aria-label', this.sheetView === 'signals' ? 'Sound layers' : 'Place explorer');
    this.syncPeek();
  }

  syncBackbarAria() {
    const inAtlas = document.body.classList.contains('destination-open');
    const tucked = this.isMobileSheet() && (this.sheetState === 'half' || this.sheetState === 'full');
    this.el.backbar.setAttribute('aria-hidden', String(!inAtlas || tucked));
    this.el.backbar.inert = this.loaderVisible || !inAtlas || tucked;
  }

  syncPeek() {
    const region = this.activeRegion;
    if (this.sheetView === 'signals') {
      const available = region
        ? SIGNALS.filter((signal) => this.enabledSignals.has(signal.key) && this.isSignalAvailable(signal.key)).length
        : 0;
      this.el.peekLabel.textContent = region ? `signals \u00b7 ${region.name}` : 'signals';
      this.el.peekValue.textContent = region ? `${available} on \u00b7 ${this.activeYear}` : '';
      this.el.panelPeek.setAttribute('aria-label', `Sound layers for ${region?.name || 'destination'}, ${available} on, ${this.activeYear}. Expand or collapse panel.`);
      return;
    }
    this.el.peekLabel.textContent = this.pendingRegion
      ? (this.el.mapStatus.classList.contains('failed') ? 'Maps failed · retry' : 'Preparing maps')
      : `choose a place \u00b7 ${String(REGIONS.length).padStart(2, '0')}`;
    this.el.peekValue.textContent = region ? region.name : 'Choose a place';
    this.el.panelPeek.setAttribute('aria-label', this.pendingRegion
      ? `${this.el.mapStatusText.textContent} Open places for options. Current destination: ${region?.name || 'none'}.`
      : `Choose a place to fly there and hear its data. Current destination: ${region?.name || 'none'}. Expand or collapse places.`);
  }

  setSheetState(state, { animate = true, focus = false } = {}) {
    if (!['peek', 'half', 'full', 'hidden'].includes(state)) return;
    this.sheetState = state;
    this.panelVisible = state !== 'hidden';
    this.syncBackbarAria();
    if (!this.isMobileSheet()) return;

    const panel = this.el.panel;
    if (!animate) {
      panel.classList.add('is-instant');
      if (this.sheetInstantTimer) window.clearTimeout(this.sheetInstantTimer);
      this.sheetInstantTimer = window.setTimeout(() => {
        panel.classList.remove('is-instant');
        this.sheetInstantTimer = null;
      }, 0);
    } else if (this.sheetInstantTimer) {
      window.clearTimeout(this.sheetInstantTimer);
      this.sheetInstantTimer = null;
      panel.classList.remove('is-instant');
    }

    gsap.killTweensOf(panel);
    panel.style.opacity = '';
    panel.style.transform = '';
    panel.dataset.sheet = state;
    panel.inert = this.loaderVisible || state === 'hidden';
    this.el.panelPeek.setAttribute('aria-expanded', String(state === 'half' || state === 'full'));

    if (state !== 'full') panel.dataset.search = 'closed';
    if (state === 'peek' || state === 'hidden') {
      if (document.activeElement === this.el.searchInput) this.el.searchInput.blur();
      this.sheetSearchReturn = null;
    }
    if (state === 'hidden' && document.activeElement && panel.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    if (focus && state !== 'hidden') {
      this.el.panelPeek.focus({ preventScroll: true });
    }
  }

  stepSheet(direction) {
    const order = ['peek', 'half', 'full'];
    const index = order.indexOf(this.sheetState);
    if (index < 0) return;
    const next = order[Math.max(0, Math.min(order.length - 1, index + direction))];
    if (next !== this.sheetState) this.setSheetState(next, { focus: true });
  }

  onPeekClick(event) {
    if (!this.panelEnabled || !this.isMobileSheet()) return;
    if (performance.now() < this.suppressPeekClickUntil) {
      event.preventDefault();
      return;
    }
    if (this.sheetState === 'peek') this.setSheetState('half');
    else if (this.sheetState === 'half' || this.sheetState === 'full') {
      this.setSheetState(this.sheetState === 'full' ? 'half' : 'peek');
    }
  }

  onPeekKey(event) {
    if (!this.isMobileSheet()) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.stepSheet(1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.stepSheet(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.setSheetState('peek', { focus: true });
    } else if (event.key === 'End') {
      event.preventDefault();
      this.setSheetState('full', { focus: true });
    }
  }

  onPeekPointerDown(event) {
    if (!this.isMobileSheet() || !this.panelEnabled) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (this.sheetState === 'hidden') return;
    this.sheetDrag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      state: this.sheetState,
      moved: false,
      horizontal: false
    };
    try {
      this.el.panelPeek.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the pointer is already gone; the drag then
      // simply never starts.
    }
  }

  onPeekPointerMove(event) {
    const drag = this.sheetDrag;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        drag.horizontal = true;
        return;
      }
      if (Math.abs(dy) < 8) return;
      drag.moved = true;
    }
    event.preventDefault();
  }

  onPeekPointerUp(event) {
    const drag = this.sheetDrag;
    if (!drag || drag.id !== event.pointerId) return;
    this.sheetDrag = null;
    try {
      this.el.panelPeek.releasePointerCapture(event.pointerId);
    } catch {
      // The browser releases capture itself on pointercancel.
    }
    if (event.type === 'pointercancel' || !drag.moved) {
      if (drag.horizontal) this.suppressPeekClickUntil = performance.now() + 400;
      return;
    }
    this.suppressPeekClickUntil = performance.now() + 400;
    const dy = event.clientY - drag.y;
    if (Math.abs(dy) < 24) return;
    const order = ['peek', 'half', 'full'];
    const index = order.indexOf(drag.state);
    if (index < 0) return;
    const next = order[Math.max(0, Math.min(order.length - 1, index + (dy < 0 ? 1 : -1)))];
    if (next !== drag.state) this.setSheetState(next);
  }

  onSearchFocus() {
    if (!this.isMobileSheet() || !this.panelEnabled) return;
    this.sheetSearchReturn = this.sheetState === 'peek' ? 'half' : this.sheetState;
    if (this.sheetState !== 'full') this.setSheetState('full');
    this.el.panel.dataset.search = 'open';
  }

  onSearchBlur() {
    window.setTimeout(() => {
      if (!this.isMobileSheet() || document.activeElement === this.el.searchInput) return;
      if (this.sheetState === 'peek' || this.sheetState === 'hidden') return;
      this.el.panel.dataset.search = 'closed';
      const restore = this.sheetSearchReturn;
      this.sheetSearchReturn = null;
      if (!this.query && restore && restore !== 'full') this.setSheetState(restore);
    }, 0);
  }

  onMobileChange(event) {
    const panel = this.el.panel;
    if (event.matches) {
      gsap.killTweensOf(panel);
      panel.style.opacity = '';
      panel.style.transform = '';
      panel.inert = this.loaderVisible || !this.panelVisible;
      this.setSheetState(this.panelVisible ? 'peek' : 'hidden', { animate: false });
      this.syncBackbarAria();
      return;
    }
    if (this.sheetInstantTimer) {
      window.clearTimeout(this.sheetInstantTimer);
      this.sheetInstantTimer = null;
    }
    panel.classList.remove('is-instant');
    panel.dataset.sheet = 'peek';
    panel.dataset.search = 'closed';
    panel.inert = this.loaderVisible || !this.panelVisible;
    this.el.panelPeek.setAttribute('aria-expanded', 'false');
    this.syncBackbarAria();
    gsap.killTweensOf(panel);
    gsap.set(panel, { opacity: this.panelVisible ? 1 : 0, x: this.panelVisible ? 0 : -30 });
  }

  collapseOnGlobe() {
    if (!this.isMobileSheet() || !this.panelEnabled) return;
    if (this.sheetState !== 'half') return;
    this.setSheetState('peek');
  }

  handleEscape() {
    if (this.regionSwitcherOpen) {
      this.setRegionSwitcherOpen(false, { focus: true });
      return true;
    }
    if (!this.isMobileSheet()) return false;
    if (document.activeElement === this.el.searchInput) {
      if (this.query) this.clearSearch(true);
      else this.el.searchInput.blur();
      return true;
    }
    if (this.sheetState === 'full') {
      this.setSheetState('half', { focus: true });
      return true;
    }
    if (this.sheetState === 'half') {
      this.setSheetState('peek', { focus: true });
      return true;
    }
    return false;
  }

  bindViewport() {
    const vv = window.visualViewport;
    const update = () => {
      const height = vv ? vv.height : window.innerHeight;
      const offset = vv ? vv.offsetTop : 0;
      const lift = Math.max(0, Math.round(window.innerHeight - (height + offset)));
      document.documentElement.style.setProperty('--vvh', `${Math.round(height)}px`);
      document.documentElement.style.setProperty('--kb-lift', `${lift}px`);
      document.body.classList.toggle('keyboard-open', lift > 80);
    };
    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
    }
    window.addEventListener('resize', update);
    update();
  }

  setPanelEnabled(enabled) {
    this.panelEnabled = enabled;
    this.el.panelPeek.disabled = !enabled;
    this.el.searchInput.disabled = !enabled;
    this.el.searchClear.disabled = !enabled;
    this.el.yearInput.disabled = !enabled;
    this.el.play1985.disabled = !enabled;
    this.el.play2025.disabled = !enabled;
    this.el.compareBtn.disabled = !enabled;
    this.el.comparePairSelect.disabled = !enabled;
    this.el.placeList.querySelectorAll('.region-row, .group-head, .empty-clear').forEach((element) => {
      element.disabled = !enabled;
    });
    this.signalRows.forEach((row) => {
      const unavailable = this.activeRegion && !this.isSignalAvailable(row.dataset.key);
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
    this.showPanel(0.9, { state: 'half' });
    this.setPanelEnabled(true);
    this.setAudioState(this.audioState);
    this.syncBackbarAria();
    gsap.to(this.el.backbar, { opacity: 1, duration: 0.9, delay: 0.5, ease: 'power2.out' });
    gsap.set(this.el.backbar, { pointerEvents: 'auto' });
  }

  hideDestination(duration = 0.9) {
    this.stopCompare();
    document.body.classList.remove('destination-open');
    this.setAudioState(this.audioState);
    this.showPlaces();
    this.syncBackbarAria();
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
