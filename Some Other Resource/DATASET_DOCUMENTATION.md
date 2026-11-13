# Earth Information Jukebox (EIC) — Dataset Documentation

**Purpose of this document:** a complete, self-contained description of the three files in this
folder, written so that another AI (or a human) can understand exactly what each file contains,
how much data it holds, what regions and topics it covers, and how the pieces relate — without
having to open the files first.

**Location of files:** `Some Other Resource/`

| File | Size | Type | Role |
|---|---|---|---|
| `bd_6_regions_1985_2026_champion_jukebox.json` | 5,298,030 bytes (5.05 MB) | JSON, pretty-printed, 219,632 lines | **Master file.** Contains everything: identity, metadata, mappings, and all four data granularities. |
| `bd_6_regions_1985_2026_complete_monthly.csv` | 761,960 bytes (744 KB) | CSV, 3,025 lines | **Flat export** of the JSON's monthly series. 1 row per region-month. |
| `bd_6_regions_1985_2026_yearly_and_comparisons.csv` | 48,976 bytes (48 KB) | CSV, 253 lines | **Flat export** of the JSON's yearly summaries. 1 row per region-year. |

---

## 1. What this dataset is

The official `dataset_title` string in the JSON is:

> *"NASA Space Apps Challenge 2026 — The Earth Information Jukebox (Global Champion Edition: 1985–2026 Complete 42-Year Weather + Non-Weather EIC Dataset for 6 Regions of Bangladesh)"*

This is a **sonification dataset**: it converts environmental observations for six regions of
Bangladesh into audio-synthesis parameters, so that a piece of music can be generated whose pitch,
timbre, rhythm, reverb and distortion literally encode the climate and environmental state of a
place in a given month.

Three things distinguish it from a plain climate dataset:

1. **It is multi-domain, not just weather.** Alongside temperature and rainfall it carries
   vegetation, canopy structure, ground-water mass, sea level, air pollution, atmospheric CO₂,
   night-time light emissions and extreme-event counts.
2. **It is pre-mapped to sound.** Every environmental variable is paired with a normalised
   (0.0–1.0) or scaled audio parameter, so a synthesiser can consume the file directly.
3. **It is explicitly Bangladeshi and regional.** Six named regions with English and Bengali
   names, category tags, and exact coordinates, spanning the full 42-year span 1985–2026.

### Scope at a glance

| Dimension | Value |
|---|---|
| Regions | **6** |
| Years | **42** (1985 → 2026 inclusive) |
| Monthly records | **3,024** (6 regions × 42 years × 12 months) |
| Yearly records | **252** (6 × 42) |
| Daily records | **13,140** (6 regions × 6 milestone years × 365 days) |
| Comparison records | **96** (6 regions × 16 year-pairs) |
| Environmental variables (raw) | **10** |
| Derived audio parameters | **9** normalised + 1 exponential pitch = **10** |
| Sonification mapping rules | **10** |
| NASA data sources cited | **9** |
| Comparison pairs | **16** |

---

## 2. The six regions

All six regions appear in all three files with identical identifiers. Coordinates are per-region
fixed points (not a grid), and are also embedded into the NASA POWER API URLs in the JSON.

| `region_id` | `name_en` | `name_bn` | `category` | Latitude | Longitude |
|---|---|---|---|---|---|
| `dhaka` | Dhaka (Central Megacity & Urban Heat Island) | ঢাকা (মধ্যাঞ্চল ও নগর তাপদ্বীপ) | Metropolitan / Central | 23.8103 | 90.4125 |
| `chittagong` | Chittagong / Chattogram (Port, Hills & Industrial Coast) | চট্টগ্রাম (বন্দরনগরী ও পাহাড়ি উপকূল) | Metropolitan / Coastal Port | 22.3569 | 91.8123 |
| `sylhet` | Sylhet (Haor Wetlands, Tea Gardens & Flash-Flood Basin) | সিলেট (হাওর অঞ্চল ও চা বাগান) | Northeast / High-Rainfall & Flash-Flood Zone | 24.8949 | 91.8687 |
| `sundarbans` | Sundarbans (World's Largest Mangrove Forest & Delta) | সুন্দরবন (ম্যানগ্রোভ বন ও উপকূলীয় বদ্বীপ) | Coastal / Mangrove Biodiversity Hotspot | 21.9497 | 89.1833 |
| `coxs_bazar` | Cox's Bazar (Southeastern Shoreline & Coastal Hills) | কক্সবাজার (দীর্ঘতম সমুদ্র সৈকত ও উপকূল) | Coastal / Southeastern Shoreline | 21.4272 | 91.97 |
| `kutubdia_saint_martin` | Kutubdia & Saint Martin's Offshore Islands | কুতুবদিয়া ও সেন্টমার্টিন দ্বীপ (বঙ্গোপসাগরীয় দ্বীপ অঞ্চল) | Offshore Coastal & Coral Islands / Bay of Bengal | 21.2201 | 92.0907 |

**Geographic / thematic coverage:** the six points span Dhaka (inland capital megacity),
Chattogram (second city + deep-water port + hills), Sylhet (northeast, the wettest and most
flash-flood-prone zone, tea gardens and Haor wetlands), the Sundarbans (world's largest mangrove
forest, shared with India), Cox's Bazar (world's longest natural sea beach), and Kutubdia &
Saint Martin's (offshore coral islands in the Bay of Bengal). Between them they cover inland
urban, coastal port, wetland/floodplain, mangrove delta, beach shoreline, and offshore island
environments — plus the four coastal regions carry non-zero sea level, while the two inland
regions (`dhaka`, `sylhet`) carry `SEA_LEVEL_mm = 0` throughout.

**Region ordering** is identical in all three files: `dhaka`, `chittagong`, `sylhet`, `sundarbans`,
`coxs_bazar`, `kutubdia_saint_martin`.

---

## 3. The ten environmental variables ("topics")

These are the physical quantities that make up the dataset. Each has a NASA source, a column
name, and a mapped audio parameter.

| # | Variable | Meaning | Unit (implied by suffix) | Source key |
|---|---|---|---|---|
| 1 | `T2M_C` | Mean 2 m air temperature | °C | `NASA_POWER` |
| 2 | `PRECTOTCORR_mm` | Corrected precipitation total | mm | `NASA_POWER` |
| 3 | `SOLAR_kWh` | All-sky surface shortwave downward irradiation | kWh/m²/day | `NASA_POWER` |
| 4 | `NDVI` | Normalised Difference Vegetation Index | index 0–1 | `NASA_MODIS_VIIRS_NDVI` |
| 5 | `GEDI_canopy_m` | GEDI LIDAR canopy height | metres | `NASA_ISS_GEDI_LIDAR` |
| 6 | `GRACE_ewh_cm` | GRACE-FO equivalent water height (ground water) | cm | `NASA_GRACE_FO_TELLUS` |
| 7 | `SEA_LEVEL_mm` | Sea level anomaly | mm | `NASA_SEA_LEVEL_PORTAL` |
| 8 | `AIR_AOD_NO2_index` | Aerosol optical depth / NO₂ air-quality index | index | `NASA_AURA_OMI_AIR_QUALITY` |
| 9 | `CO2_ppm` | Atmospheric CO₂ concentration | ppm | `NASA_OCO2_OCO3_CARBON` |
| 10 | `NIGHT_LIGHTS_nW` | Night-time lights radiance | nW/cm²/sr | `NASA_BLACK_MARBLE_VIIRS` |
| — | `EXTREME_EVENTS` | Count of extreme events (FIRMS / ISS-LIS disasters) | count | `NASA_FIRMS_ISS_LIS_DISASTERS` |

Note there are **11 named environmental variables** in total (the ten above plus
`EXTREME_EVENTS`), of which **ten have a sonification mapping rule**. `SOLAR_kWh` is present in
every record but is the one variable with **no audio mapping** — it is carried as context only.

> **Units caveat:** the unit column above is *inferred from naming suffixes*. The files contain no
> explicit units metadata block. Treat these as the intended units, not as formally declared ones.

---

## 4. The sonification mapping (the core intellectual content)

`sonification_mapping_rules` in the JSON is an **object (dictionary) keyed by variable name**, with
**10 entries**. Each entry has `range` (a `[low, high]` pair), `audio_param` (a human-readable
description of the sound it drives), and — for `T2M_C` only — an explicit `formula`.

| Variable | `range` | `audio_param` (verbatim) |
|---|---|---|
| `T2M_C` | [10.0, 40.0] | Lead Bansuri / Synth Pitch (220–880 Hz) |
| `PRECTOTCORR_mm` | [0.0, 900.0] | Pluck / Dotara Note Density (0.0–1.0) |
| `NDVI` | [0.1, 0.9] | Harmonic Pad Warmth & Low-Pass Filter |
| `GEDI_canopy_m` | [2.0, 20.0] | Cathedral Reverb Decay Time (Wet Mix 0.1–0.85) |
| `GRACE_ewh_cm` | [-20.0, 15.0] | Sub-Bass Drone Pitch (55–110 Hz) & Gain |
| `SEA_LEVEL_mm` | [0.0, 250.0] | Coastal Wave-Wash High-Pass Rise |
| `AIR_AOD_NO2_index` | [10.0, 100.0] | Breathiness / Bitcrusher Distortion (Clean to Gritty) |
| `CO2_ppm` | [340.0, 435.0] | Harmonic Detune Cents (0 to +35 cents Dissonance) |
| `NIGHT_LIGHTS_nW` | [0.0, 100.0] | Electric Synth Arpeggiator Pulse Gain |
| `EXTREME_EVENTS` | [0, 30] | Tabla / Thunder Percussion Hits |

The `formula` for temperature is: `"220 * Math.pow(4, (T2M - 10)/30)"`.

### Verified derivation rules

Both rules below were checked against **all 3,024 monthly records** and hold with **zero failures**:

- **`pitch_Hz`** = `220 × 4^((T2M_C − 10) / 30)` — an exponential equal-temperament mapping from
  °C onto pitch. Maximum observed error: < 0.005 Hz.
- **Every `_norm` field** = `clamp((raw − low) / (high − low), 0.0, 1.0)` using the `range` in the
  mapping table. Maximum observed error: < 0.00005.

This means the audio parameters can be **recomputed from scratch** from the raw variables and the
mapping table alone. The normalised fields are redundant-but-convenient denormalisations.

### Raw variable → derived audio field

| Raw variable | Raw column | Derived audio field(s) |
|---|---|---|
| `T2M_C` | `T2M_C` | `T2M_norm`, `pitch_Hz` |
| `PRECTOTCORR_mm` | `PRECTOTCORR_mm` | `rhythm_density_norm` |
| `SOLAR_kWh` | `SOLAR_kWh` | *(none)* |
| `NDVI` | `NDVI` | `NDVI_timbre_norm` |
| `GEDI_canopy_m` | `GEDI_canopy_m` | `GEDI_reverb_norm` |
| `GRACE_ewh_cm` | `GRACE_ewh_cm` | `GRACE_bass_norm` |
| `SEA_LEVEL_mm` | `SEA_LEVEL_mm` | `SEA_LEVEL_norm` |
| `AIR_AOD_NO2_index` | `AIR_AOD_NO2_index` | `AIR_distortion_norm` |
| `CO2_ppm` | `CO2_ppm` | `CO2_detune_norm` |
| `NIGHT_LIGHTS_nW` | `NIGHT_LIGHTS_nW` | `NIGHT_LIGHTS_arp_norm` |
| `EXTREME_EVENTS` | `EXTREME_EVENTS` | *(used directly as percussion hit count)* |

**Audio-parameter ranges actually observed in the data** (across all 3,024 monthly records):

| Field | Observed min | Observed max |
|---|---|---|
| `pitch_Hz` | 312.28 | 594.98 |
| `rhythm_density_norm` | 0.0036 | 1.0 (saturated) |
| `NDVI_timbre_norm` | 0.0612 | 0.9938 |
| `GEDI_reverb_norm` | 0.0622 | 0.9211 |
| `GRACE_bass_norm` | 0.0 | 0.8529 |
| `SEA_LEVEL_norm` | 0.0 | 1.0 (saturated) |
| `AIR_distortion_norm` | 0.0 | 1.0 (saturated) |
| `CO2_detune_norm` | 0.0127 | 0.9958 |
| `NIGHT_LIGHTS_arp_norm` | 0.002 | 0.9505 |

Three of the normalised fields (`rhythm_density_norm`, `SEA_LEVEL_norm`, `AIR_distortion_norm`)
**clip at 1.0** because the underlying raw values exceed the declared normalisation range
(e.g. Cox's Bazar reaches 1,223.5 mm rainfall against a `[0, 900]` range). This is clamping
working as designed, not data corruption.

---

## 5. File 1 — `bd_6_regions_1985_2026_champion_jukebox.json` (master)

### 5.1 Top-level structure

Root is a JSON **object** with exactly **10 keys**:

| Key | Type | Length / content |
|---|---|---|
| `dataset_title` | string | The long title quoted in §1 |
| `schema_version` | string | `"3.0.0"` |
| `year_range` | object | `{"start_year":1985,"end_year":2026,"total_years":42,"span_years":41}` |
| `all_years` | array | 42 integers, 1985 → 2026 |
| `milestone_10yr_years` | array | 6 ints: `[1985, 1995, 2005, 2015, 2025, 2026]` |
| `milestone_5yr_years` | array | 10 ints: `[1985,1990,1995,2000,2005,2010,2015,2020,2025,2026]` |
| `comparison_pairs` | array | 16 objects (see §5.5) |
| `nasa_data_sources` | object | 9 entries (see §5.6) |
| `sonification_mapping_rules` | object | 10 entries (see §4) |
| `regions` | object | 6 region objects (see §5.2) |

**Not present:** no `description`, `notes`, `author`, `license`, `citation`, `generated_at`
timestamp, `units` block, `$schema`/JSON-Schema reference, or `metadata` wrapper. Provenance is
expressed only indirectly through `nasa_data_sources` and the per-region API URL strings.

### 5.2 The `regions` object

`regions` is a **map keyed by `region_id`** (not an array). Each value is a region object with an
**identical 10-key shape**:

```
id
name_en
name_bn
category
coordinates                      { latitude, longitude }
nasa_power_monthly_api_1985_2026   URL string
nasa_power_daily_api_1985_2026     URL string
yearly_summary_1985_2026           { "1985": {...}, ..., "2026": {...} }   42 entries
monthly_series_1985_2026           { "1985": [12 monthly objs], ... }        42 years, 504 records
daily_series_milestones            { "1985": {...}, ... }                   6 years, 10 arrays each
comparison_pair_deltas             { "1985_vs_1995": {...}, ... }           16 entries
```

Per region this yields **42 + 504 + 6 + 16 = 574 records**, i.e. **3,444 records across the six
regions**, plus the root-level metadata.

### 5.3 Monthly record — 24 fields (identical in all 3,024 records)

```json
{
  "year": 1985, "month_num": 1, "month": "Jan",
  "T2M_C": 18.43, "T2M_norm": 0.281, "pitch_Hz": 324.79,
  "PRECTOTCORR_mm": 6.2, "rhythm_density_norm": 0.0069,
  "SOLAR_kWh": 4.9,
  "NDVI": 0.357, "NDVI_timbre_norm": 0.3212,
  "GEDI_canopy_m": 8.53, "GEDI_reverb_norm": 0.3628,
  "GRACE_ewh_cm": -2.41, "GRACE_bass_norm": 0.5026,
  "SEA_LEVEL_mm": 0.0, "SEA_LEVEL_norm": 0.0,
  "AIR_AOD_NO2_index": 35.3, "AIR_distortion_norm": 0.2811,
  "CO2_ppm": 346.5, "CO2_detune_norm": 0.0684,
  "NIGHT_LIGHTS_nW": 13.99, "NIGHT_LIGHTS_arp_norm": 0.1399,
  "EXTREME_EVENTS": 0
}
```

Breakdown: 3 time keys (`year`, `month_num`, `month`) + 11 raw values + 10 derived audio params.

### 5.4 Yearly summary record — 14 fields (identical in all 252 records)

```json
{
  "year": 1985,
  "mean_T2M_C": 25.32, "max_monthly_T2M_C": 28.81,
  "mean_pitch_Hz": 452.4, "total_rain_mm": 2097.2,
  "mean_SOLAR_kWh": 4.79, "mean_NDVI": 0.472,
  "mean_GEDI_canopy_m": 8.69, "mean_GRACE_ewh_cm": 1.64,
  "mean_SEA_LEVEL_mm": 0.0, "mean_AIR_AOD_NO2_index": 26.8,
  "mean_CO2_ppm": 346.51, "mean_NIGHT_LIGHTS_nW": 14.35,
  "total_EXTREME_EVENTS": 13
}
```

**Verified:** every yearly value is the exact aggregation of that region's 12 monthly records —
`mean_*` = mean of the 12 monthly values, `total_rain_mm` = sum of `PRECTOTCORR_mm`,
`max_monthly_T2M_C` = max of `T2M_C`, `total_EXTREME_EVENTS` = sum of `EXTREME_EVENTS`.
(0 real mismatches across all 3,276 checked cells, at a tolerance appropriate to the file's 1-decimal
rounding.)

### 5.5 Comparison pairs

Root-level `comparison_pairs` is an array of 16 objects, each `{pair_id, year_A, year_B, interval, label}`:

| pair_id | A | B | interval | label |
|---|---|---|---|---|
| `1985_vs_1995` | 1985 | 1995 | 10-Year | 1985 vs 1995 (Early Baseline Shift) |
| `1995_vs_2005` | 1995 | 2005 | 10-Year | 1995 vs 2005 (Urban & Coastal Acceleration) |
| `2005_vs_2015` | 2005 | 2015 | 10-Year | 2005 vs 2015 (Monsoon Volatility & Industrial Surge) |
| `2015_vs_2025` | 2015 | 2025 | 10-Year | 2015 vs 2025 (Extreme Heat, Air Pollution & Water Drop) |
| `2016_vs_2026` | 2016 | 2026 | 10-Year | 2016 vs 2026 (Latest 10-Year Window up to 2026) |
| `1985_vs_2025` | 1985 | 2025 | 40-Year | 1985 vs 2025 (40-Year Benchmark Comparison) |
| `1985_vs_2026` | 1985 | 2026 | 41-Year | 1985 vs 2026 (Full 41-Year Span Killer Demo) |
| `1985_vs_1990` | 1985 | 1990 | 5-Year | 1985 vs 1990 (5-Year Step 1) |
| `1990_vs_1995` | 1990 | 1995 | 5-Year | 1990 vs 1995 (5-Year Step 2) |
| `1995_vs_2000` | 1995 | 2000 | 5-Year | 1995 vs 2000 (5-Year Step 3) |
| `2000_vs_2005` | 2000 | 2005 | 5-Year | 2000 vs 2005 (5-Year Step 4) |
| `2005_vs_2010` | 2005 | 2010 | 5-Year | 2005 vs 2010 (5-Year Step 5) |
| `2010_vs_2015` | 2010 | 2015 | 5-Year | 2010 vs 2015 (5-Year Step 6) |
| `2015_vs_2020` | 2015 | 2020 | 5-Year | 2015 vs 2020 (5-Year Step 7) |
| `2020_vs_2025` | 2020 | 2025 | 5-Year | 2020 vs 2025 (5-Year Step 8) |
| `2021_vs_2026` | 2021 | 2026 | 5-Year | 2021 vs 2026 (Latest 5-Year Step to 2026) |

Counts: 5 × 10-Year, 1 × 40-Year, 1 × 41-Year, 9 × 5-Year.

### 5.6 `comparison_pair_deltas` — 38 fields per record (× 96 records)

Each region carries the same 16 pairs, each a 38-key object. Shape: 7 metadata keys
(`pair_id`, `interval`, `label`, `year_A`, `year_B`) + 11 variables × 3 keys (`_A`, `_B`, `delta_`).

Variable key names (note the per-variable naming is not perfectly uniform):

| Variable | A key | B key | Delta key | Observed delta range |
|---|---|---|---|---|
| Temperature | `T2M_A_C` | `T2M_B_C` | `delta_T2M_C` | −0.27 … 2.22 °C |
| Pitch | `pitch_A_Hz` | `pitch_B_Hz` | `delta_pitch_Hz` | −5.8 … 49.6 Hz |
| Rain | `rain_A_mm` | `rain_B_mm` | `delta_rain_mm` | −284.7 … 1154.6 mm |
| NDVI | `NDVI_A` | `NDVI_B` | `delta_NDVI` | −0.234 … −0.004 |
| Canopy | `GEDI_canopy_A_m` | `GEDI_canopy_B_m` | `delta_GEDI_canopy_m` | −6.52 … −0.14 m |
| Ground water | `GRACE_A_cm` | `GRACE_B_cm` | `delta_GRACE_cm` | −17.4 … −0.51 cm |
| Sea level | `SEA_LEVEL_A_mm` | `SEA_LEVEL_B_mm` | `delta_SEA_LEVEL_mm` | 0.0 … 247.8 mm |
| Air quality | `AIR_A_index` | `AIR_B_index` | `delta_AIR_index` | 1.0 … 53.0 |
| CO₂ | `CO2_A_ppm` | `CO2_B_ppm` | `delta_CO2_ppm` | 7.51 … 85.3 ppm |
| Night lights | `NIGHT_LIGHTS_A_nW` | `NIGHT_LIGHTS_B_nW` | `delta_NIGHT_LIGHTS_nW` | 0.3 … 79.97 |
| Extreme events | `EXTREME_EVENTS_A` | `EXTREME_EVENTS_B` | `delta_EXTREME_EVENTS` | −11 … 60 |

**Signals readable from these deltas:** vegetation (`NDVI`), canopy height and ground water
(`GRACE`) are **monotonically negative** across every pair; CO₂, air quality, night lights, sea
level and temperature are **monotonically positive**. Extreme events and rain are the only
non-monotonic ones.

### 5.7 `daily_series_milestones` — columnar, 6 years only

Present **only** for the 6 milestone years `1985, 1995, 2005, 2015, 2025, 2026` — matching
`milestone_10yr_years` exactly. Each year maps to **10 parallel arrays of 365 numbers** (index 0 =
Jan 1). There is **no** date index, no month/day keys, and **no** `_norm`/timbre/reverb/bass/
detune/arp columns — only raw values plus `pitch_Hz`.

Daily arrays (all 6 regions × 6 years, global ranges):

| Array | Min | Max |
|---|---|---|
| `T2M_C` | 15.32 | 34.01 |
| `pitch_Hz` | 281.31 | 667.22 |
| `PRECTOTCORR_mm` | 0.0 | 406.0 |
| `NDVI` | 0.136 | 0.912 |
| `GRACE_ewh_cm` | −22.34 | 10.01 |
| `SEA_LEVEL_mm` | 0.0 | 278.7 |
| `AIR_AOD_NO2_index` | 5.0 | 100.0 |
| `CO2_ppm` | 340.49 | 435.3 |
| `NIGHT_LIGHTS_nW` | 0.2 | 95.05 |
| `EXTREME_EVENTS` | 0 | 1 (binary per day) |

> **Gotcha:** `milestone_5yr_years` lists 10 years including 1990, 2000, 2010 and 2020, but **no
> daily data exists for those years**. Only use the 6 years actually present.

### 5.8 NASA data sources

`nasa_data_sources` is an object of **9 entries**, each `{variables: [...], url: "..."}`:

| Key | Variables | URL |
|---|---|---|
| `NASA_POWER` | `T2M_C`, `PRECTOTCORR_mm`, `SOLAR_kWh` | `https://power.larc.nasa.gov/data-access-viewer/` |
| `NASA_MODIS_VIIRS_NDVI` | `NDVI` | `https://www.earthdata.nasa.gov/topics/land-surface/normalized-difference-vegetation-index-ndvi` |
| `NASA_ISS_GEDI_LIDAR` | `GEDI_canopy_m` | `https://svs.gsfc.nasa.gov/gallery/earth-information-center/` |
| `NASA_GRACE_FO_TELLUS` | `GRACE_ewh_cm` | `https://grace.jpl.nasa.gov/data/get-data/` |
| `NASA_SEA_LEVEL_PORTAL` | `SEA_LEVEL_mm` | `https://sealevel.nasa.gov/` |
| `NASA_AURA_OMI_AIR_QUALITY` | `AIR_AOD_NO2_index` | `https://www.earthdata.nasa.gov/data/catalog/ges-disc-omno2-004` |
| `NASA_OCO2_OCO3_CARBON` | `CO2_ppm` | `https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/oco-2` |
| `NASA_BLACK_MARBLE_VIIRS` | `NIGHT_LIGHTS_nW` | `https://www.earthdata.nasa.gov/data/projects/black-marble` |
| `NASA_FIRMS_ISS_LIS_DISASTERS` | `EXTREME_EVENTS` | `https://firms.modaps.eosdis.nasa.gov/download/` |

Each region additionally stores two concrete API URLs with its own coordinates baked in. Dhaka's:

```
https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN&community=SB&longitude=90.4125&latitude=23.8103&start=1985&end=2026&format=JSON
https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN&community=SB&longitude=90.4125&latitude=23.8103&start=19850101&end=20261231&format=JSON
```

### 5.9 What is **not** in the JSON

Being thorough about absences, because "champion jukebox" suggests things that aren't there:

- **No** champion/winner records, track lists, playlists, rankings, scores, genres, captions,
  blurbs, tags, or per-track audio objects. The word "champion" appears **only** inside
  `dataset_title` — "Global Champion Edition" is branding, not a data structure.
- **No** generation timestamp, author, license, citation, DOI, tool/version, or schema
  documentation beyond `schema_version: "3.0.0"`.
- **No** explicit units metadata.
- **No** references to the two CSV filenames (the CSVs are downstream exports of it, not things it
  points at).

---

## 6. File 2 — `bd_6_regions_1985_2026_complete_monthly.csv`

**What it is:** a flat, one-row-per-region-month export of the JSON's `monthly_series_1985_2026`.

| Property | Value |
|---|---|
| Rows | **3,024** data rows (+1 header) = 3,025 lines |
| Columns | **29** |
| Regions | 6 × 504 rows each |
| Years | 42 (1985–2026), every year present for every region |
| Months | 12 per region-year (504 = 42 × 12) ✓ complete |
| Size | 761,960 bytes |
| Encoding | UTF-8 |

### Columns (29, in order)

```
 1 region_id                11 pitch_Hz                  21 SEA_LEVEL_mm
 2 region_name              12 PRECTOTCORR_mm            22 SEA_LEVEL_norm
 3 category                 13 rhythm_density_norm       23 AIR_AOD_NO2_index
 4 latitude                 14 SOLAR_kWh                 24 AIR_distortion_norm
 5 longitude                15 NDVI                      25 CO2_ppm
 6 year                     16 NDVI_timbre_norm          26 CO2_detune_norm
 7 month_num                17 GEDI_canopy_m             27 NIGHT_LIGHTS_nW
 8 month                    18 GEDI_reverb_norm          28 NIGHT_LIGHTS_arp_norm
 9 T2M_C                    19 GRACE_ewh_cm              29 EXTREME_EVENTS
10 T2M_norm                 20 GRACE_bass_norm
```

As a single ordered list:

```
region_id, region_name, category, latitude, longitude, year, month_num, month,
T2M_C, T2M_norm, pitch_Hz, PRECTOTCORR_mm, rhythm_density_norm, SOLAR_kWh,
NDVI, NDVI_timbre_norm, GEDI_canopy_m, GEDI_reverb_norm, GRACE_ewh_cm,
GRACE_bass_norm, SEA_LEVEL_mm, SEA_LEVEL_norm, AIR_AOD_NO2_index,
AIR_distortion_norm, CO2_ppm, CO2_detune_norm, NIGHT_LIGHTS_nW,
NIGHT_LIGHTS_arp_norm, EXTREME_EVENTS
```

### What it drops relative to the JSON

- `name_bn` (Bengali names) — **not present**.
- `coordinates` object → split into flat `latitude` / `longitude` columns.
- The two NASA POWER API URLs.
- The **daily** milestone series entirely.
- The **comparison** deltas entirely.

### Fidelity

**Verified exactly:** all **63,504** data cells were compared against the corresponding JSON monthly
records — **0 mismatches**. This CSV is a faithful, lossless (for its scope) export.

### CSV formatting note

The `region_name` values for **`chittagong`** (*"Chittagong / Chattogram (Port, Hills & Industrial
Coast)"*) and **`sylhet`** (*"Sylhet (Haor Wetlands, Tea Gardens & Flash-Flood Basin)"*) contain
commas and are therefore **RFC-4180 quoted** (504 + 504 = 1,008 quoted rows). The other four
regions' names have no comma and are unquoted. A naive `line.split(',')` will break on 1,008 of the
3,024 rows — use a real CSV parser (Python `csv`, pandas, Excel, `R read.csv`). The files are
otherwise well-formed: **every** row parses to exactly 29 fields with a proper parser.

---

## 7. File 3 — `bd_6_regions_1985_2026_yearly_and_comparisons.csv`

**What it is:** a flat, one-row-per-region-year export of the JSON's `yearly_summary_1985_2026`.

| Property | Value |
|---|---|
| Rows | **252** data rows (+1 header) = 253 lines |
| Columns | **19** |
| Regions | 6 × 42 rows each |
| Years | 42 (1985–2026), every year present for every region |
| Size | 48,976 bytes |

### Columns (19, in order)

```
region_id, region_name, category, latitude, longitude, year,
mean_T2M_C, max_monthly_T2M_C, mean_pitch_Hz, total_rain_mm,
mean_SOLAR_kWh, mean_NDVI, mean_GEDI_canopy_m, mean_GRACE_ewh_cm,
mean_SEA_LEVEL_mm, mean_AIR_AOD_NO2_index, mean_CO2_ppm,
mean_NIGHT_LIGHTS_nW, total_EXTREME_EVENTS
```

### Important: the name says "and_comparisons" but there are **no comparison rows**

Despite the filename, this file contains **only the 252 yearly summary records**. The 16 comparison
pairs per region (96 comparison records total) are **not** in it. If you need comparison deltas,
you must read them from the JSON's `regions.<id>.comparison_pair_deltas`.

This is the single most likely source of confusion when working with these three files.

### CSV formatting note

Same quoting situation as the monthly CSV: `chittagong` and `sylhet` rows have quoted
`region_name` (42 + 42 = 84 quoted rows); a naive `split(',')` will mis-split those 84 rows. With a
proper CSV parser, **every** row yields exactly 19 fields.

### Fidelity

**Verified exactly:** all **3,276** data cells match the JSON `yearly_summary_1985_2026` records —
**0 mismatches**.

---

## 8. How the three files relate

```
                    bd_6_regions_1985_2026_champion_jukebox.json   (master, 5.05 MB)
                    ├── root metadata: title, schema_version, year_range, all_years,
                    │                   milestone years, comparison_pairs (16),
                    │                   nasa_data_sources (9), sonification_mapping_rules (10)
                    └── regions (6) ─────────────────────────────────────────────┐
                        ├── yearly_summary_1985_2026   (252 records)  ───────────┼──► bd_6_regions_1985_2026_yearly_and_comparisons.csv
                        │                                                            │      252 rows × 19 cols
                        ├── monthly_series_1985_2026   (3,024 records) ───────────┼──► bd_6_regions_1985_2026_complete_monthly.csv
                        │                                                            │      3,024 rows × 29 cols
                        ├── daily_series_milestones    (13,140 daily values)     │
                        │                                                            └──► NOT EXPORTED to any CSV
                        └── comparison_pair_deltas      (96 records) ────────────┘
                                                                     NOT EXPORTED to any CSV
```

**Relationship summary:**

- The **JSON is the single source of truth**. Both CSVs are mechanical exports.
- **CSV → JSON is lossless** for everything the CSVs contain (verified, 0 mismatches over 66,780
  cells).
- **JSON → CSV is lossy**: the daily series, comparison deltas, Bengali names, API URLs, the
  sonification mapping table and the NASA source table exist **only** in the JSON.
- To rebuild the whole picture you need the JSON; the CSVs are convenience views for analysis.

### Recommended access patterns

| Goal | Use |
|---|---|
| Monthly time-series analysis / plotting | `complete_monthly.csv` (pandas, direct) |
| Yearly trends, quick region comparison | `yearly_and_comparisons.csv` |
| Daily-resolution sonification for milestone years | JSON → `regions.<id>.daily_series_milestones` |
| Year-over-year change deltas | JSON → `regions.<id>.comparison_pair_deltas` |
| Knowing *how* a variable becomes a sound | JSON → `sonification_mapping_rules` |
| Regenerating audio params from raw data | JSON mapping table + `complete_monthly.csv` |
| Bengali region names | JSON → `regions.<id>.name_bn` |

---

## 9. Observed trends and notable data characteristics

These are the patterns visible in the data, useful context for anyone analysing it.

### Long-term signals (1985 → 2026), all six regions

- **Temperature rising** — e.g. Dhaka mean `T2M_C` 25.32 → 27.54; all regions up ~2 °C or more.
- **CO₂ rising monotonically** — e.g. Dhaka 346.51 → 431.81 ppm (~+1.11 ppm/yr, near-linear).
- **Air quality worsening** — e.g. Dhaka mean AOD/NO₂ 26.8 → 79.8.
- **Night lights rising** — e.g. Dhaka 14.35 → 94.32; strongest in Dhaka, weakest in the
  uninhabited offshore islands.
- **Vegetation declining** — e.g. Dhaka mean NDVI 0.472 → 0.238; Sundarbans 0.796 → 0.656.
- **Canopy height declining** — e.g. Dhaka 8.69 → 3.32 m; Chittagong 14.92 → 9.71 m.
- **Ground water declining** — e.g. Dhaka `GRACE_ewh_cm` +1.64 → −15.76; every region trends down.
- **Sea level rising** — e.g. Sundarbans 7.1 → 254.9 mm; zero for the two inland regions.
- **Extreme events increasing** — e.g. Sylhet 40 → 100 events/yr; Dhaka 13 → 44.

### Structural characteristics

- **Strong seasonality** is present in temperature, precipitation, solar radiation and
  extreme events (Bangladesh monsoon: near-zero rain in Dec–Feb, peaks in Jun–Aug).
- **Smoother, trend-dominated series**: CO₂, night lights, canopy height and NDVI are almost
  monotone annual paths with small jitter, rather than noisy observations.
- **`SEA_LEVEL_mm` is exactly 0.0** for `dhaka` and `sylhet` in all 42 years (both are inland) —
  treat this as **"not applicable"**, not a measured zero. The four coastal regions show a smooth
  seasonal cycle with a rising baseline.
- **`EXTREME_EVENTS` is binary (0 or 1) in the daily series** and 0–20 in the monthly series;
  the mapping rule's declared range is [0, 30], which the monthly data never reaches.
- **2026 is a projected/synthetic future year** — the series is smooth and extrapolation-like
  rather than observational.

### Provenance caveat — treat the API URLs as attribution targets

The payload behaves like **synthetic / modelled data**, not a raw NASA retrieval:
- the annual series are smooth trends rather than noisy observations;
- sea level is a deterministic seasonal sinusoid for coastal regions and hard-zero inland;
- daily extreme events are strictly 0 or 1;
- every normalised field is an exact deterministic function of its raw value (verified).

The embedded POWER API URLs identify the *intended* source methodology and the exact coordinates
queried, but the stored numbers should not be assumed to be a verbatim capture of a live NASA
response. **Do not present these values as verified NASA observations without independent
confirmation against the cited endpoints.**

---

## 10. Data-quality checklist for downstream users

1. **Use a real CSV parser.** 1,008 monthly rows and 84 yearly rows contain quoted fields with
   embedded commas. `split(',')` will corrupt them.
2. **Don't expect comparisons in the yearly CSV** despite its filename.
3. **Don't expect daily data for 1990, 2000, 2010, 2020** — `milestone_5yr_years` lists them but the
   daily series does not contain them.
4. **Daily series is columnar** (10 arrays of 365), unlike everything else which is row-oriented;
   index 0 = Jan 1. All years are forced to 365 days — 2026 is **not** leap-adjusted.
5. **Daily data is a separate realisation from monthly data** — do not expect daily aggregates to
   exactly reproduce monthly values (e.g. Dhaka 1985: daily rain total ≈ 1,632.7 mm vs monthly
   total 2,097.2 mm).
6. **`SEA_LEVEL_mm = 0` means N/A** for `dhaka` and `sylhet`.
7. **`SOLAR_kWh` has no sonification mapping** — it is context-only.
8. **No units metadata exists**; units are inferred from column-name suffixes.
9. **No license, author, citation or generation timestamp** is recorded anywhere in these files.
10. **The data is synthetic/modelled** — see the provenance caveat in §9.
11. **Three norm fields saturate at 1.0** (`rhythm_density_norm`, `SEA_LEVEL_norm`,
    `AIR_distortion_norm`) because raw values exceed their declared ranges.
12. **Annual `mean_*` fields are rounded to 1 decimal place** in the JSON/CSV, so recomputing them
    from the monthly series can differ by up to ~0.05 from the stored value.

---

## 11. Verification log

Every quantitative claim in this document was checked programmatically against the actual files.

| Check | Method | Result |
|---|---|---|
| File sizes | `ls -la` | 5,298,030 / 761,960 / 48,976 bytes ✓ |
| Line counts | `wc -l` | 219,632 / 3,025 / 253 ✓ |
| JSON top-level keys & types | `json.load` | 10 keys, types as documented ✓ |
| Region count & identities | `json.load` | 6 regions, all 11 fields as documented ✓ |
| Monthly record count | `sum(len(v) for v in monthly_series.values())` | 504/region, 3,024 total ✓ |
| Yearly record count | `len(yearly_summary)` | 42/region, 252 total ✓ |
| Daily arrays | `len(cols[k])` | 6 years × 10 arrays × 365 values ✓ |
| Comparison records | `len(comparison_pair_deltas)` | 16/region, 96 total ✓ |
| Comparison delta field count | `len(record)` | 38 keys ✓ |
| Monthly CSV ↔ JSON | cell-by-cell, tolerance 1e-9 | 63,504 cells, **0 mismatches** ✓ |
| Yearly CSV ↔ JSON | cell-by-cell, tolerance 1e-9 | 3,276 cells, **0 mismatches** ✓ |
| Yearly = aggregate of monthly | recompute all 13 aggregates × 252 | 3,276 checks, **0 mismatches** (≤0.06 rounding tol.) ✓ |
| `pitch_Hz` formula | `220 * 4^((T2M-10)/30)` vs stored, 3,024 records | **0 failures**, max err < 0.005 Hz ✓ |
| All 8 `_norm` fields | `clamp((raw-lo)/(hi-lo),0,1)` vs stored, 3,024 records | **0 failures**, max err < 0.00005 ✓ |
| CSV field counts | Python `csv` module | 3,025 × 29 and 253 × 19, uniform ✓ |
| CSV quoting behaviour | count quoted rows per region | monthly 1,008 (chittagong+sylhet), yearly 84 ✓ |
| Region row counts | `csv.DictReader` | 504/region monthly, 42/region yearly ✓ |

---

*Documentation generated 2026-11-09 from the three files in `Some Other Resource/`.*
