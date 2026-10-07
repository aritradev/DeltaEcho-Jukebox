import { gsap } from '../vendor/gsap/index.js';
import { CATEGORIES } from './config.js';

export class UI {
  constructor(handlers) {
    this.handlers = handlers;
    this.el = {
      loader: document.getElementById('loader'),
      loaderSub: document.getElementById('loader-sub'),
      loaderFill: document.getElementById('loader-fill'),
      enterBtn: document.getElementById('enter-btn'),
      masthead: document.getElementById('masthead'),
      readout: document.getElementById('readout'),
      roState: document.getElementById('ro-state'),
      panel: document.getElementById('panel'),
      choices: document.getElementById('choices'),
      placeBtn: document.getElementById('place-btn'),
      note: document.getElementById('selection-note'),
      noteEyebrow: document.getElementById('sn-eyebrow'),
      noteLine: document.querySelector('.sn-line'),
      noteDest: document.getElementById('sn-dest'),
      anchor: document.getElementById('anchor'),
      destination: document.getElementById('destination'),
      backbar: document.getElementById('backbar'),
      backBtn: document.getElementById('back-btn'),
      hint: document.getElementById('hint'),
      veil: document.getElementById('veil'),
      veilNoise: document.getElementById('veil-noise')
    };

    this.anchorVisible = false;
    this.hintTimer = null;
    this.buildChoices();
    this.bind();
    this.makeVeilNoise();
  }

  buildChoices() {
    this.choiceButtons = [...this.el.choices.querySelectorAll('.choice')].map((button) => {
      const category = CATEGORIES.find((c) => c.key === button.dataset.key);
      button.querySelector('.glyph').textContent = category.glyph;
      button.addEventListener('click', () => {
        if (button.classList.contains('active')) return;
        this.handlers.onSelect(category);
      });
      return button;
    });
  }

  bind() {
    this.el.placeBtn.addEventListener('click', () => this.handlers.onSelect(null));
    this.el.backBtn.addEventListener('click', () => this.handlers.onBack());
    this.el.enterBtn.addEventListener('click', () => this.handlers.onEnter());
  }

  makeVeilNoise() {
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
    this.el.veilNoise.style.backgroundSize = `${size}px ${size}px}`;
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

  showEnter() {
    this.el.loaderSub.textContent = 'Observatory ready';
    this.el.loaderFill.style.width = '100%';
    this.el.enterBtn.disabled = false;
    gsap.fromTo(this.el.enterBtn, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' });
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

  setActiveCategory(key) {
    for (const button of this.choiceButtons) {
      const active = button.dataset.key === key;
      button.classList.toggle('active', active);
      button.classList.toggle('dimmed', Boolean(key) && !active);
    }
  }

  showSelectionNote(category) {
    this.el.noteEyebrow.textContent = category ? category.label : 'Explore a place';
    this.el.noteLine.textContent = category
      ? 'Let\u2019s find somewhere to listen.'
      : 'One region is available in this build.';
    this.el.noteDest.textContent = 'Destination available \u00b7 Bay of Bengal';
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
    for (const button of this.choiceButtons) button.disabled = !enabled;
    this.el.placeBtn.disabled = !enabled;
  }

  showDestination() {
    gsap.killTweensOf(this.el.destination);
    gsap.fromTo(
      this.el.destination,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 1.2, ease: 'power2.out' }
    );
    gsap.to(this.el.backbar, { opacity: 1, duration: 0.9, delay: 0.5, ease: 'power2.out' });
    gsap.set(this.el.backbar, { pointerEvents: 'auto' });
  }

  hideDestination(duration = 0.9) {
    gsap.killTweensOf(this.el.destination);
    gsap.to(this.el.destination, { opacity: 0, y: 18, duration, ease: 'power2.in' });
    gsap.to(this.el.backbar, { opacity: 0, duration: 0.6, ease: 'power2.in' });
    gsap.set(this.el.backbar, { pointerEvents: 'none' });
  }

  setReadoutState(name) {
    this.el.roState.textContent = name;
  }

  setVeil(value) {
    this.el.veil.style.opacity = String(value);
    this.el.veilNoise.style.opacity = String(value * 0.16);
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
