// Web Audio engine for the Earth Information Jukebox sonification lab.
//
// The mapping is deliberately split in two, because the two sources carry
// different information:
//
//   the frame decides character   cloud -> noise density, luminance -> filter
//                                 openness, greenness -> chord colour,
//                                 edge energy -> rhythmic density
//   the series decides tuning     POWER temperature -> root, rain -> patter,
//                                 solar -> shimmer, wind -> noise colour
//                                 GISTEMP anomaly -> slow detune of the drone
//
// No library, no build step: oscillators, one noise buffer, biquads and gain
// envelopes. Everything is scheduled against AudioContext.currentTime, which is
// also the master clock for the filmstrip.

const TONIC_HZ = 110; // A2
const MINOR_PENTATONIC = [0, 3, 5, 7, 10];

// GISTEMP v4 global monthly means, anomalies in degC vs 1951-1980.
// Jan 2000 .. Dec 2010, the exact span of the filmstrip.
const GISTEMP_MONTHLY = [
  0.25, 0.56, 0.55, 0.56, 0.35, 0.40, 0.39, 0.42, 0.39, 0.27, 0.30, 0.28,
  0.45, 0.44, 0.56, 0.50, 0.57, 0.52, 0.59, 0.47, 0.52, 0.50, 0.72, 0.56,
  0.77, 0.79, 0.88, 0.58, 0.64, 0.53, 0.61, 0.53, 0.64, 0.54, 0.59, 0.44,
  0.75, 0.58, 0.60, 0.55, 0.60, 0.48, 0.58, 0.63, 0.62, 0.72, 0.53, 0.75,
  0.58, 0.73, 0.63, 0.61, 0.37, 0.44, 0.26, 0.44, 0.50, 0.61, 0.73, 0.51,
  0.75, 0.60, 0.74, 0.67, 0.63, 0.65, 0.61, 0.59, 0.72, 0.76, 0.74, 0.68,
  0.56, 0.74, 0.63, 0.47, 0.48, 0.67, 0.54, 0.72, 0.66, 0.71, 0.74, 0.79,
  1.01, 0.70, 0.72, 0.77, 0.69, 0.61, 0.60, 0.60, 0.60, 0.59, 0.59, 0.50,
  0.30, 0.38, 0.75, 0.54, 0.50, 0.50, 0.60, 0.44, 0.60, 0.67, 0.69, 0.54,
  0.65, 0.53, 0.54, 0.61, 0.65, 0.64, 0.74, 0.68, 0.72, 0.65, 0.80, 0.67,
  0.75, 0.84, 0.92, 0.85, 0.75, 0.67, 0.63, 0.66, 0.63, 0.71, 0.81, 0.45
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function anomalyFor(monthIndex) {
  const i = Math.max(0, Math.min(GISTEMP_MONTHLY.length - 1, monthIndex));
  // Trailing 12-month mean: keeps the seasonal wobble but lets the decade rise,
  // which is what the drone is meant to say.
  const start = Math.max(0, i - 11);
  let sum = 0;
  for (let j = start; j <= i; j += 1) sum += GISTEMP_MONTHLY[j];
  return sum / (i - start + 1);
}

// `features` comes from filmstrip.js, already normalised to 0..1.
// `climate` is optional: { tempC, rainMm, humidity, windMs, solar }.
export function soundForFrame(features, climate, monthIndex) {
  const { lum, green, edge, water } = features;
  const cloud = features.blank ? 0 : features.cloud;

  const tempC = climate && climate.tempC != null ? climate.tempC : 26;
  const rainMm = climate && climate.rainMm != null ? climate.rainMm : 4;
  const windMs = climate && climate.windMs != null ? climate.windMs : 3.2;
  const solar = climate && climate.solar != null ? climate.solar : 17;

  const tempNorm = clamp01((tempC - 19) / 11);
  const rainNorm = clamp01(Math.sqrt(rainMm / 55));
  const windNorm = clamp01((windMs - 2) / 3);
  const solarNorm = clamp01((solar - 12) / 11);

  // Root walks up the minor pentatonic as the month warms.
  const degree = MINOR_PENTATONIC[Math.round(tempNorm * 4)];
  const root = TONIC_HZ * Math.pow(2, degree / 12);

  // Vegetation opens the third, bare sediment closes it to a minor third.
  const thirdSemis = green < 0.33 ? 3 : green < 0.66 ? 4 : 5;

  const anomaly = anomalyFor(monthIndex);
  const driftCents = (anomaly - 0.42) * 55;

  const pulseRate = 0.55 + edge * 3.4 + rainNorm * 0.5;

  return {
    root,
    fifth: root * Math.pow(2, 7 / 12),
    third: root * Math.pow(2, thirdSemis / 12),
    sub: root / 2,
    drift: root * Math.pow(2, driftCents / 1200),

    cutoff: 320 + Math.pow(lum, 1.35) * 2500,
    padGain: 0.55 + green * 0.35,

    noiseGain: 0.015 + Math.pow(cloud, 1.4) * 0.26,
    noiseHz: 420 + windNorm * 950 + cloud * 900,

    rainGain: Math.pow(rainNorm, 1.5) * 0.085,
    rainHz: 2200 + rainNorm * 1800,
    rainRate: 1.2 + rainNorm * 5.5,

    pulseRate,
    pulseGain: 0.02 + edge * 0.11,
    pulseHz: root * 2,

    subGain: 0.035 + water * 0.11,
    shimmerGain: 0.003 + solarNorm * 0.016,
    shimmerHz: root * 4,

    driftCents
  };
}

export class Sonifier {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.nextPulse = 0;
    this.master = null;
  }

  async init(existing = null) {
    if (this.ready) return this.ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    const ctx = existing || new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.28;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    this.master = master;

    // Pad: three voices through one lowpass, so brightness reads as one gesture.
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 900;
    padFilter.Q.value = 0.7;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.7;
    padFilter.connect(padGain);
    padGain.connect(master);

    const voice = (type, gainValue) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      gain.gain.value = gainValue;
      osc.connect(gain);
      gain.connect(padFilter);
      osc.start();
      return { osc, gain };
    };

    this.padFilter = padFilter;
    this.padGain = padGain;
    this.voiceRoot = voice('sawtooth', 0.05);
    this.voiceFifth = voice('triangle', 0.045);
    this.voiceThird = voice('sine', 0.05);

    // Sub: the sea and the sediment, one octave under the root.
    this.sub = ctx.createOscillator();
    this.sub.type = 'sine';
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0;
    this.sub.connect(this.subGain);
    this.subGain.connect(master);
    this.sub.start();

    // Drift: a second copy of the root, tuned by the global anomaly. It beats
    // against the pad slowly, so the decade itself is audible as tension.
    this.drift = ctx.createOscillator();
    this.drift.type = 'sine';
    this.driftGain = ctx.createGain();
    this.driftGain.gain.value = 0.03;
    this.drift.connect(this.driftGain);
    this.driftGain.connect(master);
    this.drift.start();

    // Noise: one buffer, two bands. Clouds set the level, wind sets the colour.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const noise = buffer.getChannelData(0);
    for (let i = 0; i < noise.length; i += 1) noise[i] = Math.random() * 2 - 1;

    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.value = 900;
    this.noiseFilter.Q.value = 0.6;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(master);

    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'bandpass';
    this.rainFilter.frequency.value = 2600;
    this.rainFilter.Q.value = 0.9;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainFilter.connect(this.rainGain);
    this.rainGain.connect(master);

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;
    noiseSource.connect(this.noiseFilter);
    noiseSource.connect(this.rainFilter);
    noiseSource.start();
    this.noiseSource = noiseSource;

    // Slow amplitude modulation on the rain band: patter, not a static hiss.
    this.rainLfo = ctx.createOscillator();
    this.rainLfo.type = 'sine';
    this.rainLfo.frequency.value = 2;
    this.rainLfoGain = ctx.createGain();
    this.rainLfoGain.gain.value = 0;
    this.rainLfo.connect(this.rainLfoGain);
    this.rainLfoGain.connect(this.rainGain.gain);
    this.rainLfo.start();

    // Shimmer: sunlight as a quiet high sine, intentionally the smallest voice.
    this.shimmer = ctx.createOscillator();
    this.shimmer.type = 'sine';
    this.shimmerGain = ctx.createGain();
    this.shimmerGain.gain.value = 0;
    this.shimmer.connect(this.shimmerGain);
    this.shimmerGain.connect(master);
    this.shimmer.start();

    this.ready = true;
    this.nextPulse = ctx.currentTime + 0.15;
    return ctx;
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  fadeIn(seconds = 1.4) {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(0.85, now + seconds);
  }

  fadeOut(seconds = 0.5) {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  }

  apply(sound, now = this.ctx.currentTime) {
    if (!this.ready) return;
    const glide = 0.22;

    this.voiceRoot.osc.frequency.setTargetAtTime(sound.root, now, glide);
    this.voiceFifth.osc.frequency.setTargetAtTime(sound.fifth, now, glide);
    this.voiceThird.osc.frequency.setTargetAtTime(sound.third, now, glide);
    this.sub.frequency.setTargetAtTime(sound.sub, now, glide);
    this.drift.frequency.setTargetAtTime(sound.drift, now, glide);
    this.shimmer.frequency.setTargetAtTime(sound.shimmerHz, now, glide);

    this.padFilter.frequency.setTargetAtTime(sound.cutoff, now, 0.3);
    this.padGain.gain.setTargetAtTime(sound.padGain, now, 0.4);

    this.noiseGain.gain.setTargetAtTime(sound.noiseGain, now, 0.35);
    this.noiseFilter.frequency.setTargetAtTime(sound.noiseHz, now, 0.4);

    this.rainGain.gain.setTargetAtTime(sound.rainGain, now, 0.4);
    this.rainFilter.frequency.setTargetAtTime(sound.rainHz, now, 0.4);
    this.rainLfo.frequency.setTargetAtTime(sound.rainRate, now, 0.5);
    this.rainLfoGain.gain.setTargetAtTime(sound.rainGain * 0.7, now, 0.5);

    this.subGain.gain.setTargetAtTime(sound.subGain, now, 0.4);
    this.shimmerGain.gain.setTargetAtTime(sound.shimmerGain, now, 0.5);
    this.driftGain.gain.setTargetAtTime(0.028, now, 0.5);
  }

  // Call once per animation frame. Schedules at most one pulse ahead of the
  // audio clock, so playback survives a stalled or throttled frame loop.
  tick(sound, now = this.ctx.currentTime) {
    if (!this.ready) return;
    const interval = 1 / Math.max(0.2, sound.pulseRate);

    if (this.nextPulse < now - 0.4) this.nextPulse = now + 0.05;

    let guard = 0;
    while (this.nextPulse < now + 0.12 && guard < 6) {
      this.spawnPulse(sound, this.nextPulse);
      this.nextPulse += interval;
      guard += 1;
    }
  }

  spawnPulse(sound, time) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(sound.pulseHz, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(sound.pulseGain, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  async suspend() {
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
  }

  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
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
  }
}
