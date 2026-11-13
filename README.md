# Echoes of Earth — The Earth Information Jukebox

**Translating 42 Years (1985–2026) of NASA Earth Information Center (EIC) Visual Frames & Multi-Sensor Satellite Telemetry into Real-Time Interactive Soundscapes**

[![NASA Space Apps 2026](https://img.shields.io/badge/NASA_Space_Apps_2026-The_Earth_Information_Jukebox-0B3D91?style=for-the-badge&logo=nasa&logoColor=white)](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/)
[![Live Observatory](https://img.shields.io/badge/Live_Observatory-Launch_3D_Jukebox-00C853?style=for-the-badge&logo=googlechrome&logoColor=white)](https://aritradev.github.io/DeltaEcho-Jukebox/)
[![Sonification Lab](https://img.shields.io/badge/EIC_Sonification_Lab-Launch_Studio-FF6D00?style=for-the-badge&logo=waveform&logoColor=white)](https://aritradev.github.io/DeltaEcho-Jukebox/studio.html)
[![Zero Dependencies](https://img.shields.io/badge/Runtime-Zero_Dependencies_Vanilla_ESM_WebGL2-1E293B?style=for-the-badge)](https://github.com/aritradev/DeltaEcho-Jukebox)
[![Accessibility](https://img.shields.io/badge/Accessibility-WCAG_2.1_Screen_Reader_and_Voice_Guide-7C3AED?style=for-the-badge)](https://aritradev.github.io/DeltaEcho-Jukebox/)

* **Live 3D Observatory & 10-Layer Signal Jukebox:** [https://aritradev.github.io/DeltaEcho-Jukebox/](https://aritradev.github.io/DeltaEcho-Jukebox/)
* **Live EIC Visual-Frame Sonification Lab:** [https://aritradev.github.io/DeltaEcho-Jukebox/studio.html](https://aritradev.github.io/DeltaEcho-Jukebox/studio.html)
* **Official Challenge Page:** [2026 NASA Space Apps Challenge — The Earth Information Jukebox](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/)

---

## Overview & Challenge Alignment

For over four decades, NASA's Earth-observing fleet and the **[NASA Earth Information Center (EIC)](https://earth.gov/)** have documented our changing planet in extraordinary visual detail. Yet relying exclusively on visual media creates a critical accessibility barrier for **blind and low-vision citizens** and limits how the general public experiences multidimensional climate shifts that the human ear can perceive effortlessly.

Built by **Team DeltaEcho** for the **[2026 NASA Space Apps Challenge — The Earth Information Jukebox](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/)**, **Echoes of Earth** is a zero-dependency, browser-native geospatial sonification platform that bridges sight and sound through two tightly integrated engines:

1. **The 3D Solar-to-Surface Observatory (`index.html`):** Guides users on an 8-stage cinematic flight from the Solar System through Earth's cloud deck onto high-resolution NASA HLS (`Landsat 8/9`) and GIBS satellite plates across **8 destinations**—six climate-vulnerable zones in **Bangladesh** (*Dhaka, Chattogram, Sylhet, Sundarbans, Cox's Bazar, and Kutubdia + Saint Martin's Offshore Islands*) and two global **NASA EIC Showcases** (*Mount Everest & Khumbu Glacier* and *Pacific NW Wildfires*). Each destination drives a **10-voice real-time Web Audio synthesizer** across **1985–2026** with instant **5-year and 10-year A/B comparison windows** (`1985 <-> 1995`, `1995 <-> 2005`, `2005 <-> 2015`, `2015 <-> 2025`, `1985 <-> 2026`).
2. **The EIC Pixel-to-Sound Sonification Lab (`studio.html`):** Directly fulfills the challenge's core visual-frame sonification objective. A live vertical scanline sweeps across chronological NASA satellite filmstrips (*Cox's Bazar MODIS 130-month series, Mount Everest Cryosphere 2000–2026, and Global VIIRS Wildfires 2000–2026*), extracting pixel luminance, cloud fraction, vegetation greenness, edge energy, and water coverage in real time to drive an A-minor pentatonic synthesis engine locked to `AudioContext.currentTime`.

---

## Interface & Visual Tour

| 1. 3D Solar System & Place Explorer | 2. Locality Plate & 10-Layer Signal Jukebox | 3. EIC Visual-Frame Sonification Lab |
| :--- | :--- | :--- |
| **[Open Live 3D Observatory](https://aritradev.github.io/DeltaEcho-Jukebox/)** | **[Explore 8 Regional & Global Plates](https://aritradev.github.io/DeltaEcho-Jukebox/)** | **[Open Studio Filmstrip Lab](https://aritradev.github.io/DeltaEcho-Jukebox/studio.html)** |
| Cinematic WebGL2 solar system with procedural sun corona, baked nebula sky (`smoke.png` worker pipeline), and hierarchical place search. | In-place region switcher (`Dhaka`, `Sylhet`, `Sundarbans`, `Cox's Bazar`, `Everest`, `Wildfires`), 10 toggleable sound layers, and `1985–2026` A/B delta (`Δ`) comparator. | Real-time computer vision (`measureCell`) scanning across MODIS, VIIRS, and Landsat EIC filmstrips with live vertical playhead and weather readout. |

---

## Scientific-to-Musical Mapping (Validity)

A sonification whose rules are hidden is merely a sound effect; **a sonification whose rules are visible on screen is rigorous science communication.** Every parameter in **Echoes of Earth** is mathematically mapped and displayed alongside its live physical reading.

### A. 10-Layer Environmental Signal Synthesizer (`src/signal-audio.js`)

| # | Environmental Signal | NASA Satellite / Model Source | Physical Range & Unit | Real-Time Web Audio Synthesis Mapping |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Surface Temperature** (`T2M_C`) | [NASA POWER](https://power.larc.nasa.gov/data-access-viewer/) (`MERRA-2`) | `10.0 – 40.0 °C` | **Lead Triangle Synth Pitch:** Exponential mapping `f = 220 * 4^((T - 10) / 30)` Hz (`220–880 Hz`) with `4.6 Hz` vibrato |
| **2** | **Precipitation** (`PRECTOTCORR_mm`) | [NASA POWER](https://power.larc.nasa.gov/data-access-viewer/) / `GPM IMERG` | `0 – 6,000 mm/yr` (`0–900 mm/mo`) | **Pentatonic Plucked Notes:** Controls note trigger density (`0.3 – 5.8 notes/s`) across an A-minor pentatonic register |
| **3** | **Vegetation Greenness** (`NDVI`) | [NASA MODIS / VIIRS NDVI](https://www.earthdata.nasa.gov/topics/land-surface/normalized-difference-vegetation-index-ndvi) | `0.10 – 0.90` index | **Harmonic Pad Brightness:** Opens a 3-voice (`sawtooth` + `triangle` + `sine`) low-pass filter cutoff (`300 – 2,800 Hz`) |
| **4** | **3D Forest Canopy** (`GEDI_canopy_m`) | [NASA ISS GEDI Lidar](https://svs.gsfc.nasa.gov/4950/) (`RH100`) | `2.0 – 20.0 m` | **Cathedral Reverb Wet Mix:** Controls convolution reverb send (`0.10 – 0.85`). Dense forests resonate deeply; deforestation dries the sound |
| **5** | **Groundwater & Ice Mass** (`GRACE_ewh_cm`) | [NASA GRACE / GRACE-FO](https://grace.jpl.nasa.gov/data/get-data/) | `-20.0 to +15.0 cm` EWH | **Sub-Bass Drone:** Drives sine sub-bass frequency (`55 – 110 Hz`) and gain |
| **6** | **Sea-Level Anomaly** (`SEA_LEVEL_mm`) | [NASA Sea Level Change Portal](https://sealevel.nasa.gov/) | `0.0 – 250.0 mm` | **Coastal Wave-Wash Sweep:** High-pass filtered noise (`260 – 1,710 Hz`) modulated by a `0.13 Hz` tidal LFO (`N/A` & silent for inland regions) |
| **7** | **Air Pollution** (`AIR_AOD_NO2_index`) | [NASA Aura OMI NO2](https://www.earthdata.nasa.gov/data/catalog/ges-disc-omno2-004) & MODIS AOD | `10.0 – 100.0` index | **Waveshaper Bitcrusher Grit:** Bandpass noise (`1,300 – 2,800 Hz`) routed through a non-linear `2x` oversampled distortion curve |
| **8** | **Atmospheric Carbon** (`CO2_ppm`) | [NASA OCO-2 / OCO-3](https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/oco-2) & [SVS 5196](https://svs.gsfc.nasa.gov/5196/) | `340.0 – 435.0 ppm` | **Harmonic Detune Tension:** Applies `0 to +35 cents` microtonal detuning across pad and lead voices as CO2 rises |
| **9** | **Nighttime Lights** (`NIGHT_LIGHTS_nW`) | [NASA Black Marble VIIRS](https://svs.gsfc.nasa.gov/5313/) (`VNP46A4`) | `0.0 – 100.0 nW/cm2/sr` | **Urban Arpeggiator Pulse:** Square-wave pentatonic arpeggiator speed (`1.5 – 8.5 steps/s`) reflecting human footprint expansion |
| **10** | **Active Fires & Disasters** (`EXTREME_EVENTS`) | [NASA FIRMS VIIRS](https://firms.modaps.eosdis.nasa.gov/download/) & [SVS 5113](https://svs.gsfc.nasa.gov/5113/) | `0 – 30+` events/yr | **Percussion & Sub-Drop Hits:** Triggers synthesized low-pass thunder noise bursts and `72 -> 42 Hz` pitch-drop drum hits |

### B. Computer-Vision Visual Frame Sonification (`src/filmstrip.js` & `src/sonify.js`)

In the **Sonification Lab (`studio.html`)**, each `256x256` satellite frame is sampled on a 2-pixel grid (`measureCell`) to extract a 6-dimensional visual feature vector in `< 4 ms` per frame:

* **Perceptual Luminance (`L = 0.2126*R + 0.7152*G + 0.0722*B`):** Opens the master low-pass filter (`320 – 2,820 Hz`).
* **Cloud Fraction (`R > 205 && G > 205 && B > 205`):** Controls pink/white atmospheric noise bed gain and bandpass center frequency.
* **Vegetation Greenness (`G - R`):** Shifts chord voicing between a somber minor third (`3 semitones`), major third (`4 semitones`), and open suspended fourth (`5 semitones`).
* **Spatial Edge Energy (`|dL_x| + |dL_y|`):** Drives rhythmic pulse rate (`0.55 – 4.45 Hz`) and harmonic pulse gain.
* **Water & Glacial Melt Ratio (`B > G + 8 && B > R + 14`):** Boosts the `A1` (`55 Hz`) sub-octave foundation.
* **Missing-Observation Guard (`blank` detection):** Uniform black/white satellite tiles (`contrast < 0.5`) are automatically flagged so the synthesizer never fabricates sound for missing orbital swaths.

---

## Covered Destinations (6 Bangladesh Frontlines + 2 Global EIC Showcases)

| Destination ID | Region / Showcase Name | Category & Climate Narrative | Coordinates | Year Span |
| :--- | :--- | :--- | :--- | :--- |
| `coxs_bazar` | **Cox's Bazar** (Bangladesh) | Southeastern coastline, monsoon extremes & coastal erosion | `21.43°N, 91.97°E` | `1985–2026` |
| `dhaka` | **Dhaka** (Bangladesh) | Central megacity, urban heat island, severe aquifer depletion (`-15.8 cm`) & air grit | `23.81°N, 90.41°E` | `1985–2026` |
| `chittagong` | **Chattogram** (Bangladesh) | Deep-water port, coastal hills, industrial night-light surge & tidal rise | `22.36°N, 91.81°E` | `1985–2026` |
| `sylhet` | **Sylhet** (Bangladesh) | Haor wetlands, tea gardens, highest rainfall & pre-monsoon lightning hotspot | `24.89°N, 91.87°E` | `1985–2026` |
| `sundarbans` | **Sundarbans** (Bangladesh) | World's largest mangrove forest, `GEDI` canopy reverb & relative sea-level rise | `21.95°N, 89.18°E` | `1985–2026` |
| `kutubdia_saint_martin` | **Kutubdia + Saint Martin** (Bangladesh) | Offshore Bay of Bengal islands facing shoreline retreat & salinity intrusion | `21.22°N, 92.09°E` | `1985–2026` |
| `mount_everest` | **Mount Everest & Khumbu** (Nepal — EIC) | Himalayan cryosphere snowline retreat & Imja Tsho glacial lake expansion ([SVS 4834](https://svs.gsfc.nasa.gov/4834/)) | `27.99°N, 86.93°E` | `2000–2026` |
| `global_wildfires` | **Pacific NW Wildfires** (Global EIC) | `VIIRS` Fire Radiative Power (`FRP`) & `GEOS-FP` black carbon smoke plumes ([SVS 5113](https://svs.gsfc.nasa.gov/5113/)) | `41.50°N, 121.50°W` | `2000–2026` |

---

## Accessibility-First Engineering (Impact)

Because **The Earth Information Jukebox** specifically highlights blind and low-vision inclusion, accessibility is woven into our core state machine:

* **Spoken Voice Guide (`window.speechSynthesis`):** A dedicated `Voice guide` toggle in the top audio HUD and a `Read each frame aloud` toggle in the Sonification Lab announce destination arrivals, active years, natural-language frame descriptions, and decade comparison deltas (`Δ`) aloud.
* **Complete Keyboard Control:**
  * `/` — Focus place search from anywhere
  * `Up` / `Down` + `Enter` — Navigate and select destinations
  * `Left` / `Right` — Step listening year backward/forward (`index.html`) or step 1 frame (`studio.html`)
  * `C` — Toggle instant A/B Decade Comparison (`1985 <-> 1995`, `2005 <-> 2015`, `1985 <-> 2026`, etc.)
  * `Space` — Play / Pause audio engine
  * `Esc` — Skip outbound flight animation or return to previous view
* **Responsive 3-Snap Mobile Bottom Sheet:** Engineered around `visualViewport` and `100dvh` with `PEEK`, `HALF`, and `FULL` snap states, `44x44 px` minimum touch targets, `aria-live="polite"` status announcements, and `prefers-reduced-motion: reduce` support.

---

## System Architecture & Zero-Dependency Stack

```text
DeltaEcho-Jukebox/
├── index.html                  # Main 3D Observatory shell, HUD, Place Explorer & 10-layer Signal Panel
├── styles.css                  # Observatory styling, +2px accessible typography & 3-snap mobile sheet
├── studio.html                 # Multi-dataset EIC Visual-Frame Sonification Lab
├── studio.css                  # Studio layout, live frame scanline & responsive readout bars
├── server.mjs                  # Zero-dependency Node.js static HTTP server (auto port-fallback)
├── tools/
│   └── build-regions.mjs       # Data compiler: Champion + EIC JSON -> compact src/regions.js index
├── src/
│   ├── main.js                 # App state machine (SOLAR, EXPLORE, FLYING, ATLAS) & render loop
│   ├── config.js               # Authoritative tuning constants: render, orbits, camera states, atlas
│   ├── camera-director.js      # Single-writer 8-stage keyframed camera rig & interruption recovery
│   ├── atlas.js                # Camera-attached locality plates & generated survey plate fallback
│   ├── region-imagery.js       # NASA HLS L30 & SVS EIC plate registry, dates, and source credits
│   ├── regions.js              # Generated 8-region, 42-year signal & comparison index
│   ├── signal-audio.js         # 10-voice Web Audio synthesizer (oscillators, convolver, waveshaper)
│   ├── filmstrip.js            # Multi-preset sprite-sheet slicer & 6-feature Computer Vision analyzer
│   ├── sonify.js               # Studio pentatonic harmonic & GISTEMP drift Web Audio engine
│   ├── studio.js               # Studio clock-locked transport, dataset switcher & weather readout
│   ├── studio-sky.js           # Shared procedural nebula & starfield backdrop for the Studio Lab
│   ├── ui.js                   # DOM controller, in-place region switcher, A/B compare & Voice Guide
│   ├── earth.js                # Day/night shaders, cloud deck & atmospheric Fresnel scattering
│   ├── solar-system.js         # Planetary orbits, Saturn rings & sun lighting alignment
│   ├── starfield.js            # Worker-baked 2048x1024 equirectangular nebula & 3-shell starfield
│   ├── space-dive.js           # WebGL2 warp-speed loader effect (disposed after reveal)
│   └── procedural-textures.js  # Deterministic PRNG nebula & cloud sprite pixel generators
├── assets/
│   ├── data/                   # Precomputed NASA Champion (1985–2026) & EIC CV (2000–2026) JSONs
│   └── textures/               # Planetary maps, NASA HLS L30 locality plates & EIC filmstrips
├── vendor/                     # Vendored Three.js r170 & GSAP 3.12.5 (zero npm install required)
└── docs/                       # Engineering contracts (architecture, camera-transitions, mobile-sheet)
```

---

## Quick Start (Run Locally in 5 Seconds)

Because Three.js (`r170`) and GSAP (`3.12.5`) are vendored as native ES modules, **there is no `npm install` and no build step.**

### Prerequisites
* **Node.js 18+** (used solely to run the zero-dependency static file server `server.mjs`)
* Any modern WebGL2-capable browser (Chrome, Edge, Firefox, Safari)

### Run Commands

```bash
# 1. Clone the repository
git clone https://github.com/aritradev/DeltaEcho-Jukebox.git
cd DeltaEcho-Jukebox

# 2. Start the zero-dependency static server (defaults to http://localhost:5173)
node server.mjs
```

* Open **`http://localhost:5173/`** for the **3D Earth Observatory & 10-Layer Signal Jukebox**.
* Open **`http://localhost:5173/studio.html`** for the **EIC Visual-Frame Sonification Lab**.
* *(Optional)* If you modify `assets/data/*.json`, regenerate `src/regions.js` with:
  ```bash
  node tools/build-regions.mjs
  ```

---

## NASA Datasets & Official Sources

All environmental time series, locality plates, and filmstrips are grounded in official NASA open data portals:

1. **[NASA Scientific Visualization Studio — Earth Information Center (EIC) Gallery](https://svs.gsfc.nasa.gov/gallery/earth-information-center/)**
   * [SVS ID 4834](https://svs.gsfc.nasa.gov/4834/): *First Global Survey of Glacial Lakes Shows 30-Years of Dramatic Growth (Mount Everest, Khumbu Glacier & Imja Tsho)*
   * [SVS ID 5113](https://svs.gsfc.nasa.gov/5113/) & [SVS ID 5453](https://svs.gsfc.nasa.gov/5453/): *Active Fires as Observed by VIIRS (Fire Radiative Power) & Annual Wildfire Burned Area*
   * [SVS ID 5450](https://svs.gsfc.nasa.gov/5450/): *Global Surface Temperature Anomalies (`GISTEMP v4`)*
   * [SVS ID 5313](https://svs.gsfc.nasa.gov/5313/): *Change in Night Lights (`NASA Black Marble VIIRS`) — EIC Version*
   * [SVS ID 4950](https://svs.gsfc.nasa.gov/4950/): *`ISS GEDI` Global Forest Canopy Height*
   * [SVS ID 5196](https://svs.gsfc.nasa.gov/5196/): *`DYAMOND` / `GEOS` Global Atmospheric Carbon Dioxide (CO2)*
2. **[NASA GIBS (Global Imagery Browse Services)](https://earthdata.nasa.gov/gibs) & [NASA Worldview Snapshots](https://wvs.earthdata.nasa.gov/)** — `HLS L30` (`Landsat 8/9`) true-colour regional plates for Bangladesh and `MODIS Terra` monthly filmstrip (`2000–2010`).
3. **[NASA POWER (Prediction Of Worldwide Energy Resources)](https://power.larc.nasa.gov/data-access-viewer/)** — `MERRA-2` and `SYN1DEG` daily/monthly `T2M`, `PRECTOTCORR`, `RH2M`, `WS2M`, and `ALLSKY_SFC_SW_DWN` series.
4. **[NASA GRACE / GRACE-FO Mascon Tellus](https://grace.jpl.nasa.gov/data/get-data/)** & **[NASA Sea Level Change Portal](https://sealevel.nasa.gov/)** — Terrestrial water storage anomalies and coastal relative sea-level trends.
5. **[NASA FIRMS (Fire Information for Resource Management System)](https://firms.modaps.eosdis.nasa.gov/download/)** & **[NASA Aura OMI](https://www.earthdata.nasa.gov/data/catalog/ges-disc-omno2-004)** — Active thermal anomalies and tropospheric NO2 / aerosol index.

---

## Team DeltaEcho

Developed for the **2026 NASA Space Apps Challenge**:

* **Aritra Dev Tirtha** — *Team Leader, Systems Architect & Lead Researcher* ([GitHub @aritradev](https://github.com/aritradev))
* **Ashabul Yamin Tuhin** — *AI/ML Specialist & Geospatial Data Analyst*
* **Jobayer Ahmed Efaz** — *Lead Developer & Technical Script Writer*
* **Md. Abtah ul Zawad Arjon** — *UI/UX Designer & Visual Media Editor*
* **Samir Bin Abdul Karim** — *Earth Science Researcher & Developer*
* **Wahed Shawn** — *Lead Frontend Developer & 3D Visual Artist*

---

## License & Attribution

* **Code License:** Released under the **Apache-2.0 / MIT Open Source License**.
* **Imagery & Data Credit:** *We acknowledge the use of imagery and data from the NASA Earth Information Center (EIC), NASA's Scientific Visualization Studio (SVS), the NASA Worldview application (https://worldview.earthdata.nasa.gov) part of the NASA Earth Science Data and Information System (ESDIS), NASA POWER, and USGS/NASA Landsat.*
