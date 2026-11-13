// Web Audio engine for the six-region Champion dataset.
//
// Ten signals, ten layers, one destination at a time. Each layer is a small
// synth voice; continuous layers glide to their targets when the year changes,
// rhythmic layers schedule themselves from `update()` against the audio clock.
// Mapping ranges and formulas come from `sonification_mapping_rules` in
// assets/data/bd_6_regions_1985_2026_champion_jukebox.json.

import { SIGNALS } from './regions.js';

const PENTATONIC = [0, 3, 5, 7, 10, 12];
const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

// The dataset's [0, 900] rain range describes a monthly record. The panel reads
// annual totals (2,000-5,300 mm across the six regions), so the audio layer uses
// an annual range instead of pinning every year to maximum density.
const AUDIO_RANGES = {
  rain: [0, 6000]
};

function normalise(value, range) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const min = range[0];
  const max = range[1];
  return clamp01((Number(value) - min) / (max - min));
}

function makeNoiseBuffer(ctx, seconds = 2) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function makeImpulse(ctx, seconds = 2.8, decay = 2.6) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function makeDistortionCurve(amount) {
  const size = 1024;
  const curve = new Float32Array(size);
  const k = amount * 70;
  const deg = (Math.PI * 20) / 180;
  for (let i = 0; i < size; i += 1) {
    const x = (i * 2) / (size - 1) - 1;
    curve[i] = ((3 + k) * x * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

export class SignalAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.initPromise = null;
    this.region = null;
    this.year = null;
    this.enabled = new Set(SIGNALS.map((signal) => signal.key));
    this.norms = {};
    this.rates = { rain: 0.4, lights: 2, disasters: 0.1 };
    this.airAmount = -1;
    this.nextRain = 0;
    this.nextLights = 0;
    this.nextHit = 0;
    this.lightsStep = 0;
    this.userGain = null;
    this.muted = false;
    this.volume = 1;
    this.onStateChange = null;
    this.failureStatus = null;
    this.playRequested = false;
    this.hasPlayed = false;
    this.hasRun = false;
  }

  get state() {
    let status;
    if (this.failureStatus) status = this.failureStatus;
    else if (!(window.AudioContext || window.webkitAudioContext) || this.ctx?.state === 'closed') status = 'unavailable';
    else if (!this.ready) status = 'idle';
    else if (this.ctx.state !== 'running') status = this.hasRun ? 'paused' : 'blocked';
    else if (this.playRequested && this.region) status = 'playing';
    else status = this.hasPlayed && this.region ? 'paused' : 'ready';
    return { status, muted: this.muted, volume: this.volume };
  }

  emitState() {
    this.onStateChange?.(this.state);
  }

  applyUserGain() {
    if (!this.userGain || this.ctx?.state === 'closed') return;
    const gain = this.userGain.gain;
    gain.cancelScheduledValues(this.now);
    gain.setValueAtTime(this.muted ? 0 : this.volume, this.now);
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.applyUserGain();
    this.emitState();
  }

  setVolume(volume) {
    if (!Number.isFinite(Number(volume))) return;
    this.volume = clamp01(Number(volume));
    this.applyUserGain();
    this.emitState();
  }

  async init() {
    if (this.ready) return this.ctx;
    try {
      this.failureStatus = null;
      const ctx = this.buildGraph();
      this.emitState();
      return ctx;
    } catch (error) {
      const ctx = this.ctx;
      this.ctx = null;
      this.ready = false;
      this.userGain = null;
      this.hasRun = false;
      if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
      this.failureStatus = error.name === 'NotAllowedError' ? 'blocked' : 'unavailable';
      this.emitState();
      throw error;
    }
  }

  buildGraph() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio is not available');
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.hasRun = ctx.state === 'running';
    ctx.addEventListener('statechange', () => {
      if (this.ctx !== ctx) return;
      if (ctx.state === 'running') {
        this.hasRun = true;
        this.failureStatus = null;
      }
      this.emitState();
    });

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.3;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(compressor);
    // Flight fades affect master only; user mute/volume is the final output gate.
    const userGain = ctx.createGain();
    userGain.gain.value = this.muted ? 0 : this.volume;
    compressor.connect(userGain);
    userGain.connect(ctx.destination);
    this.userGain = userGain;
    this.master = master;

    // Shared reverb: canopy sets the wet mix. The impulse itself is fixed so
    // moving the year never rebuilds a multi-second buffer on the main thread.
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx);
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0.02;
    convolver.connect(reverbWet);
    reverbWet.connect(master);
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 1;
    reverbSend.connect(convolver);
    this.reverb = convolver;
    this.reverbWet = reverbWet;
    this.reverbSend = reverbSend;

    this.noiseBuffer = makeNoiseBuffer(ctx);

    // Vegetation: a warm pad through a low-pass. NDVI opens the filter.
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 800;
    padFilter.Q.value = 0.6;
    const padGain = ctx.createGain();
    padGain.gain.value = 0;
    padFilter.connect(padGain);
    padGain.connect(master);
    padGain.connect(reverbSend);
    this.padFilter = padFilter;
    this.padGain = padGain;

    const padVoice = (type, freq, gainValue) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = gainValue;
      osc.connect(gain);
      gain.connect(padFilter);
      osc.start();
      return osc;
    };
    this.padVoices = [
      padVoice('sawtooth', 110, 0.03),
      padVoice('triangle', 164.81, 0.025),
      padVoice('sine', 220, 0.03)
    ];

    // Temperature: a single lead line. Pitch is 220 * 4^((T - 10) / 30).
    const lead = ctx.createOscillator();
    lead.type = 'triangle';
    lead.frequency.value = 220;
    const leadFilter = ctx.createBiquadFilter();
    leadFilter.type = 'lowpass';
    leadFilter.frequency.value = 2400;
    leadFilter.Q.value = 0.4;
    const leadGain = ctx.createGain();
    leadGain.gain.value = 0;
    lead.connect(leadFilter);
    leadFilter.connect(leadGain);
    leadGain.connect(master);
    leadGain.connect(reverbSend);
    lead.start();
    this.lead = lead;
    this.leadGain = leadGain;

    const vibrato = ctx.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.value = 4.6;
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.value = 4;
    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(lead.detune);
    vibrato.start();
    this.vibrato = vibrato;

    // Groundwater: sub-bass drone, 55-110 Hz, gain follows the anomaly.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 72;
    const subGain = ctx.createGain();
    subGain.gain.value = 0;
    sub.connect(subGain);
    subGain.connect(master);
    sub.start();
    this.sub = sub;
    this.subGain = subGain;

    // Sea level: filtered noise with a slow wave-wash sweep.
    const sea = ctx.createBufferSource();
    sea.buffer = this.noiseBuffer;
    sea.loop = true;
    const seaFilter = ctx.createBiquadFilter();
    seaFilter.type = 'highpass';
    seaFilter.frequency.value = 400;
    seaFilter.Q.value = 0.5;
    const seaGain = ctx.createGain();
    seaGain.gain.value = 0;
    sea.connect(seaFilter);
    seaFilter.connect(seaGain);
    seaGain.connect(master);
    seaGain.connect(reverbSend);
    sea.start();
    this.seaFilter = seaFilter;
    this.seaGain = seaGain;

    const seaLfo = ctx.createOscillator();
    seaLfo.type = 'sine';
    seaLfo.frequency.value = 0.13;
    const seaLfoDepth = ctx.createGain();
    seaLfoDepth.gain.value = 160;
    seaLfo.connect(seaLfoDepth);
    seaLfoDepth.connect(seaFilter.frequency);
    seaLfo.start();
    this.seaLfo = seaLfo;

    // Air quality: band-limited noise through a waveshaper. Clean to gritty.
    const air = ctx.createBufferSource();
    air.buffer = this.noiseBuffer;
    air.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 1700;
    airFilter.Q.value = 0.8;
    const airShaper = ctx.createWaveShaper();
    airShaper.curve = makeDistortionCurve(0);
    airShaper.oversample = '2x';
    const airGain = ctx.createGain();
    airGain.gain.value = 0;
    air.connect(airFilter);
    airFilter.connect(airShaper);
    airShaper.connect(airGain);
    airGain.connect(master);
    airGain.connect(reverbSend);
    air.start();
    this.airFilter = airFilter;
    this.airShaper = airShaper;
    this.airGain = airGain;

    // Rhythmic layers use their own bus so a toggle can silence them cleanly
    // while already-scheduled notes finish their envelopes.
    this.rainBus = ctx.createGain();
    this.rainBus.gain.value = 0;
    this.rainBus.connect(master);
    this.rainBus.connect(reverbSend);

    this.lightsBus = ctx.createGain();
    this.lightsBus.gain.value = 0;
    this.lightsBus.connect(master);
    this.lightsBus.connect(reverbSend);

    this.hitBus = ctx.createGain();
    this.hitBus.gain.value = 0;
    this.hitBus.connect(master);
    this.hitBus.connect(reverbSend);

    this.ready = true;
    const now = ctx.currentTime;
    this.nextRain = now + 0.1;
    this.nextLights = now + 0.2;
    this.nextHit = now + 0.4;
    this.apply(now);
    return ctx;
  }

  async start() {
    if (!this.initPromise) {
      this.initPromise = this.init().catch((error) => {
        this.initPromise = null;
        throw error;
      });
    }
    await this.initPromise;
    await this.resume();
    return this.ctx;
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setDestination(region) {
    this.region = region || null;
    if (!region) this.playRequested = false;
    this.setYear(this.year);
    this.emitState();
  }

  setYear(year) {
    this.year = Number(year);
    this.readValues();
    if (this.ready) this.apply(this.now);
  }

  setEnabled(key, on) {
    if (on) this.enabled.add(key);
    else this.enabled.delete(key);
    if (this.ready) this.apply(this.now);
  }

  setEnabledSet(keys) {
    this.enabled = new Set(keys);
    if (this.ready) this.apply(this.now);
  }

  isAvailable(key) {
    if (!this.region) return false;
    if (Array.isArray(this.region.unavailable) && this.region.unavailable.includes(key)) return false;
    return true;
  }

  readValues() {
    const norms = {};
    for (const signal of SIGNALS) {
      if (!this.region || !this.isAvailable(signal.key)) {
        norms[signal.key] = null;
        continue;
      }
      const row = this.region.years[this.year];
      const value = row ? row[signal.key] : null;
      norms[signal.key] = normalise(value, AUDIO_RANGES[signal.key] || signal.range);
    }
    this.norms = norms;
  }

  apply(now = this.now) {
    if (!this.ready) return;
    const n = this.norms;
    const on = (key) => this.enabled.has(key) && n[key] !== null && n[key] !== undefined;
    const glide = 0.35;

    const temp = on('temperature') ? n.temperature : null;
    this.lead.frequency.setTargetAtTime(220 * Math.pow(4, temp === null ? 0 : temp), now, glide);
    this.leadGain.gain.setTargetAtTime(temp === null ? 0 : 0.035, now, glide);

    const veg = on('vegetation') ? n.vegetation : null;
    this.padFilter.frequency.setTargetAtTime(300 + (veg === null ? 0 : veg) * 2500, now, glide);
    this.padGain.gain.setTargetAtTime(veg === null ? 0 : 0.035 + veg * 0.05, now, glide);

    const ground = on('groundwater') ? n.groundwater : null;
    this.sub.frequency.setTargetAtTime(55 + (ground === null ? 0 : ground) * 55, now, glide);
    this.subGain.gain.setTargetAtTime(ground === null ? 0 : 0.02 + ground * 0.055, now, glide);

    const sea = on('seaLevel') ? n.seaLevel : null;
    this.seaFilter.frequency.setTargetAtTime(260 + (sea === null ? 0 : sea) * 1450, now, glide);
    this.seaGain.gain.setTargetAtTime(sea === null ? 0 : 0.008 + sea * 0.045, now, glide);

    const air = on('air') ? n.air : null;
    this.airFilter.frequency.setTargetAtTime(1300 + (air === null ? 0 : air) * 1500, now, glide);
    this.airGain.gain.setTargetAtTime(air === null ? 0 : 0.004 + air * 0.03, now, glide);
    if (air !== null && Math.abs(air - this.airAmount) > 0.01) {
      this.airAmount = air;
      this.airShaper.curve = makeDistortionCurve(air);
    }

    const canopy = on('canopy') ? n.canopy : null;
    this.reverbWet.gain.setTargetAtTime(canopy === null ? 0.02 : 0.1 + canopy * 0.75, now, 0.5);

    const carbon = on('carbon') ? n.carbon : null;
    const cents = carbon === null ? 0 : carbon * 35;
    for (const voice of this.padVoices) voice.detune.setTargetAtTime(cents, now, 0.5);
    this.lead.detune.setTargetAtTime(cents, now, 0.5);

    this.rates.rain = on('rain') ? 0.3 + n.rain * 5.5 : 0;
    this.rates.lights = on('lights') ? 1.5 + n.lights * 7 : 0;
    this.rates.disasters = on('disasters') ? 0.06 + n.disasters * 1.15 : 0;

    this.rainBus.gain.setTargetAtTime(on('rain') ? 0.7 : 0, now, 0.2);
    this.lightsBus.gain.setTargetAtTime(on('lights') ? 0.5 : 0, now, 0.2);
    this.hitBus.gain.setTargetAtTime(on('disasters') ? 0.6 : 0, now, 0.2);
  }

  // Explicit Play/Pause for the toolbar. Pausing suspends the context so the
  // status becomes "Audio paused"; Play resumes it and fades the mix back in.
  async togglePlay() {
    const { status } = this.state;
    if (status === 'unavailable') return;
    if (status === 'playing') {
      this.playRequested = false;
      await this.suspend();
      return;
    }
    if (!this.region) return;
    try {
      await this.start();
      if (!this.region || this.state.status === 'unavailable') return;
      this.fadeIn(0.6);
    } catch (error) {
      console.warn('Audio unavailable', error);
      this.emitState();
    }
  }

  fadeIn(seconds = 1.6) {
    if (this.ready && this.ctx.state !== 'closed' && this.region) {
      const now = this.now;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.8, now + seconds);
      this.playRequested = true;
      this.hasPlayed = true;
    }
    this.emitState();
  }

  fadeOut(seconds = 0.8) {
    this.playRequested = false;
    if (this.ready && this.ctx.state !== 'closed') {
      const now = this.now;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    }
    this.emitState();
  }

  async suspend() {
    try {
      if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
    } finally {
      this.emitState();
    }
  }

  async resume() {
    if (!this.ready) return this.start();
    const ctx = this.ctx;
    try {
      if (!ctx || ctx.state === 'closed') throw new Error('Audio context is closed');
      if (ctx.state !== 'running') await ctx.resume();
      if (this.ctx !== ctx) return;
      if (ctx.state !== 'running') throw new Error('Audio is blocked; try again from a user gesture');
      this.hasRun = true;
      this.failureStatus = null;
      this.emitState();
      return ctx;
    } catch (error) {
      if (this.ctx === ctx) {
        this.failureStatus = ctx && ctx.state !== 'closed' ? 'blocked' : 'unavailable';
        this.emitState();
      }
      throw error;
    }
  }

  update() {
    if (!this.ready) return;
    const now = this.now;

    // Rain: plucked notes. Density is the normalised annual rainfall.
    if (this.rates.rain > 0) {
      if (this.nextRain < now - 0.4) this.nextRain = now + 0.02;
      let guard = 0;
      while (this.nextRain < now + 0.12 && guard < 8) {
        this.spawnPluck(this.nextRain);
        this.nextRain += (0.75 + Math.random() * 0.5) / this.rates.rain;
        guard += 1;
      }
    } else {
      this.nextRain = now + 0.25;
    }

    // Night lights: a pentatonic arpeggiator. Gain and rate follow radiance.
    if (this.rates.lights > 0) {
      if (this.nextLights < now - 0.4) this.nextLights = now + 0.02;
      let guard = 0;
      while (this.nextLights < now + 0.12 && guard < 10) {
        this.spawnArp(this.nextLights);
        this.nextLights += 1 / this.rates.lights;
        guard += 1;
      }
    } else {
      this.nextLights = now + 0.25;
    }

    // Disasters: sparse thunder and tabla-like hits.
    if (this.rates.disasters > 0) {
      if (this.nextHit < now - 0.4) this.nextHit = now + 0.05;
      let guard = 0;
      while (this.nextHit < now + 0.12 && guard < 3) {
        this.spawnHit(this.nextHit);
        this.nextHit += (0.6 + Math.random() * 0.8) / this.rates.disasters;
        guard += 1;
      }
    } else {
      this.nextHit = now + 0.35;
    }
  }

  spawnPluck(time) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const degree = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
    const octave = Math.random() < 0.35 ? 2 : 1;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220 * octave * Math.pow(2, degree / 12), time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.05, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    osc.connect(gain);
    gain.connect(this.rainBus);
    osc.start(time);
    osc.stop(time + 0.34);
  }

  spawnArp(time) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const degree = PENTATONIC[this.lightsStep % PENTATONIC.length];
    this.lightsStep += 1;
    osc.type = 'square';
    osc.frequency.setValueAtTime(440 * Math.pow(2, degree / 12), time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.026, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
    osc.connect(gain);
    gain.connect(this.lightsBus);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  spawnHit(time) {
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900 + Math.random() * 900, time);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.06, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.38);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.hitBus);
    noise.start(time);
    noise.stop(time + 0.42);

    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(72, time);
    thump.frequency.exponentialRampToValueAtTime(42, time + 0.28);
    thumpGain.gain.setValueAtTime(0.0001, time);
    thumpGain.gain.linearRampToValueAtTime(0.05, time + 0.01);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
    thump.connect(thumpGain);
    thumpGain.connect(this.hitBus);
    thump.start(time);
    thump.stop(time + 0.36);
  }

  async close() {
    if (!this.ctx) return;
    this.fadeOut(0.2);
    const ctx = this.ctx;
    if (typeof ctx.close === 'function') {
      setTimeout(() => ctx.close().catch(() => {}), 260);
    }
    this.ctx = null;
    this.ready = false;
    this.initPromise = null;
    this.userGain = null;
    this.playRequested = false;
    this.hasPlayed = false;
    this.hasRun = false;
    this.failureStatus = null;
    this.emitState();
  }
}
