# NISAR validation sources per event

Compiled 2026-11-14 for the hackathon. Each section lists independent data and media that show **how far the ground moved** or **where the surface changed**, to check against the NISAR LOS, coherence, flood and burn layers. Event metadata comes from `site/events/<slug>/meta.json`; the leads came from `research/stories/<slug>.json`.

**Method and caveats**
- The configured `web_search` provider returned HTTP 402 throughout, and DuckDuckGo and Bing were unusable. Sources were found through the services' own APIs instead: Copernicus EMS dashboard API, HDX CKAN, USGS ComCat, ArcGIS REST, NASA CMR, Wikimedia Commons API, NGL and agency WordPress APIs. Every claim was checked on the source page or the downloaded file, never from a snippet. "Not found" means the relevant portal was checked; it does not mean the whole web was.
- **GNSS:** NGL stations come from `DataHoldings.txt`, filtered to each event's `grid.bounds_lonlat`. Co-seismic and co-eruptive steps are **my own** medians of 7 (or 10/30) daily IGS20 solutions before and after the event date. They are not published values, except where a published value is quoted alongside. Nevada Geodetic Laboratory (NGL), IGS20 daily `tenv3` series: `https://geodesy.unr.edu/gps_timeseries/IGS20/tenv3/IGS20/<ID>.tenv3`; station page `https://geodesy.unr.edu/NGLStationPages/stations/<ID>.sta`. Station holdings come from `https://geodesy.unr.edu/NGLStationPages/DataHoldings.txt` (downloaded 2026-11-14).
- **Openverse** (`api.openverse.org`, anonymous: page_size ≤ 20, 20 requests/min) was intermittently behind a Cloudflare challenge and returned 504s, so some queries did not complete. Its index also appears to lag: no hits for anything after about August 2026. Its 2026 hits were all Wikimedia Commons files, so geolocatability was checked with the Commons API: each file's `coordinates`, upload date ≥ event date, and the same keyword queries.
- **OPERA products** (NASA DIST-ALERT, DSWx, DISP-S1) were found by CMR granule search over each site and window. They are systematic cross-checks and are listed per event where they exist.
- Repo note: the stories cite `research/fires/aspen-acres.geojson` and `little-giant.geojson`, but **`research/fires/` does not exist** in the repo. The WFIGS queries in the fire sections are the authoritative replacement.
- Licences: news photos are link-only. Copernicus EMS products are free with attribution ("© European Union, Copernicus EMS"). US federal material is public domain. INGVvulcani is CC BY-ND 4.0, so show it unmodified. Others are as stated per item.


---

## kumamoto-quake

NISAR pair 2026-07-21 → 2026-08-14, ascending; frame bounds [130.398, 32.407, 131.048, 32.957]. USGS event: us6000tgb9.

### 1. Systematic damage / ground-failure datasets
- **Copernicus EMS: none.** The rapid-mapping API (`/backend/dashboard-api/public-activations-info/`) lists no Japan activation in Jul–Aug 2026 (EMSR904–916 cover other events). UNOSAT: its products page is JavaScript-only and could not be checked.
- **GSI 地理院地図 disaster layers** (layer list: https://maps.gsi.go.jp/layers_txt/layers_20260729kumamoto.txt):
  - **Post-event orthophotos** (XYZ PNG tiles): Yatsushiro 7/29 (`https://maps.gsi.go.jp/xyz/20260729kumamoto_yatsushiro_0729do/{z}/{x}/{y}.png`), Kumamoto 1–4 (7/29–8/3), and 県央 8/12. Use them to check rupture traces at sub-metre resolution.
  - **Slope-failure and deposit inventory** (斜面崩壊・堆積分布), as GeoJSON in "cocotile" form: the whole layer sits in one tile, `https://maps.gsi.go.jp/xyz/<id>/2/3/1.geojson`. The ids are `20260729kumamoto_syamenhoukai_dosekiryu_taiseki_yatsushiro`, `…syamenhouka_taiseki_kumamoto1`, and `…syamenhoukai_taiseki_kumamoto2/3/4/kumamotokeno`. About 66 polygons fall inside the frame, about 6 of them survey-area outlines. GSI mapped them from photos only, with no field check (layer note). The inventory is small, so expect few landslide coherence-loss patches.
  - **SAR displacement-boundary map** (変位境界, from ALOS-2 and ALOS-4): a boundary about 35 km long from 御船町高木 to 八代市平山新町. Cited page https://www.gsi.go.jp/uchusokuchi/uchusokuchi41008.html (2026-08-05) was unreachable. The figure is on Commons under **CC BY 4.0, 国土地理院**: https://commons.wikimedia.org/wiki/File:2026_Kumamoto_Earthquick_Ground_displacement_interpreted_from_SAR.png. It is the best independent trace to overlay on the NISAR step.
- **USGS ground-failure product** (us6000tgb9): these are models, not inventories. Landslide alert is orange, liquefaction alert red, and `rupture-warning: True`. GeoTIFFs: `https://earthquake.usgs.gov/product/ground-failure/6000tgb9/us/1787029788307/jessee_2018_model.tif`, `…/zhu_2017_general_model.tif`, plus `.kmz` and `.hdf5`.
- **USGS finite fault** `us6000tgb9_1`: 45 km NE-trending fault; max slip 2.4 m at about 5 km depth beneath Uki; 1.37 m at the shallowest point (en.wikipedia summary of the USGS model).

### 2. GNSS (GEONET) co-seismic offsets
**Source:** HERP evaluation 令和8年熊本地震の評価, https://www.static.jishin.go.jp/resource/monthly/2026/20260728_kumamoto_1.pdf
- GSI provisional Q5.1 rapid solution, p.12. Fixed station 上対馬 950456; reference window 7/21–7/27; comparison window 7/28 21:00–7/29 05:59.
- I paired the values to stations by their order in the extracted PDF text. Check against the p.12 map before use. The text fits TV Asahi's GSI quote (千丁 84 cm NE, 城南 40 cm N, 泉 17 cm S): https://news.tv-asahi.co.jp/news_society/articles/000522556.html

| station | horizontal | vertical |
|---|---|---|
| 940093 千丁 Senchō (Yatsushiro) | **86.6 cm NE** (HERP text: about 87 cm NE) | **−31.7 cm** |
| 021071 城南 Jōnan (Kumamoto-Minami) | 43.1 cm (N) | +9.6 cm |
| 960702 泉 Izumi (Yatsushiro) | 17.5 cm (S) | +3.4 cm |
| 960773 大矢野 | 12.6 cm | — |
| 021075 球磨 | 11.3 cm | — |
| 950465 熊本 | 10.0 cm | — |
| 960775 栖本 | 9.3 cm | — |
| 181225 矢部B | 7.6 cm | — |
| 950464 玉名 | 5.5 cm | — |
| 950468 芦北 | 4.8 cm | — |
| 021074 新和 | 4.4 cm | — |
| 960701 長陽 | 2.3 cm | — |
| 960717 東 | 1.7 cm | — |
| 960703 阿蘇 | 1.0 cm | — |
| 970834 出水 | 0.9 cm | — |
| 940096 阿久根 | 0.5 cm | — |

- GSI warns the 千丁 value may include local ground deformation.
- The PDF gives no station coordinates. Take them from the GEONET station list (terras.gsi.go.jp is reachable, but I did not pull it).
- 千丁 (NW side, on the Yatsushiro plain) and 泉 (SE hills) straddle the fault: a direct check on the sign and size of the NISAR step.
- **ALOS-2 InSAR (GSI), same PDF p.17.** Pair 2025-08-12 → 2026-07-28; ascending (北行), right-looking west (左(西)照射), incidence 48.3°, U-U 3 m mode. Result: **up to about 50 cm towards the satellite NW of the Hinagu fault, up to about 10 cm towards it on the SE side.** Same orbit direction as NISAR, so it is the closest available comparison (NISAR shows NW +10 to +22 cm, SE −5 to −25 cm; check NISAR's sign convention).

### 3. Field-measured displacement
**Source:** AIST/GSJ 第5報 (field survey 7/30–8/3), https://www.gsj.jp/hazards/earthquake/kumamoto2026/kumamoto2026-02.html. All offsets are right-lateral, measured with tape and compass. The page gives places, not lat/lon; the 第5報 Fig. 1 map has the points. Image use: AIST GSJ web material, link with credit.

| photo | place | measured offset | image |
|---|---|---|---|
| 1 | 御船町, paved road | 6 cm (white line) | kumamoto2026-07.png |
| 2 | 御船町, patched road | 15 cm | -08 |
| 3 | 熊本市南区城南町鰐瀬, paddy over the 鰐瀬 trench | 23 cm (畦) | -09 |
| 4 | 宇城市豊野町下郷, paddy→road | 43 cm; 39 cm NW-down | -10 |
| 5 | 宇城市豊野町 娑婆神峠, road | 98 cm | -11 |
| 7 | 氷川町大野, paddy S of 道の駅竜北 | 115 cm; 19 cm NW-down | -13 |
| 8 | 氷川町宮原, road | **184 cm** (maximum); W-down | -15 |
| 9 | 八代市岡町中, road→paddy | 120 cm; 16 cm E-down | -16 |
| 10 | 龍峯小学校 schoolyard (≈32.530, 130.664 from OSM) | 94 cm + mole track | -17 |
| 11 | 八代市上片町, near 八代JCT | **about 130 cm vertical** | -18 |
| 12 | 八代神社 (Myoken-gu) (≈32.500, 130.641) | 95 cm; 39 cm W-down | -19 |
| 13 | 八代市渡町, field | 25 cm; 17 cm NW-down | -20 |
| 14 | 八代市豊原上町, road | 17 cm; NE-down | -21 |

Image URLs: `https://www.gsj.jp/hazards/earthquake/kumamoto2026/images/kumamoto2026-NN.png`.

- **GSJ 第6報**, https://www.gsj.jp/hazards/earthquake/kumamoto2026/kumamoto2026-03.html (former trench sites):
  - 山出 trench (甲佐町白旗): 12 cm right-lateral, 2 cm NW-down.
  - 南部田 trench (宇城市小川町): open cracks, W/NW side down. 守山八幡宮, about 200 m SE: foundations lifted.
  - 川田町西 (八代市): en-echelon cracks, NW-down.
- **GSJ 第7報**, https://www.gsj.jp/hazards/earthquake/kumamoto2026/kumamoto2026-04.html: striations at 10 sites from 豊野町下郷 to 八代市渡町. They are nearly horizontal, plunging slightly NE (right-lateral with NW-down). No magnitudes.
- **Rupture caught on security camera** in a Yatsushiro paddy, about 1 m high and more than 20 m long (Yomiuri 2026-08-14). Surveyed later at **80 cm vertical, 1.05 m horizontal** (Mainichi 2026-10-03, https://mainichi.jp/articles/20261003/k00/00m/040/128000c). I read these via ja.wikipedia's citations and did not open the articles. Exact location not given.
- en.wikipedia: NHK imagery analysis found about 10 km of visible rupture between Hikawa and Yatsushiro.

### 4. Strongest media items (all Wikimedia Commons; none has a geotag, so locate them by caption and landmark)
1. **GSI SAR displacement-boundary map**, CC BY 4.0 (link in §1). Most useful item: a mapped trace.
2. **"A fault caused by the 2026 Kumamoto earthquake, located near Myoken Daiichi Bridge"**, CC BY-SA 4.0, Katorisi, 2026-08-29: https://commons.wikimedia.org/wiki/File:A_fault_caused_by_the_2026_Kumamoto_earthquake,_located_near_Myoken_Daiichi_Bridge._Yatsushiro_City,_Japan.jpg. Locatable to about 100 m (bridge at 32.502, 130.645).
3. **"A ground displacement at Yatsushiro Shrine (Myoken-gu)…"** (the file name says 2016, the description says 2026), CC BY-SA 4.0: "A fault-induced step runs across the shrine grounds." https://commons.wikimedia.org/wiki/File:A_ground_displacement_at_Yatsushiro_Shrine_(Myoken-gu)_caused_by_the_2016_Kumamoto_earthquake._Yatsushiro_City,_Japan.jpg. Pair it with GSJ photo 12 (95 cm / 39 cm). About 50 m.
4. **MLIT "20260730 Road Damage at Minemi Kyushu Expwy (Yatsushiro JCT – Yatsushiro-Minami IC)"**, CC BY 4.0: road-surface step at 妙見第一橋. Same spot as GSJ photo 11 (about 130 cm vertical).
5. **MLIT "20260730 Road Damage and Recovery at Hikawa Town"**, CC BY 4.0: 国道3号 段差 (step) at 氷川町. Locatable to about 1 km (Route 3 crossing the trace); near GSJ photo 8 (184 cm at 宮原).
6. **MLIT "20260730 Track Damage of Kagoshima Line (Matsubase – Ogawa)"**, CC BY 4.0: 線路変状 (track deformation). Locatable only to the 松橋–小川 section (a few km). It is where NISAR's step crosses Ogawa.
7. **"A ground fissure that appeared along the Tosaki no kawara…"**, CC BY-SA 4.0, Katorisi. Location is vague (Yatsushiro).
8. **GSI aerial photo, "area south of Yatsushiro Junction on the Minami-Kyushu Expressway… July 29, 2026"** (Attribution, 国土地理院): an overhead view of the rupture at the JCT.

Also seen: a Hinagu IC dashcam .webm (CC BY-SA, geotag 32.4259, 130.5640, shaking only) and MLIT Shinkansen rail-break photos (新八代–新水俣, mostly south of the frame).


### 2b. NGL GNSS stations (checked by the parent)
**NGL stations inside the frame with data across the event:** G071, G225, J093, J464, J465, J701, J702, J773. G072 and G169 ended in 2008 and 2018. All series run to 2026-10-24.

I computed the steps below myself: the median of 7 daily positions before 2026-07-28 against the median of the 7 after (G071 has only 5 after). They are not published values, and the post-event week includes some early afterslip. Units are cm.

| NGL ID (= GEONET) | lat, lon | dE | dN | dU | GSI value (HERP PDF) |
|---|---|---|---|---|---|
| J093 (940093 千丁) | 32.5464, 130.6456 | **+62.3** | **+61.7** | **−32.7** | 86.6 cm NE, −31.7 |
| G071 (021071 城南) | 32.7092, 130.7484 | +4.4 | +44.6 | +10.7 | 43.1 cm N, +9.6 |
| J702 (960702 泉) | 32.5767, 130.7949 | −5.6 | −17.0 | +2.9 | 17.5 cm S, +3.4 |
| J773 (960773 大矢野) | 32.5817, 130.4304 | +12.2 | +4.7 | −0.2 | 12.6 cm |
| J465 (950465 熊本) | 32.8421, 130.7648 | −1.0 | +10.6 | +0.4 | 10.0 cm |
| J464 (950464 玉名) | 32.9335, 130.5477 | −1.5 | +5.6 | −0.6 | 5.5 cm |
| J701 (960701 長陽) | 32.8707, 130.9962 | −2.4 | −0.7 | −0.3 | 2.3 cm |
| G225 | 32.6927, 130.9886 | −7.6 | −2.2 | +1.8 | — |

- Just outside the frame: G075 (球磨) +1.9 E / −11.9 N (GSI 11.3 cm); G265 (installed 2026-07-08) +1.7 / −8.8; J700 −0.4 / +3.3; J466 −4.1 / −1.2.
- **NGL and GSI agree to within about 1–2 cm.** The ID mapping (NGL J/G + last three digits of the GEONET code) is inferred from that agreement and the positions.
- **J093 (NW of the fault, about 88 cm NE and 33 cm down) against J702 (SE, about 18 cm S) is the best point check of the NISAR step.** To compare, project E/N/U onto the GUNW look vector.

### 5. Openverse / Commons CC image hits
- **Openverse:**
  - "Kumamoto earthquake 2026": 21 hits, all Wikimedia Commons (mostly MLIT/JSDF/police, CC BY 4.0: rescue, relief and road damage).
  - "Kumamoto fault": 3 hits, 1 relevant (the Futagawa–Hinagu fault-zone map, CC BY-SA 4.0).
- **Commons API:** 61 files uploaded since the event match "Kumamoto earthquake 2026 / Yatsushiro earthquake / Hinagu fault".
  - Only **1 is geotagged**, and it is a CC0 intensity map.
  - The displacement photos (Katorisi CC BY-SA 4.0 set of 2026-08-29; MLIT CC BY 4.0 road and rail steps) carry no coordinates. They can be placed by caption landmark to about 50–1,000 m (see §4).

**Verdict: strong.** Dense measured field offsets (6–184 cm) along the trace, the GEONET 千丁 −31.7 cm vertical / 86.6 cm NE vs 泉 pair across the fault, and an ascending ALOS-2 interferogram of the same event.


---

## panama-quake

USGS event **us6000u18k**: Mww 7.7, 2026-10-09 17:56 UTC, epicentre −80.7566, 7.6069. That puts it about 1 km inside the west edge of our grid, which is −80.763 W to −80.037 E and 7.238 S to 7.963 N.

### 1. Systematic damage and ground-failure datasets

- **USGS finite-fault model (v3)** with its InSAR inputs: https://earthquake.usgs.gov/product/finite-fault/us6000u18k_1/us/1792710177789/
  - `resampled_interferograms.zip` (text: lon, lat, LOS in m, look unit vector sx/sy/sz; **positive = away from the satellite**; no ramp removed). It contains:
    - `nisar-rngoff-p040-20261002-20261014_resampled_1000m.txt`: **NISAR range offsets, same track and pair as our granule**. 3,260 points, 2,488 of them inside our grid. In-grid LOS runs from **−6.35 to +6.53 m**.
    - `nisar-rngoff-p141-20260927-20261009_resampled_1000m.txt`: a second NISAR track. 1,375 points, 441 in the grid, LOS −4.06 to +1.10 m.
  - Nearest p040 values, all from points within 2 km, in the USGS sign convention:

    | Place | p040 LOS |
    |---|---|
    | Búcaro | −0.87 m |
    | 7.42°N on Búcaro's longitude | −2.12 m |
    | Tonosí | −2.21 m |
    | Isla Cañas | −1.96 m |
    | El Cacao | −2.03 m |
    | Macaracas | −0.87 m |

    The look vector is about (0.58, −0.15, −0.80).
  - **Check before comparing.** Our story file reports +75–82 cm at 7.42°N versus +17 cm at Búcaro, and a motion range of 152 cm. The USGS offsets are about 2× larger with the opposite sign. Check the sign convention, the reference point and possible unwrapping cycle slips before treating this as a mismatch.
  - `surface_deformation.disp`: modelled E/N/U on a coarse grid of about 0.19°. The largest vertical value is **U −0.92 m at −80.304, 7.309**, at the coast near Búcaro and Isla Cañas, which fits the reported subsidence. Near-fault horizontals reach several metres. `FFM.geojson` holds the fault geometry.
- **USGS ground-failure product (v14)**: model predictions, not an inventory. Landslide alert is orange (aggregate hazard 79 km²); liquefaction alert is orange (980 km², about 51,000 people exposed). Files (GeoTIFF/KMZ/HDF5) are at https://earthquake.usgs.gov/product/ground-failure/6000u18k/us/1793614165577/, e.g. `jessee_2018_model.tif` (landslides) and `zhu_2017_general_model.tif` (liquefaction).
- **Copernicus EMS EMSR934**, "Earthquake in Los Santos, Panama", activated 2026-10-09 23:19. Grading products are GRA; most AOIs were "not produced" because of remote-sensing limitations. API record: https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=EMSR934. The all-products zip came back empty, but the per-AOI zips work. Vector damage points are downloadable as SHP and GeoJSON:
  - **AOI05 Tonosí**, GRA from Pléiades Neo, 2026-10-16. Zip: https://rapidmapping.emergency.copernicus.eu/backend/EMSR934/AOI05/GRA_PRODUCT/EMSR934_AOI05_GRA_PRODUCT_v1.zip
    - GeoJSON: https://rapidmapping-viewer.s3.eu-west-1.amazonaws.com/EMSR934/AOI05/GRA_PRODUCT/EMSR934_AOI05_GRA_PRODUCT_builtUpP_v1.json
    - Only **3 of 958 buildings** are affected: Damaged at (−80.44399, 7.40065) and (−80.43579, 7.40518); Possibly damaged at (−80.43566, 7.41057).
    - All 47 road segments are graded "No visible damage".
  - **AOI08 Llano de Piedras**, GRA from Pléiades Neo, 2026-10-17, plus a monitoring update on 2026-10-18. Zip: https://rapidmapping.emergency.copernicus.eu/backend/EMSR934/AOI08/GRA_MONIT01/EMSR934_AOI08_GRA_MONIT01_v1.zip
    - 7 of 793 buildings are affected, clustered at −80.5597, 7.6716–7.6721 (3 Destroyed, 2 Damaged) plus two Possibly damaged points and one more at (−80.5702, 7.6751).
  - In the grid but "not produced": AOI01 Las Minas, AOI04 Macaracas, and AOI02 Chitré on the north edge.
  - Outside the grid: AOI03 Santiago, AOI06 Penonomé, AOI07 Soná. A Charter activation (1054) exists, plus a StoryMap: https://storymaps.arcgis.com/stories/45486c6299274028946e658405515e39. HDX mirror: `pan-earthquake-emsr934`.
- **UNOSAT EQ20261011PAN** (CC BY-SA). Page: https://data.humdata.org/dataset/unosat-live-web-map-m-7-7-earthquake-in-pitaloza-arriba-panama-9-october-2026-17-56-06-utc
  - SHP: https://unosat.org/static/unosat_filesystem/4270/EQ20261011PAN_SHP.zip. It holds 24 Pléiades building points from 2026-10-14 in "South Quebro": 5 Damage and 19 Possible Damage, none field-validated.
  - **All of them sit at −80.81 to −80.90, just west of our grid**, so they are useful only as a near-edge contrast.
- **Universidad de Panamá, Instituto de Geociencias (IGC) landslide inventory** (Sentinel-2 L2A):
  - 17 Oct: 2,351 landslides (https://www.laestrella.com.pa/panama/nacional/tras-el-terremoto-identifican-2351-deslizamientos-mediante-imagenes-satelitales-FJ26581114).
  - 28 Oct: **9,553 landslides, 4,822 of them in the epicentral zone** (https://uphacialaluz.com/2026/10/29/instituto-de-geociencias-de-la-universidad-de-panama-identifica-9553-deslizamientos-asociados-al-terremoto-de-azuero/).
  - The same 28 Oct article says IGC is also using radar to map surface deformation and the rupture trace.
  - Published only as a map image. **I found no downloadable vector file**, so it is worth asking IGC for the points: they fit our decorrelated, landslide-scarred band directly.
- SINAPROC: press totals only. I found no geodata.

### 2. GNSS

- I found no published co-seismic GNSS offsets from IGN Tommy Guardia CORS, SIRGAS or IGC.
- In interviews, Guerra Araúz calls for a denser sensor network (Infobae, 30 Oct).
- The USGS finite-fault inversion used InSAR and seismic data only; it lists no GNSS.

### 3. Field-measured displacement

All figures come from Isaac Guerra Araúz (Senacyt doctoral fellow, Western Ontario) and are preliminary. Sources: La Estrella (https://www.laestrella.com.pa/panama/nacional/terremoto-hundio-30-centimetros-de-isla-canas-de-acuerdo-a-estudios-preliminares-MB26639225 and https://www.laestrella.com.pa/vida-y-cultura/ciencia/cientifico-chiricano-estudia-las-rupturas-que-dejo-el-sismo-AH26746251), Infobae (https://www.infobae.com/panama/2026/10/22/hasta-120-metros-se-desplazo-el-suelo-durante-el-terremoto-de-75-que-sacudio-panama/).

| Place | Lat, lon | Measured | Notes |
|---|---|---|---|
| Búcaro (Tonosí) | about 7.343, −80.352 (GeoNames village point; the rupture crossing is not given) | **1–1.2 m horizontal, about 1 m vertical** surface rupture | Text only, no photo of the measurement |
| Isla Cañas | about 7.404, −80.326 (island centroid) | **15–30 cm subsidence**, plus seabed deformation | Island split in two by a channel; es.wiki says about 4 m deep |
| La Pitaloza (Herrera) | 7.6424, −80.6688 (OSM village; inside the grid) | Surface rupture identified; no value published | |
| Mariato (Veraguas) | about −80.83 to −80.99 (outside the grid, west) | Surface rupture identified; no value published | |

- Guerra Araúz estimates a rupture length of 110–120 km. IGC estimates about 90 km, or 73.6 km from Wells and Coppersmith.
- Infobae also reports fissures in Tonosí, Soná and Mariato, and **reefs exposed at high tide**. The article itself says those coastal-uplift claims are **unverified**.
- A full report and paper are promised but not yet published.

### 4. Media that shows displacement

1. **La Prensa, 29 Oct**, "La grieta de Búcaro" (https://www.prensa.com/sociedad/secuelas-del-terremoto-la-grieta-de-bucaro-el-dilema-de-isla-canas-y-el-resurgir-de-la-colorada/). Alexander Arosemena photos of Búcaro; a resident describes the road raised 2–3 m. © La Prensa, link only. Located to the village, about 0.5–1 km.
2. **La Prensa Instagram reel** on Isla Cañas flooding after the split (https://www.instagram.com/reel/DfC1HvUCdpF/). © La Prensa, link only. Located to the island.
3. **Telemetro**, El Pital access-road collapse, 70 m long and 4 m deep, on the Búcaro road (https://www.telemetro.com/nacionales/carretera-bucaro-los-santos-colapsa-y-pone-riesgo-conductores-n6094962). Lead from the existing story file; not re-fetched here. © Telemetro, link only.
4. **EMSR934 AOI08 Pléiades ortho COG**, `EMSR934/AOI08/GRA_PRODUCT/..._ORTHO_cog.tif` via the EMS viewer. Copernicus EMS licence (free with attribution). Exactly georeferenced. Shows destroyed buildings rather than an offset.
- Wikimedia Commons, Category:2026_Panama_earthquake (about 70 files): all show building damage or relief work (Penonomé, Soná, El Cacao, Tonosí). **None shows a ground offset.**


### 2b. NGL GNSS stations (checked by the parent)
- **NGL stations inside the frame:**
  - **ACHO** (7.4147, −80.1731), data to 2026-10-03
  - **AZUE** (7.9557, −80.4325), data to 2026-08-31
  - **AZUT** (7.4048, −80.4355), data to 2026-03-12
- **None has data after the 2026-10-09 earthquake yet** (latency or station loss), so there are no co-seismic offsets. Re-check `DataHoldings.txt` later: ACHO, 25 km E of Búcaro, would be a direct check.

### 5. Openverse / Commons CC image hits
- **Openverse:** "Panama earthquake 2026" gave **0 hits**. The index seems to lag; nothing after about August 2026 turns up.
- **Commons API:** 61 files uploaded since the event (SOUTHCOM relief photos, PD; USGS ShakeMaps; El Cacao damage photos, CC BY 4.0). **0 are geotagged**, and none shows a ground offset.

**Verdict: strong.** USGS NISAR p040 offsets on our exact pair, EMS vector points, field-measured 1 m offsets at Búcaro and 15–30 cm subsidence at Isla Cañas, and a 9.5k-landslide inventory (map only).


---

## venezuela-quake

NISAR pair 2026-06-13 → 2026-06-25, ascending; frame bounds [−68.838, 10.072, −68.106, 10.797]. USGS events: us6000t7zc (M7.2) and us6000t7zp (M7.5).

### 1. Systematic damage / ground-failure datasets
- **Copernicus EMS EMSR884 "Earthquake in Venezuela"** (activated 2026-06-25; GLIDE EQ-2026-000093-VEN; Charter 1036). Whole package: https://rapidmapping.emergency.copernicus.eu/backend/EMSR884/EMSR884_products.zip. Activation JSON: `…/backend/dashboard-api/public-activations/?code=EMSR884`.
  - **AOI00 GRM (Ground Movement), v2.** **A Sentinel-1 DInSAR LOS-displacement product.**
    - Inputs: pre-event 18/06/2026 22:42 and 22:50 UTC; post-event 24/06 22:49 and 25/06 22:42 UTC; 20 m resolution.
    - Contents: 615 polygons in 9 classes (`value` field, metres, from −0.5–−0.2 up to >0.5), a float32 GeoTIFF (12366×8097), GPKG, SHP and a 1:500k map PDF.
    - Download: https://rapidmapping.emergency.copernicus.eu/backend/EMSR884/AOI00/GRM_PRODUCT/EMSR884_AOI00_GRM_PRODUCT_v2.zip
    - The AOI covers the whole NISAR frame. **Direct InSAR comparison.**
    - I sampled the polygons myself (point-in-polygon):

    | point | EMS GRM LOS class |
    |---|---|
    | Morón / Las Colinas | 0.2–0.5 m |
    | Urama | 0.2–0.5 m |
    | 10.48°N, 68.30°W and 68.40°W | 0.1–0.2 m |
    | 10.55°N, 68.30°W | −0.1 to −0.05 m |
    | 10.55°N, 68.40°W | −0.2 to −0.1 m |
    | Boca de Aroa | −0.2 to −0.1 m |
    | Tucacas | −0.1 to −0.05 m |
    | Farriar | 0.05–0.1 m |
    | San Felipe | 0.05–0.1 m |

    - **The same E-W step at about 10.5°N that NISAR shows, of similar size (about 30 cm), but with the opposite sign** (EMS: south positive, north negative; NISAR: north +, south −). Most likely a sign-convention difference. The EMS map labels "Toward/Away from the satellite", but the text extraction lost which colour goes with which. Check the rendered PDF legend before claiming agreement.
  - **AOI06 Morón GRA (damage grading)**, inside the frame:
    - v1, 2026-06-26: 129 building-block polygons (2 destroyed, 34 damaged, 93 possibly damaged). https://rapidmapping.emergency.copernicus.eu/backend/EMSR884/AOI06/GRA_PRODUCT/EMSR884_AOI06_GRA_PRODUCT_v1.zip
    - MONIT01 v2: **96 building points** (8 destroyed, 39 damaged, 49 possibly damaged; photo-interpreted). https://rapidmapping.emergency.copernicus.eu/backend/EMSR884/AOI06/GRA_MONIT01/EMSR884_AOI06_GRA_MONIT01_v2.zip
    - Bounds −68.25 to −68.18, 10.47–10.52. They sit right on the NISAR step.
  - **AOI08 San Felipe GRA** (AOI −68.86 to −68.42, 10.24–10.62): v1 has 43 blocks (8 damaged, 35 possibly damaged). https://rapidmapping.emergency.copernicus.eu/backend/EMSR884/AOI08/GRA_PRODUCT/EMSR884_AOI08_GRA_PRODUCT_v1.zip. MONIT01 v2 is at the same path with GRA_MONIT01.
  - Puerto Cabello (AOI07) and Valencia (AOI09) were "not produced" because of remote-sensing limitations. Other AOIs (Caracas, Caraballeda, Santa Cruz) are outside the frame.
  - Formats: SHP, GeoJSON, GPKG, SLD/LYR, PDF maps. Licence: Copernicus EMS (free, credit "© European Union, Copernicus EMS").
- **Charter 1036**, https://disasterscharter.org/activations/earthquake-in-venezuela-activation-1036-: AI-generated, human-validated building damage and OSM footprints, but all for La Guaira, outside the frame.
- **USGS ground-failure models** (not inventories):
  - us6000t7zc (M7.2): landslide and liquefaction alerts orange, `rupture-warning True`. `https://earthquake.usgs.gov/product/ground-failure/6000t7zc/us/1783206299678/zhu_2017_general_model.tif`
  - us6000t7zp (M7.5): both alerts red. `…/6000t7zp/us/1789147457690/…`
- **USGS data release, Hanagan et al. 2026**, "Remote Observations of Surface Deformation…", https://doi.org/10.5066/P13QPYJX (ScienceBase item 6a4402c81ba49b97f88a8889). Optical sub-pixel correlation, N-S and E-W components. ScienceBase was blocked (Cloudflare), so I did not see the files myself. Per GEER, it covers only Catia La Mar, Maiquetía, Caraballeda and Naiguatá, all outside the frame.
- **FUNVISIS and UNOSAT:** sites are JavaScript-only or empty to the fetcher; no product verified.

### 2. GNSS
- No national GNSS offsets were found inside the frame. REMOS and SIRGAS were not reachable or not found.
- GEER-087 ch. 8 (citing SIGGMA, Suárez Acosta & Arenas Bermúdez 2026-07-13, "Preliminary GNSS+DInSAR Evidence…"): **CCS1 (UCV, Caracas): 46.3 cm W, 0.7 cm S, +3 cm up**; regional westward motion about 48.2 cm. Caracas is about 150 km east of the frame.
- The USGS finite fault us6000t7zp (v3, 2026-07-27) uses GNSS and InSAR and plots observed vs synthetic GNSS vectors (GEER Fig. 5-11). The station list was not extracted.

### 3. Field-measured displacement in or near the frame
**Source:** GEER-087 (doi:10.18118/G6S95Q), https://geerassociation.org/?view=geerreports&id=117. English PDF: https://geerassociation.org/components/com_geer_reports/geerfiles/GEER%20report%20on%20June%2024%202026%20Venezuela%20Earthquake%2004.pdf. Licence: report, link only.

- GEER: "There are no other surface ruptures mapped in the field by our teams", other than Maiquetía (outside the frame).
- **Pueblo Farriar, Yaracuy (10.465698, −68.561734):** river-parallel fissure about 380 m long, at most 3 m from the channel; bank spreading, not offset. Photo by R. Mata, E. Núñez et al., 12 Jul 2026 (Figs. 9-17, 11-16).
- **Veroes municipality (epicentral area):** deep, metre-scale fissures in alluvial fields, from TikTok frames (Fig. 9-18). "Exact locations not yet surveyed."
- **Boca de Aroa:** sand ejecta, settlement of light structures, eyewitness account of ejecta during shaking (StEER media repository, DesignSafe PRJ-6380). Not ground-truthed.
- **Morón–Tucacas highway bridges (ch. 13):** "approximately 10 cm of lateral displacement associated with landsliding and approximately 6 cm of vertical displacement", down to one lane. Bridges not individually located. The highway crosses the NISAR step, so this is worth pinning down.
- Outside the frame (La Guaira corridor): many measured points, e.g. Caraballeda crack 160 mm (10.619065, −66.850753) and Terminal Catia La Mar slabs about 270 mm (10.600856, −67.040550). Not usable for this frame.
- **Regional InSAR references:**
  - ESA, https://www.esa.int/media/sentinel-1-shows-ground-displacement-after-venezuela-earthquakes: Sentinel-1 18 → 25 June, about 30 cm LOS, extending to Puerto Cabello.
  - INGV, https://ingvterremoti.com/2026/06/26/sorgente-estesa-della-sequenza-sismica-in-venezuela-24-giugno-2026/: InSAR source model with strike 264°, dip 82°, rake 168°, about 180 km long, peak slip about 3.6 m at 11.1 km, Mw 7.6.

### 4. Media items (none openly licensed in the frame)
1. EMS GRM map PDF, AOI00 (inside the GRM zip, `Maps/EMSR884_AOI00_GRM_PRODUCT_500000_map_v2.pdf`). Copernicus EMS licence; georeferenced.
2. EMS Morón grading maps (AOI06 zips, `Maps/`). Georeferenced.
3. GEER Fig. 9-17 / 11-16, Farriar fissure. Report, link only; exact coordinates given.
4. GEER Fig. 9-18, Veroes fissures. Social-media frames (@edgarjaviercast42, @notiyaradigital); not located.
5. StEER Boca de Aroa video (DesignSafe PRJ-6380). Geolocated by StEER; not retrieved.

A Commons search turned up no open earthquake photos for Morón, Tucacas, Yaracuy or Falcón.


### 2b. NGL GNSS stations (checked by the parent)
- **No NGL station inside the frame.**
- The nearest is **BARQ** (Barquisimeto, 10.0791, −69.2904), about 50 km west of the frame edge. It has a data gap from before mid-May to 2026-07-31, so **no co-seismic estimate is possible**.

### 5. Openverse / Commons CC image hits
- **Openverse:** "Venezuela earthquake 2026" gave 30 hits, all Commons. Most are Umbra SAR scenes ("Venezuela Earthquake Support … UMBRA-07/09/10", CC BY 4.0, 26–30 Jun; their footprint inside the frame is not checked) and relief photos.
- **Commons API:** 99 files uploaded since the event match "Venezuela earthquake 2026 / Yaracuy / Tucacas". **0 are geotagged.**
- I found no open photo of ground offsets in the frame.

**Verdict: strong for InSAR cross-check, partial for ground truth.** Copernicus EMS has an independent Sentinel-1 LOS-displacement layer covering the whole frame, and it shows the same step at 10.5°N (sign convention unresolved), plus Morón building-damage points on the step. Field-measured offsets inside the frame are almost absent: only Farriar's fissure, and the bridge figures of about 10 cm lateral / 6 cm vertical with no locations.


---

## mexico-city-subsidence

Metadata: grid [−99.369, 19.204, −98.892, 19.656]. NISAR cumulative LOS 2025-10-30 → 2026-10-13. I researched this section myself; the sixth subagent could not be spawned. Web search was down (HTTP 402), so sources came from the Commons, Crossref, CMR and NGL APIs.

### 1. Systematic datasets
- **NASA/JPL PIA26709, "US-Indian Spacecraft Captures Mexico City Subsidence"** (public domain): https://commons.wikimedia.org/wiki/File:US-Indian_Spacecraft_Captures_Mexico_City_Subsidence_(PIA26709).jpg (plus figA, unlabelled and extending further south).
  - It is NISAR's own published subsidence map, Oct 25 2025 → Jan 17 2026.
  - Dark blue means subsiding **more than 2 cm/month**. NASA says yellow and red are "likely residual noise".
  - The JPL photojournal URL now redirects to the new science.nasa.gov site; the Commons copy carries the full caption.
  - Use: a qualitative check that our pattern matches the mission's own product.
- **OPERA DISP-S1** (NASA/JPL Sentinel-1 displacement time series, NetCDF, ASF DAAC; CMR `short_name=OPERA_L3_DISP-S1_V1`) **covers Mexico City**. Frames:

  | frame | granules | latest secondary date |
  |---|---|---|
  | F10860 | 419 | 2026-03-21 |
  | F01088 | 419 | 2026-03-25 |
  | F38246 | 359 | 2026-02-26 |
  | F20688 | 404 | 2026-02-16 |

  - Example: `OPERA_L3_DISP-S1_IW_F10860_VV_20251209T123416Z_20260321T123311Z_v1.0_20260817T212042Z` (download via `https://cumulus.asf.earthdatacloud.nasa.gov/OPERA/OPERA_L3_DISP-S1_V1/<granule>/<granule>.nc`; needs an Earthdata login).
  - It overlaps the first ~5 months of the NISAR window. **This is the best independent, systematic, downloadable displacement dataset for any of the 12 events.**
- **CDMX open-data portal** (datos.cdmx.gob.mx CKAN API) timed out. The Atlas de Riesgos subsidence and crack (grietas) layers were **not verified**.
- No Copernicus EMS or UNOSAT products (not an emergency).

### 2. GNSS
- **NGL MMX1** (19.4317, −99.0684, beside the AICM airport on the old Texcoco lakebed; data 2008-04 → 2026-10-24):
  - **MIDAS vertical velocity −265.1 mm/yr** (2008.32–2024.65; `https://geodesy.unr.edu/velocities/midas.IGS.txt`); E −7.0, N +5.8 mm/yr.
  - My linear fit over the NISAR window (2025-10-30 → 2026-10-13, 315 daily solutions): **U −268 mm/yr**, E −9.9, N −4.7. The first-week vs last-week median difference is −24.5 cm.
  - **Expected NISAR LOS at MMX1 ≈ −26.8 cm × cos(incidence) over the window.** Our grid reads about −30 to −34 cm near Neza and the airport, so check this pixel directly.
- **NGL ICMX** (19.4056, −99.1709, Roma/Condesa): MIDAS U **−20.7 mm/yr** (2017.6–2021.4). Data end 2026-01-10, so it covers only the first ~2.5 months of the window.
- **Other in-box NGL stations** all ended before the window (no use): FDMC, IGCU, LPIG, MRR1, MXAS, MXAZ, MXMX, MXTM, SSNX, TNGF, UFXN, UIGF, UJAL, UNIP, UNVA, UTAC, UTIC, UTUL.
  - UTUL (19.2558, −99.0163, Tulyehualco) and MXTM (19.4844, −98.9785) ran to 2020 and 2019; their old series could give historical rates.
- **Stable references outside the box:** TNAL (19.1187, −98.6552), MIDAS U **+2.4 mm/yr**, data to 2026-10-03; TOL2 (Toluca), to 2026-07-18.

### 3. Field-measured
- **Chaussard et al. 2021**, JGR Solid Earth, doi:10.1029/2020JB020648, "Over a Century of Sinking in Mexico City…". Read on Crossref: the abstract, verified.
  - It combines 115 years of leveling, 24 years of InSAR and 14 years of GPS.
  - Subsidence **reaches 50 cm/yr** and has been "mostly constant since at least 1950". It is almost fully irreversible, with no significant elastic component.
  - The rate correlates with the thickness of the upper aquitard.
  - Use: our −45 cm peak (Valle de Chalco/Tláhuac) is in the published range.
- **Ángel de la Independencia** (19.4270, −99.1677): **14 steps added since 1910** as the ground around it sank. Stated in the NASA PIA26709 caption; verified on the Commons file page.
- I did not find, on a fetched page, any geolocated benchmark or protruding-wellhead measurements for 2025–26.

### 4. Strongest media
1. **NASA PIA26709** NISAR subsidence map (PD). Georeferenced by its landmarks (airport, Lago Nabor Carrillo, Chalco, Ángel); can be overlaid.
2. **Ángel de la Independencia base**: existing story item mexico-05 (Commons CC BY-SA 3.0, photo GPS within ~50 m); also File:BaseAngelInd.JPG (CC BY-SA 3.0).
3. **Templo de la Santísima Trinidad sunk below street level**: mexico-03 (Commons CC BY-SA 4.0, 1986; modern photo GPS 19.433164, −99.126650). Flickr "Templo de la Santísima Trinidad being propped up by a crane" (CC BY-NC-SA 2.0; found via Openverse; geotag not checked).
4. **Catedral Metropolitana uneven settlement**: mexico-04 (Commons CC BY-SA 4.0, camera GPS).
5. **"Muestra del hundimiento de la Ciudad de México.jpeg"**: Commons CC BY-SA 3.0, 2006, Casa de los Camilos / Calle San Jerónimo. Building-level location from its category; the file itself is not geotagged.
6. **Tláhuac–Valle de Chalco crack**: mexico-01 (Milenio 2021, news, link only, ±300 m).
7. **Flickr "2018 - Mexico City - Sinking City" 1–2** (CC BY-NC-SA 2.0, found via Openverse): content and location not checked.

### 5. Openverse / Commons
- **Openverse:** "Mexico City subsidence" gave 14 hits:
  - 11 Flickr (mostly CC BY-NC-SA; geotags would need the Flickr API, not checked)
  - 3 Commons 1986 photos (already in the story)
- **Commons API:** 2 relevant files since the window start (PIA26709 and figA). The 9 geotagged in-box uploads since 2025-10-30 are airport and street scenes, not subsidence.

**Verdict: strong.** OPERA DISP-S1 overlaps the window, GNSS MMX1 gives −26.5 cm/yr to compare with a single pixel, NASA's own NISAR map exists, and there are published rates up to 50 cm/yr.


---

## etna-eruption

NISAR pair 2026-07-23 → 2026-08-16 (04:08 UTC). The pair covers the 30 Jul–2 Aug flow and the 7–16 Aug flow field. It does not cover the 16–19 Aug advance to ~1,315 m or the 18 Aug vent at 3,060 m.

### 1. Systematic datasets
- **Copernicus EMS: no activation.** I listed the full public activation feed (`https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=100`) back to June 2026. It has no Etna or Italy volcanic activation; the only 2026 volcanic activation is EMSR912 Guatemala. No UNOSAT product was found.
- **INGV-OE lava-field maps (PDF figures only; no shapefile or KML found):**
  - Weekly bulletin of 18 Aug 2026, **Fig. 3.1**: "Mappa del campo lavico aggiornata al 17 agosto 2026, elaborata integrando rilievi UAS, immagini satellitari Sentinel-2 e osservazioni di terreno". This is the closest map to the NISAR post date. PDF: `https://www.ct.ingv.it/index.php/monitoraggio-e-sorveglianza/prodotti-del-monitoraggio/bollettini-settimanali-multidisciplinari/1156-bollettino-Settimanale-sul-monitoraggio-vulcanico-geochimico-e-sismico-del-vulcano-Etna-del-2026-08-18/file`
  - Bulletin of 25 Aug 2026, **Fig. 3.1**: lava-field map updated to 20 Aug (UAS plus field observations). This is the final extent, which includes the post-NISAR advance. PDF: `.../1158-bollettino-Settimanale-sul-monitoraggio-vulcanico-geochimico-e-sismico-del-vulcano-Etna-del-2026-08-25/file`
  - Bulletin of 11 Aug 2026, **Fig. 3.1**: drone shaded relief with vents and arrows for activity since 7/10 Aug. PDF: `.../1154-...-Etna-del-2026-08-11/file`
  - Bulletin of 4 Aug 2026, **Fig. 3.1**: drone shaded relief (30 Jul–2 Aug episode). PDF: `.../1152-...-Etna-del-2026-08-04/file`
  - Bulletin index: `https://www.ct.ingv.it/index.php/monitoraggio-e-sorveglianza/prodotti-del-monitoraggio/bollettini-settimanali-multidisciplinari`. The licence is not stated in the pages I could read.
  - To use these maps you have to georeference the PDF figure by hand. Each has 100 m contours and named landmarks (Monte Simone, Rocca Capra, Rocca delle Palombe), so that is feasible.
- **MOUNTS (Sentinel-1/2/5P monitoring), Etna:** `http://www.mounts-project.com/timeseries/211060`. The time-series page lists Sentinel-1 descending acquisitions on **2026-08-01, 08-13 and 08-25 (05:04 UTC)** with deformation and coherence products. Its own description says the coherence product "can be used to detect … emplacement of lava flows". The product images load dynamically and I could not extract them. You would need to view and save them in a browser. The 01→13 Aug S1 pair is an independent C-band check on the NISAR coherence loss.

### 2. GNSS / tilt (INGV-OE bulletins, all qualitative or in µrad; **no cm/mm values published**)
- 4 Aug bulletin (30 Jul–2 Aug): GNSS "non ha mostrato evidenti variazioni". Tilt at Cratere del Piano (ECP): "variazioni di circa 2.5 microradianti alle due componenti".
- 11 Aug bulletin (3–9 Aug): GNSS high-rate "non ha mostrato evidenti variazioni" (EMAL–EMGL baseline shown). Tilt ECP: "variazione massima, pari a circa 6 microradianti".
- 18 Aug bulletin: "La rete GNSS mostra, a partire da giorno 8 agosto, una chiara tendenza alla deflazione, visibile anche alle stazioni poste alle quote intermedie". Station ESLN north component is plotted (Fig. 6.1). No magnitude is given.
- 25 Aug bulletin: no further GNSS change beyond uncertainty after the 8 Aug deflation (EINT north component plotted). Tilt ECP: deflation of "circa 3 microradianti" on 16–17 Aug, then <1.0 µrad slight inflation.
- What this means for NISAR: deflation of the edifice is documented from 8 Aug, but its size is not stated. Expect a broad summit-centred deflation signal in the 23 Jul–16 Aug pair. Its size has to come from NGL GNSS (the parent is handling that), not from INGV text.

### 3. Field-measured values
| What | Value | Where / when | Source |
|---|---|---|---|
| 30 Jul–2 Aug flow | length ~2.9 km, area 1.5×10⁵ m², mean thickness ~2 m, volume 5×10⁵ m³ (±40%) | vent 2,700 m Valle del Leone; fronts 1,990 m (N arm) and 1,950 m (S arm) at Monte Simone | 4 Aug bulletin pp. 5–6 |
| same, from satellite | ~0.23 km², front ~1,930 m (Sentinel-2 MSI); 0.58 ± 0.29 Mm³ | 2 Aug | 4 Aug bulletin p. 17 |
| 7–9 Aug per-vent | 3,200 m vent: 8.12E+04 m³, max length 800 m. 2,750 m vent: 2.81E+06 m³, 4,470 m, 7.01E+05 m². 2,360 m vent: 6.99E+04 m³, 3,220 m, 2.33E+04 m². 1,900 m vent: 1.54E+06 m³, 2,000 m, 5.13E+05 m² (volume error 40%) | Valle del Leone / Valle del Bove | 11 Aug bulletin p. 7 |
| fronts | 1,370 m past Rocca delle Palombe (10–11 Aug 17:00 UTC); 1,360 m at Rocca Capra (11 Aug 16:00 UTC) | | 11 Aug bulletin p. 7 |
| Sentinel-2, 11 Aug | front ~1,370 m, field area ~1.5 km² | | 18 Aug bulletin |
| 7–17 Aug total | area ~1.7×10⁶ m², volume 5.6–7.6×10⁶ m³; satellite 6.2 ± 3.1 Mm³ (18 Aug) | front 1,330 m near Rocca Capra (18 Aug) | 18 Aug bulletin |
| final field | max planimetric length ~5.5 km (2,750 m vent → 1,309 m fronts below Rocca Capra), area 2×10⁶ m², volume 8–11×10⁶ m³; 18 Aug flow 0.6 km, front 2,820 m | to ~20–21 Aug | 25 Aug bulletin |
| blog summary | 26 Jun flow 1.2 km / 0.26×10⁶ m³; 30 Jul flow 2.9 km / 0.5×10⁶ m³; ≥9 vents; 13 Aug fronts ~1,340 m around Rocca Capra; 19 Aug 1,315 m | | https://ingvvulcani.com/2026/08/22/etna-la-calda-estate-del-2026/ (CC BY-ND 4.0 per existing story) |

No lat/lon is published for any front. Positions are given by elevation and landmark only. Rocca Capra (OSM 37.74156, 15.06799) is the best anchor. With a DEM, the 1,309–1,370 m contour inside the Valle del Bove floor pins the distal edge to within a few hundred metres.

### 4. Strongest media
1. INGV Fig. 8, lava front at the base of Rocca Capra, 13 Aug: `https://ingvvulcani.com/wp-content/uploads/2026/08/08-Figure-08.jpg` (page above). CC BY-ND 4.0. Locatable to ~100–300 m (named ridge, ~1,340 m).
2. INGV Fig. 7, pyroclastic flow at the new vent near Monte Rittmann (2,300–2,360 m), 8 Aug: `.../2026/08/07-Figure-07.jpg`. CC BY-ND. ~200–500 m.
3. INGV Fig. 5, camera view of the 30–31 Jul flow along the N wall of Valle del Bove forking at Monte Simone (EMCH camera, 31 Jul 05:34): `.../2026/08/05-Figure-05.jpg`. CC BY-ND. Landmark-locatable.
4. INGV Fig. 6, thermal camera view of the 3,200 m and 2,750 m flows, 7 Aug: `.../2026/08/06-Figure-06.jpg`. CC BY-ND.
5. Figs 2–4 of `https://ingvvulcani.com/2026/08/03/unestate-di-fuoco-sulletna-cronaca-di-una-breve-e-intensa-eruzione-30-luglio-2-agosto-2026/`: Valle del Leone fissure and lava channel, 30 Jul (S. Giammanco). Same blog licence.
6. Bulletin lava-field maps (18 Aug Fig. 3.1 and 25 Aug Fig. 3.1). The 18 Aug map is the best single validation item: a mapped extent as of 17 Aug, one day after the NISAR post date. Licence not stated.


### 2b. NGL GNSS stations (checked by the parent)
- **NGL stations inside the frame, with data to late Oct 2026:**
  - CAF1 (37.6741, 15.1396)
  - ESLN (37.6934, 14.9743)
  - PAC3 (37.6635, 15.1308)
  - SER8 (37.6477, 15.1503)
  - BRO2 ended in 2019.
- **Just outside:** ACSA, SCA2, EIIV (S/SE flank).
- **INGV's summit and high-flank network is not in NGL.**
- **My medians across 2026-08-07:**
  - Over ±10 days: ESLN dN **+14 mm**, dU −7 mm. Every other station shows <5 mm.
  - Over ±30 days with a 10-day gap: ESLN dN +19 mm; CAF1 dE −14 mm, dN +8 mm, dU −30 mm. The others show ≤4 mm.
- **ESLN (S flank) moving north and CAF1 (SE flank) moving W/N are both towards the summit, consistent with INGV's "deflazione" from 8 Aug.** The amplitudes are 1–2 cm and approach seasonal noise, so treat them as indicative.
- Expect any NISAR edifice-deflation signal at these sites to be ≤ about 2 cm.

### 1b. OPERA systematic cross-check (CMR)
- **OPERA DIST-ALERT-HLS**: 71 granules on tiles T33SWB/T33SVB, 2026-08-01 to 09-15. Vegetation loss under the new lava on the lower Valle del Bove (broom and pine) should register. Cross-check only.

### 5. Openverse / Commons CC image hits
- **Openverse:** "Etna eruption 2026" and "Etna lava 2026" gave **0 hits**.
- **Commons API:** 7 files uploaded since the event. One is relevant, "First eruption of Mount Etna in 2026 (P-070261-00-24).jpg" (CC BY 4.0, not geotagged).
- The only geotagged in-box files are astrophotography and church interiors.
- The usable photos are the INGVvulcani figures (CC BY-ND 4.0), which are not on Openverse.

**Verdict: strong.** You get dated, quantified lava-field maps (Sentinel-2 + UAS) that match the NISAR window almost exactly, plus documented deflation from 8 Aug, but there is no GNSS magnitude and no vector files.


---

## langtang-avalanche

NISAR box: [85.243, 28.017, 85.656, 28.383]. Event pair 2026-08-16 → 08-28. Pre-event pair 07-23 → 08-16.

### 1. Systematic datasets

- **Copernicus EMS EMSR927, "Flood in Nepal"** (flash flood). Activated 2026-08-26 09:53. Closed. GDACS FL1104124. Licence CC BY 4.0, "© 2026 European Union, EMSR927" (per HDX `npl-flood-emsr927`). Activation JSON: https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=EMSR927 . Two AOIs fall inside the box:
  - **AOI01 Syapru Besi.** GRA product from WorldView-3, 2026-08-27 05:05. The `observedEventA` layer is one photo-interpreted polygon, "6-Mass Movement / Landslide", **111.1 ha**, spanning lon 85.3240–85.3475, lat 28.1500–28.1881. Buildings: 392 of 517 residential affected. 5 of 5 bridges and 5.4 of 5.4 km of primary road affected.
    - Zip (SHP + GeoJSON + lyr/sld/xml; follow the 302 with `curl -L`): https://rapidmapping.emergency.copernicus.eu/backend/EMSR927/AOI01/GRA_PRODUCT/EMSR927_AOI01_GRA_PRODUCT_v1.zip . Downloaded and verified, 6.8 MB. Add `?type=gpkg|vectors|pdf|xlsx` for the single-format variants listed on HDX.
    - GeoJSON alone: https://rapidmapping-viewer.s3.eu-west-1.amazonaws.com/EMSR927/AOI01/GRA_PRODUCT/EMSR927_AOI01_GRA_PRODUCT_observedEventA_v1.json
    - Post-event VHR ortho COG: `EMSR927/AOI01/GRA_PRODUCT/EMSR927_AOI01_GRA_PRODUCT_WORLDVIEW3_20260827_0505_ORTHO_cog.tif`. This is a viewer layer; I did not check whether the imagery may be redistributed.
  - **AOI02 Timure.** GRA product from Legion, 2026-08-27 05:05. Landslide polygon **129.4 ha**, spanning lon 85.3575–85.3797, lat 28.2424–28.2799. 225 of 232 residential buildings affected.
    - Zip: .../EMSR927/AOI02/GRA_PRODUCT/EMSR927_AOI02_GRA_PRODUCT_v2.zip
    - GeoJSON: https://rapidmapping-viewer.s3.eu-west-1.amazonaws.com/EMSR927/AOI02/GRA_PRODUCT/EMSR927_AOI02_GRA_PRODUCT_observedEventA_v2.json
  - AOI03 Bidur, AOI04 Bharatpur, AOI05 Phosretar and AOI06 Kyundi are outside the box.
  - Report storymap: https://storymaps.arcgis.com/stories/f76baefadfa74d6d9a18265875f48870
  - **These are the best debris-extent polygons available.** They are VHR photo-interpretation, but they cover only the two settlement AOIs.
- **UNOSAT FL20260826NPL.** CC BY-SA, on HDX.
  - *Mudflow/rockflow extent, Rasuwa.* Built from Sentinel-2 (27 Aug) plus PlanetScope (26 Aug). About 20 km² affected within a 230 km² analysed area. Geodatabase: https://unosat.org/static/unosat_filesystem/4257/FL20260826NPL.gdb.zip (URL responds; I did not unpack it). Page: https://data.humdata.org/dataset/mudflow-rockflow-extent-as-of-26-27-august-2026-in-rasuwa-district-bagmati-province-nepal
  - *Impact assessment, Rasuwa + Nuwakot.* 37 km² affected out of 350 km² analysed. https://unosat.org/static/unosat_filesystem/4259/FL20260826NPL.gdb.zip
  - *Newly formed barrier lakes* (CARTOSAT-3, 28 Aug). Lake 1, about 12 ha, is near the border about 11 km east of the Friendship Bridge along the Chusumdo Tsangpo. Lake 2, about 19 ha, is about 2 km west of the avalanche source area. https://unosat.org/static/unosat_filesystem/4260/FL20260826NPL.gdb.zip
  - **This is the corridor-wide, systematic extent.** It is the best match for the full NISAR box.
- **HOT `hot_flood_npl`** (ODbL): "Flood Extent, Observed 27 August 2026". One polygon, 31.7 km², spanning lon 84.556–85.380, lat 27.795–28.281. Mapped from drone, Landsat, PlanetScope and Sentinel imagery. GeoJSON: https://production-raw-data-api.s3.amazonaws.com/ISO3/NPL/combined/hot_flood_npl_flood_extent.geojson (downloaded and verified).
  - The same dataset carries a **Bridge Damage Assessment** of 58 points: https://production-raw-data-api.s3.amazonaws.com/ISO3/NPL/combined/hot_flood_npl_bridge_damage.geojson . 16 of those points are inside the box: 13 "Washed out", 3 "Intact". These make good point-level checks, see section 3.
- **Microsoft AI for Good, `2026-nepal-flash-flood`** (CC BY). Impacted area 37 km², 4,977 Overture buildings. GPKG: https://data.humdata.org/dataset/6451fa3d-61bf-4385-8b18-3026e0b34958/resource/f7aaf5f5-e175-4644-887a-e7e4bb254925/download/nepal_flash_flood_2026_overture_buildings_damage.gpkg . GeoTIFF: .../11ce1350-2b0f-4dac-870a-1e483b5c1da0/download/nepal_flash_flood_2026_ihme_population_extent.tif
- **Planetary Response Network** (CC BY, crowd-sourced). Road-blockage points as SHP, dated 28 Aug and 1 Sep. 22 locations, 19 of them severely flooded, mostly on NH42. https://data.humdata.org/dataset/nepal-flooding-road-blcokages
- **Sentinel Asia**, Rasuwa activation 2026-08-26, requested by DHM, GLIDE FF-2026-000162-NPL: https://sentinel-asia.org/EO/2026/article20260826NP.html . Products listed:
  - **EOS-RS Damage Proxy Map** (Sentinel-1, 28 Aug), KMZ. This is a coherence-change product, so it is the most direct analogue to a NISAR coherence drop. https://sentinel-asia.org/EO/2026/article20260826NP/EOS-RS_20260828_DPM_S1/EOS-RS_20260828_DPM_S1_Nepal_GLOF_v0.9.kmz
  - **JAXA ALOS-2 Flood Proxy Map**, 2026-08-28, shapefiles. ALOS-2 is L-band like NISAR. https://sentinel-asia.org/EO/2026/article20260826NP/JAXA/JAXA_20250828_FPM_ALOS2_Nepal_FLDEXT.zip (the "2025" in the filename is as published).
  - AIT DPM (Sentinel-1 28/31 Aug plus Sentinel-2 27 Aug), KMZ: .../AIT/AIT-VAP001-NP.kmz
  - IWM VAP from PlanetScope up to 28 Aug: .../IWM/IWM_2026_08_26_Nepal_Flood_VAP02.zip
  - TASA FORMOSAT-5 maps (28 Aug): .../TASA/Affected_Flood_in_Rasuwa_District_Nepal.zip
  - MBRSC PlanetScope (26 Aug): .../MBRSC/20260826-Nepal-Flood-Other-00658.zip
  - Licences are not stated on the page. All URLs are as listed on that page; I did not download each one.
- **International Charter activation 1052** (2026-08-26): https://disasterscharter.org/activations/flood-in-nepal-activation-1052- . NESRA reports that 21 Charter products were listed by 2 Sep. The value-adders include BGS, SERTIT, ICIMOD, NRSC/ISRO, K-water and Leeds.
- **ICIMOD.** Resource page and Q&A (narrative, no downloadable layer): https://www.icimod.org/kyirong-rasuwa-flood-2026-nepal-china-border/
- **NESRA FloodWatch.** EO assessment v1 from Sentinel-2 27 Aug, plus an inventory of external products: https://nesraspace.org/floodwatch/rasuwa-2026/
- **NDRRMA.** No geospatial product found; its figures appear only in sitreps on ReliefWeb (https://reliefweb.int/disaster/ff-2026-000162-npl). That disaster page also lists reference maps (OCHA/HDX) and UNOSAT maps.

### 2. GNSS

- I found no operating national CORS with 2026 data in the box. EarthScope/UNAVCO metadata lists **CHLM Chilime** (28.2072, 85.3141; NEGAR Nepal), with sessions ending 2021-04 and the latest data in 2018-09. It also lists **DNC4 Dunche** (28.0769, 85.2458), which ended in 2018. Neither is usable for 2026.
- I did not find a public archive for the Nepal Survey Department / NGII CORS. NGL was skipped as instructed.

### 3. Field-measured values

- **Debris depth at Gyirong Port, China side of the confluence** (about 28.28 N 85.38 E, inside the box). Searchers covered 1.591 million m² of debris "four metres deep on average and up to 16 metres in places". "Satellite imagery of the Gyirong Port area shows mud averaging more than 1.5 metres deep, and over two metres in places". Source: Xinhua/CCTV as compiled by Mappr: https://www.mappr.co/nepal-flash-flood-rasuwagadhi/ (news compilation, link only).
- **Run-up near the source:** "debris climbed the valley walls to a height of roughly 400 metres". Downstream at Galchhi (outside the box) the water rose 9 m in 30 minutes. Source: ICIMOD Q&A (URL above), citing ThePrint, Al Jazeera and a scientific coordination group.
- **Precursor motion. This is the key lead for NISAR.** ICIMOD Q&A: "Satellite radar shows the slope had moved by up to 30 cm in the three to four weeks before it failed". The failure was a rock and ice slab on the **north face of Langtang Lirung**, at 5,000–5,500 m, falling about 1,200 m into the Lhende Khola. The analysis is unpublished ("analyses shared in scientific coordination group (Brencher, Vacek, Stark, Dunning…)"). The window matches the NISAR pre-pair 07-23 → 08-16. Langtang Lirung (about 28.25 N 85.52 E) is inside the box, but the exact deforming pixel is not given.
- **Source mechanism:** USGS Ms 5.2 and GFZ Mw 5.7 landslide-type seismic signal at 08:37 NPT, with a second, smaller collapse about 3 h later (ICIMOD Q&A).
- **Barrier lake:** level fell about 10 m from its peak early on 27 Aug (China's water ministry via CCTV, in Mappr). The 28 Aug breach raised the river only about 0.6 m. The upper blockage exceeds 120,000 m² (China's geological disaster centre).
- **Bridge status points** (HOT bridge-damage GeoJSON, lat/lon, ODbL):
  - Washed out:
    - Miteri Bridge, Rasuwagadhi (28.27894, 85.37810)
    - Timure Bridge 1 (28.27127, 85.37770)
    - Timure Bridge 2 (28.23998, 85.35828)
    - Ghatte Khola (28.22671, 85.36180)
    - Bhotekoshi Bridge at Chilime (28.18280, 85.34328)
    - Chilime Bridge (28.18165, 85.34222)
    - Hydropower Bailey Bridge, Syaphrubesi (28.16439, 85.33993)
    - Syafrubesi Bridge (28.15748, 85.33249)
    - Trisuli 216 Audit 1 Bailey (28.12028, 85.28842)
    - Haku1 Bailey (28.11295, 85.28103)
    - Haku khola (28.11016, 85.27896)
    - Bimali Khola (28.10854, 85.27715)
    - Haku2 Bailey (28.10837, 85.27514)
  - Intact:
    - Sano bharkhu (28.14556, 85.31871)
    - Trisuli Khola Bridge (28.12726, 85.29947)
    - Thade Khola (28.09156, 85.25194)
  - Note: HOT places "Ghatte Khola" at 28.2267, 85.3618. The story file estimated Ghattekhola at 28.268, 85.373 (`langtang-05`, low confidence). Re-check that point.
- **Infrastructure:** the Betrawati–Rasuwagadhi road (42 km) was destroyed at multiple points, and 14 hydropower projects (about 748 MW) were damaged. Source: Rapid Situation Overview, 27 Aug, https://reliefweb.int/report/nepal/nepal-flash-floods-rapid-situation-overview-27-august-2026

### 4. Strongest media (≤8)

1. **CEMS EMSR927 AOI01/AOI02 VHR orthos and map PDFs** (WorldView-3 and Legion, 27 Aug). These show the debris sheet at Syabrubesi and Timure. Georeferenced, so locatable to pixel level. Map products are CC BY 4.0; imagery redistribution rights not verified. Zip links in section 1.
2. **EOS-RS Sentinel-1 Damage Proxy Map** (28 Aug), KMZ, georeferenced. The closest analogue to a coherence-loss map. Licence not stated. Sentinel Asia page.
3. **JAXA ALOS-2 Flood Proxy Map** (28 Aug), SHP, georeferenced. L-band. Licence not stated.
4. **UNOSAT mudflow-extent maps and gdb** (CC BY-SA), georeferenced. ReliefWeb map: https://reliefweb.int/map/nepal/nepal-satellite-detected-mudflow-rockflow-extent-26-27-august-2026-rasuwa-district-bagmati-province-imagery-analysis-2627082026-published-27082026-v1
5. **TASA FORMOSAT-5 post-event images** (28 Aug). PNG maps with grid, roughly locatable. https://sentinel-asia.org/EO/2026/article20260826NP/TASA/Flood_in_Rasuwa_District_Nepal_1.png (and `_2.png`). Licence not stated.
6. **Onlinekhabar aerial of Syabrubesi** (31 Aug). Already in the story file (`langtang-01`). News, link only. Locatable to a few hundred metres.
7. **CCTV frame of the flood hitting Gyirong Port** (Commons, PD-tagged). Already in the story file (`langtang-04`). Locatable to within a few hundred metres.
8. **Sentinel Asia pre-event pairs** for before/after: ALOS-2 HH 2026-01-30 and 2026-08-28 quicklooks (.../ALOS2662273030-260828-FBDR2.1GUD/IMG-HH-ALOS2662273030-260828-FBDR2.1GUD.jpg) and Resourcesat-2A April 2026. These are only roughly locatable because they are quicklooks.


### 2b. NGL GNSS stations (checked by the parent)
- **NGL stations inside the box:**
  - CHLM (28.2072, 85.3141), ended 2021-04
  - DNC4 (28.0769, 85.2458), ended 2018-05
- **No current station.** KUGE (27.6184, 85.5385), about 45 km S, is the nearest live station, but it is irrelevant to the debris corridor.

### 1b. OPERA systematic cross-check (CMR)
- **OPERA DIST-ALERT-HLS**: 15 granules on tile T45RUM, 2026-08-20 to 09-30. DIST-ALERT-S1: none.

### 5. Openverse / Commons CC image hits
- **Openverse:** "Nepal flood 2026" gave **0 hits**; "Syabrubesi" returned HTTP 504.
- **Commons API:** 8 files uploaded since the event:
  - **1 geotagged inside the box:** "Nepal_flood_2026_before_after.webp" (PD, taken 2026-08-27, 28.2903, 85.4537), https://commons.wikimedia.org/wiki/File:Nepal_flood_2026_before_after.webp
  - Landsat "Nepal flood 2026-08-26" (PD)
  - "Mudslide at Gyirong Port 1.webm" (PD)
  - ERCC daily maps (PD)

**Verdict: strong.** There are polygon debris extents from VHR imagery (CEMS) and corridor-wide extents (UNOSAT, HOT). There are independent SAR damage-proxy maps (EOS-RS Sentinel-1, JAXA ALOS-2 L-band) and 16 located bridge-status points. There is also a reported 30 cm pre-failure slope motion to check against the NISAR pre-pair. No GNSS is available.


---

## flores-quake

USGS event **us6000tkt2**: M7.8 (ComCat), 2026-08-14 21:58 UTC, which is 15 Aug local time. Epicentre 121.3446, −8.3358, offshore and north of the grid (121.035–121.765 E, 8.863–8.137 S).

### 1. Systematic damage and ground-failure datasets

- **USGS finite-fault model (v3)** with its InSAR inputs: https://earthquake.usgs.gov/product/finite-fault/us6000tkt2_1/us/1787347333870/. The interferograms are Sentinel-1, not NISAR (positive = away from the satellite):
  - `s1-p61-20260802-20260820.txt`: 953 points, 53 in the grid, LOS −0.185 to −0.019 m. Nearest values:

    | Place | LOS | Distance to point |
    |---|---|---|
    | Tonggurambang | −0.019 m | 0.2 km |
    | Mbay | −0.048 m | |
    | Aeramo | −0.079 m | |
    | Degalea | −0.155 m | |

    Look vector (−0.51, 0.11, −0.85).
  - `s1-p112-20260806-20260818.txt`: 415 points, 51 in the grid, LOS −0.131 to +0.052 m. Mbay +0.048 m, Degalea −0.079 m, Ende −0.107 m. Look vector (0.57, 0.13, −0.81).
  - `surface_deformation.disp` model: the coastal strip north of the grid uplifts by up to 1.9 m (121.07, −8.22). Inside the grid, uplift is +0.36 m at (121.445, −8.403). South of about −8.5°, horizontal motion is **north at 0.3–0.75 m** with small vertical motion (−0.05 to −0.11 m).
  - This is consistent with our measured range of only 12 cm: most of the land in the frame sits south of the uplift hinge.
- **USGS ground-failure product (v11)**: model predictions. Landslide alert **red** (aggregate hazard 180 km², about 14,000 people exposed); liquefaction alert yellow (51 km²). Files: https://earthquake.usgs.gov/product/ground-failure/6000tkt2/us/1789147561033/
- **EOS-RS Damage Proxy Maps**, from Sentinel-1 coherence change at about 30 m pixels (CC BY 4.0). These are directly comparable to our coherence-drop layer. Page: https://data.humdata.org/dataset/eos-rs-indonesia-earthquake-flores-aug-2026, more at https://sf.earthobservatory.sg/event/EOSRS_2026_013_IDN_EQ_202608_Flores
  - DPM for 18 Aug (pre-event series 13 Apr–6 Aug, post-event 18 Aug): GeoTIFF + KMZ + PNG, 12.6 MB zip. https://data.humdata.org/dataset/763d6b9f-05ee-456e-8283-53d856aa5d07/resource/533a3e00-7408-4519-9e2b-ebd1f497babd/download/eosrs_2026_013_idn_eq_20260818_dpm_s1_flores_v0.9.zip
    - The "Danga" inset is **Mbay/Danga, inside our grid**. Change pixels cluster along the **Danga–Nila–Marapokot road** and in Danga town. Other insets cover Ende and Maumere.
  - DPM for 24 Aug, west Flores (pre-event 21 Apr–2 Aug, post-event 20 Aug), 14.2 MB zip. https://data.humdata.org/dataset/763d6b9f-05ee-456e-8283-53d856aa5d07/resource/04de9d3d-4c49-4fea-9783-f45f6716d2b4/download/eosrs_2026_013_idn_eq_20260824_dpm_s1_flores_v0.9.zip
- **Copernicus EMS: none.** No Indonesian activation appears in the EMSR list for Aug–Oct 2026; I checked EMSR912–935.
- **UNOSAT: none found** on HDX.
- **BMKG InSAR report**, preliminary: https://content.bmkg.go.id/wp-content/uploads/Laporan-Analisis-InSAR-Gempa-Flores-2026.pdf
  - Sentinel-1 via HyP3, positive = **toward the satellite**. Referenced to the BIG CORS station CFLT. **No data files are offered.**
  - Ascending 6→18 Aug: LOS −15.47 to +31.45 cm. Maximum positive near **Reok** (outside the grid, west); **the strongest negative lobe is around Mbay** (inside the grid).
  - Descending 9→21 Aug: −26.44 to +3.77 cm, negative across central Flores.
  - No coordinates for the extrema, and no vertical/east decomposition.
- **BMKG source model**, seismic only, maximum slip 3.8 m shallow, rupturing west from the hypocentre north of Nagekeo: https://content.bmkg.go.id/wp-content/uploads/Artikel_Model-Sumber-Gempa-Bumi-Flores-2026.pdf

### 2. GNSS and other geodetic points

- **BIG Ina-CORS station CFLT** (Wulanggitang, East Flores; outside the grid), from the BMKG InSAR report, PPP static:

  | Interval | ΔE | ΔN | ΔU | 95% LOS uncertainty |
  |---|---|---|---|---|
  | 6–18 Aug | +0.48 cm | +0.36 cm | −1.02 cm | about 1 cm |
  | 9–21 Aug | +0.35 cm | +0.19 cm | −0.87 cm | about 1 cm |

  These are far-field values; no coordinates are given.
- BIG's SRGI Instagram post (https://www.instagram.com/p/DcChXBYEseY/) says Ina-CORS recorded the surface shift. The page would not render, so **I could not verify any values from it.**
- Real-time viewer: https://srgi.big.go.id/visual_gnss. I found no published table of InaCORS offsets.
- **Strong-motion-derived permanent offsets** (BMKG/STMKG, Muzli et al.; double integration with baseline correction; the authors say these need independent confirmation): https://content.bmkg.go.id/wp-content/uploads/BC_Gempa_NTT_rev20260901.pdf, Table 1, in cm:

  | Station | Place | Lat | Lon | E | N | U | Position |
  |---|---|---|---|---|---|---|---|
  | **NANFI** | Pagomogo, Nagekeo | −8.76104 | 121.3018 | −2.30 | **+36.11** | −3.68 | **Inside the grid** |
  | RNFM | Riung | −8.42933 | 121.0262 | −36.59 | +52.71 | −9.97 | About 1 km west of the grid edge |
  | BNTI | Bajawa | −8.78601 | 120.9769 | −6.60 | +37.22 | −10.84 | Outside, west |

  NANFI agrees with the USGS model at (121.259, −8.774), which gives N +0.46 m and U −0.05 m.

### 3. Field-measured displacement and ground failure

- I found **no measured offsets, no surface rupture and no coastal uplift survey.** BMKG and Gusman say most of the rupture lay offshore or under the island, with no on-land surface break reported.
- **Liquefaction (sand boils)** at **Desa Waekokak, Kec. Aesesa** (OSM village −8.4673, 121.1994; inside the grid):
  - Badan Geologi (Lana Saria), via Kompas: https://www.kompas.id/artikel/badan-geologi-temukan-indikasi-likuefaksi-di-nagekeo-setelah-gempa-magnitudo-77
  - BMKG field survey of 15–25 Aug: https://www.bmkg.go.id/siaran-pers/gempa-flores-meluruh-bmkg-ungkap-hasil-survei-lapangan-sebagai-basis-mitigasi-dan-rekonstruksi
  - Water, sand and mud ejected; low-to-moderate foundation damage. No dimensions given.
- The BMKG survey classes **Mbay and Marapokot** (−8.534, 121.310) as soft soil (SE).
- Ground cracks spouting hot water at **Tonggurambang** (TribunFlores; already in the story file).
- Viral photo of root-pattern ground cracks at "Manatu", confirmed by BMKG as shaking-induced (https://garuda.tv/viral-retakan-tanah-mirip-akar-di-flores-pasca-gempa-m-77-cek-penjelasan-bmkg/). Location not established.
- Tsunami run-up survey, all **outside the grid** in Manggarai/East Manggarai: Selama 2.68 m, Tadho Tengah 2.42 m, Tompong 2.39 m, Nangadero 2.24 m.

### 4. Media that shows displacement

1. **EOS-RS DPM PNG/KMZ, "Danga" inset** (CC BY 4.0, exactly georeferenced): the best image-type item inside the grid.
2. **BMKG InSAR report, Figs 5–6** (ascending/descending LOS maps with a Mbay negative lobe). BMKG publication; reuse terms not stated.
3. **Garuda TV / Kompas** root-pattern crack photo, "Manatu". News, link only; poorly located.
4. TribunFlores, Tonggurambang cracks (from the story file). News, link only; located to the village.
- Commons has **no category** for the 2026 Flores earthquake. I found no free photo of the Waekokak sand boils.


### 2b. NGL GNSS stations (checked by the parent)
- **No NGL station within 0.5° of the frame has 2026 data.** See §2 for BIG CFLT and the strong-motion offsets.

### 5. Openverse / Commons CC image hits
- **Openverse:** "Flores earthquake" / "Flores earthquake 2026" returned HTTP 504 three times; not completed.
- **Commons API:** 8 files uploaded since the event. They include "Building Destroyed in the Flores earthquake 2026.jpg" (PD, not geotagged) and the USGS FFM slip and basemap PNGs (PD).
- **Geotagged:** only a USGS map at the epicentre.

**Verdict: partial.** Good geodetic cross-checks (USGS S1 LOS points, BMKG InSAR ranges, NANFI strong-motion offset, EOS-RS coherence-change DPM over Mbay), but no field-measured surface displacement, and the expected signal in the frame is small.


---

## fuego-eruption

NISAR pair 2026-07-17 → 2026-08-10. The paroxysm ran 3–5 Aug (~50 h), so the pair covers it fully. The Copernicus post-event imagery is from 9 and 11 Aug.

### 1. Systematic datasets
- **Copernicus EMS EMSR912, "Volcano eruption in Guatemala"** (activated 2026-08-05 by DG ECHO; GDACS VO1000145). Activation API record: `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=EMSR912`. Storymap: https://storymaps.arcgis.com/stories/77f24833ad4043109ec6531cc18e4807
  - **AOI01 "El Fuego", DEL_PRODUCT v1** (delineation, delivered 11 Aug, updated 20 Aug): `https://rapidmapping.emergency.copernicus.eu/backend/EMSR912/AOI01/DEL_PRODUCT/EMSR912_AOI01_DEL_PRODUCT_v1.zip` (4.1 MB; redirects to a signed S3 URL; `curl -L` works). Contents: shapefile, GeoJSON, GPKG and a 1:24,000 PDF map. `observedEventA` has 4 pyroclastic-flow polygons (photo-interpretation): **237.2 ha** (lon −90.9329 to −90.8802, lat 14.4504–14.4861, which is the main W-flank Barranca Seca fan from the crater), plus 5.95 ha, 1.38 ha and 3.04 ha. The 3.04 ha polygon is the distal tip at −90.9418 to −90.9328, 14.4743–14.4764, ~6.7 km W of the crater, consistent with INSIVUMEH's 5–7 km run-out.
  - **AOI01 DEL_MONIT01 v1** (delivered 14 Aug): `https://rapidmapping.emergency.copernicus.eu/backend/EMSR912/AOI01/DEL_MONIT01/EMSR912_AOI01_DEL_MONIT01_v1.zip`. Same PDC polygons (234.2 ha main) plus an **ash-fall deposit polygon of 2,983.9 ha** (semi-automatic, from Legion 11 Aug), extent −90.9499 to −90.8952, 14.4382–14.5086.
  - Sources, from the `source_v1.dbf` table: pre-event SPOT-6/7 1.5 m (6 Feb 2026); post-event **COSMO-SkyMed 2nd Gen 3.0 m, 9 Aug 23:44Z**; **Legion 1.6 m, 9 Aug 16:59Z** and 11 Aug 14:00Z. Area units are ha: the polygons sum to ~3,230, which matches the activation's `max_extent` 3230.
  - AOI00 "Yepocapa" GRM was not produced ("Because of remote sensing limitations").
  - Licence: Copernicus EMS products, free with attribution ("© European Union, Copernicus Emergency Management Service").
- **INSIVUMEH:** drone photogrammetry of the W flank was done to estimate "el espesor como el volumen total". The values are **not published** on the page (https://insivumeh.gob.gt/insivumeh-instala-estacion-multiparametrica-fg18-en-el-volcan-de-fuego-2/, 21 Aug). No PDC map or vector was found. CONRED: field and drone visit to "barranca Santa Teresa/Seca", no map (https://conred.gob.gt/monitoreo-en-campo-fortalece-acciones-de-prevencion-en-el-volcan-de-fuego/).
- MOUNTS Fuego (`http://www.mounts-project.com/timeseries/342090`): no Sentinel-1 deformation pair inside 20 Jul–25 Aug.

### 2. GNSS / tilt
None published. The INSIVUMEH bulletins and posts cite seismic (RSAM), infrasound, cameras and satellite only. The new FG18 station (Finca Las Conchitas, Yepocapa, installed after the eruption) is a camera, seismic and meteorological station, not GNSS.

### 3. Field-measured
- **Barranca Seca deposits:** temperatures up to **195.6 °C** measured by thermocouple; lava fragments with bread-crust texture; PDC effects on vegetation (https://insivumeh.gob.gt/insivumeh-realiza-evaluacion-tecnica-de-depositos-piroclasticos-en-el-volcan-de-fuego/, 26 Aug). A second post reports **>200 °C** inside the deposits from drone thermal and thermocouple, and says the W-flank deposits threaten lahars in Barranca Seca and Ríos Mineral and Pantaleón (21 Aug post above). No thickness or volume numbers are published.
- **Run-out:** PDCs "recorriendo distancias de 5 a 7 kilómetros" in barrancas Seca, Taniluyá, Ceniza, Las Lajas and Honda, possibly Trinidad and El Jute (BEFGO_062_2026 via https://insivumeh.gob.gt/actualizacion-de-la-actividad-del-volcan-de-fuego-hoy-04-de-agosto/). Las Lajas and Honda were added overnight 3–4 Aug (BEFGO-061, CONRED https://conred.gob.gt/volcan-de-fuego-mantiene-descenso-de-corrientes-piroclasticas/). Duration was 50 h (BEFGO-066, CONRED 5 Aug).
- **Precisely located field evidence: the INSIVUMEH drone photo sets with RTK GPS in EXIF/XMP.** These are DJI M30T photos, wide (W) and thermal (T), 13–14 Aug, embedded on the INSIVUMEH posts as public Google Drive folders:
  - Folder A (21 Aug post): https://drive.google.com/embeddedfolderview?id=1o1g4-HVI0vVFqm8V1N2py5faSI6Ni7tF
  - Folder B (26 Aug post): https://drive.google.com/embeddedfolderview?id=1B_DQ2vstkNNzsXOAlZTD-RIxoTinRj3p
  - Camera positions extracted from the XMP (drone-dji tags; GpsStatus RTK, σ ~1–2 cm):

| File | lat | lon | alt m (rel) | gimbal yaw / pitch | notes |
|---|---|---|---|---|---|
| DJI_20260813182041_0043_W (+ _T thermal) | 14.476288 | −90.932838 | 1573 (+96) | −108.6° / −24.7° | **laser-rangefinder target 14.4754945, −90.9353306 at 313 m.** Looks down the Barranca Seca channel |
| DJI_20260813181336_0020_W | 14.482907 | −90.911442 | 2111 (+634) | −102° / −22.7° | upper W flank |
| DJI_20260814164045_0205_W/T | 14.476419 | −90.931037 | 1671 (+196) | 71.5° / 3.2° | looking E up-barranca, near-horizontal |
| DJI_20260814164248_0208_W/T | 14.479456 | −90.924955 | 1909 (+434) | 80.1° / 11.3° | |
| DJI_20260814164554_0212_W/T, 0221_W/T | 14.484722 | −90.909335 | 2403 (+929) | ~100° / ~10° | upper flank toward crater |
| DJI_20260813111538_0114_D | 14.478777 | −90.922526 | 1837 (+355) | 71.5° / 4.0° | (folder B) |
| DJI_20260813130311_0146_D, 0148_D | 14.475568 | −90.935407 | 1480 (−17) | 39°/76° / ~5° | **ground-level shot in the barranca floor with a person for scale.** Fresh grey deposit against older cut walls |

  - The 0043 LRF target (14.47549, −90.93533) and the 0146 position (14.47557, −90.93541) both fall inside the EMSR912 distal PDC polygon (−90.9418 to −90.9328, 14.4743–14.4764). That gives three independent confirmations at the same spot: Copernicus polygon, drone LRF and ground photo. The 0043_W image shows the channel floor filled with fresh grey deposit cutting between vegetated interfluves, which is exactly the coherent/decorrelated contrast to look for.
  - Licence: Guatemalan government material shared publicly on Drive. **No explicit licence.** Treat as link-only, or ask INSIVUMEH.

### 4. Strongest media
1. EMSR912 PDF map, 1:24,000 (inside the DEL_PRODUCT zip: `Maps/EMSR912_AOI01_DEL_PRODUCT_24000_map_v1.pdf`). Free with attribution. Georeferenced.
2. INSIVUMEH DJI_20260813182041_0043_W, looking down the Barranca Seca channel full of fresh deposit. Camera and LRF target GPS to <1 m. https://drive.google.com/file/d/1qLKjLgf87985SQG83UuW-ls2X7XGGx4u
3. Thermal pair DJI_20260813182042_0043_T (hot deposit in the channel, same geometry): https://drive.google.com/file/d/1WzpiozZGfnLRSIxmU3voNViMOi4MNtBX
4. DJI_20260813130311_0146_D, ground-level view of the deposit-filled barranca floor with a person for scale (14.47557, −90.93541): https://drive.google.com/file/d/1SuzFny90iEC06CsMGPHFbSsp7XX5FQnm
5. DJI_20260814164045_0205_W/T (14.47642, −90.93104, looking E up-channel): https://drive.google.com/file/d/17tBUBNJRwX4N0nUncFch8QhnXVA1-SiT and .../1sLEgR_WCqtcNkmxdr_Yll0xniKLwj3k1
6. DJI_20260814164554_0212_W, upper W flank toward the crater (14.48472, −90.90934): https://drive.google.com/file/d/1dTkjgoMQ_GLrSsswYpDMVkj7kDxvZtmr
7. Folder B screenshots "Captura de pantalla 2026-08-26 114055/114148.png", probably the thermal or analysis display (not inspected): https://drive.google.com/file/d/1Wh5I-zr0ZbEZ7R4JG_jq5gXr9qKU72Ub, .../1Fbv4dMZyMlJiAtWdu2ApO328bKR8qwwD


### 2b. NGL GNSS stations (checked by the parent)
- No NGL station within 0.5° has 2026 data.

### 5. Openverse / Commons CC image hits
- **Openverse:** "Fuego volcano 2026" / "Fuego eruption 2026" gave **0 hits**.
- **Commons:** 1 post-event file (the ERCC daily map PDF, PD).
- The geolocated imagery is INSIVUMEH's RTK drone set on Google Drive (§3), which has no stated licence.

**Verdict: strong** for surface change: Copernicus PDC and ash vectors from imagery dated inside the NISAR window, plus RTK-located drone and ground photos inside the mapped polygon. **None** for deformation: no GNSS or tilt is published.


---

## anak-krakatau

NISAR pair 2026-08-25 → 2026-09-06 (22:39 UTC, i.e. 7 Sep 05:39 WIB). The continuous eruption ran 4 Sep 23:07 WIB → 6 Sep 00:04 WIB, so the pair covers it fully.

### 1. Systematic datasets
- **Copernicus EMS: no activation** for Indonesia (checked against the full feed). No UNOSAT product was found. The only EU product is the ERCC/ECHO Daily Map of 7 Sep 2026 (situational, not a deposit map): https://commons.wikimedia.org/wiki/File:ECDM_20260907_Anak_Krakatau_Indonesia.pdf (CC BY 4.0 / EC reuse).
- **Badan Geologi / PVMBG:** a Sentinel before/after comparison gives **+32.8 ha** of new land on the NW–W–SW shore plus two new islets. It was announced on Badan Geologi social media on 24 Sep, as reported by detik (https://news.detik.com/berita/d-8676571/analisis-badan-geologi-soal-munculnya-daratan-baru-di-dekat-anak-krakatau) and DW (link in the existing story). **No map, polygon or download link has been published.** Badan Geologi calls it provisional pending field verification.
- MOUNTS Krakatau (`http://www.mounts-project.com/timeseries/262000`): no Sentinel-1 deformation pair inside 20 Aug–25 Sep. Sentinel-1 coverage is sparse here, so NISAR may be the only InSAR source.
- Commons has Landsat 8 OLI 5 Sep (during the eruption, plume-covered): https://commons.wikimedia.org/wiki/File:Anak_Krakatau_Rumbles_Again_(1303134_-_oli_20260905).jpg, from NASA EO https://science.nasa.gov/earth/earth-observatory/anak-krakatau-rumbles-again/ (public domain). It does not show the new land, because of the plume.

### 2. GNSS / tilt (PVMBG, qualitative only)
- 7 Sep report: "Data tiltmeter Stasiun Tanjung memperlihatkan kecenderungan peningkatan (inflasi) pada awal Agustus 2026", while station Lava93 was flat (https://geologi.esdm.go.id/media-center/perkembangan-erupsi-gunungapi-anak-krakatau-tanggal-7-september-2026).
- 10 Sep report: Tanjung and Lava93 both flat (https://geologi.esdm.go.id/media-center/perkembangan-erupsi-gunungapi-anak-krakatau-tanggal-10-september-2026).
- The status was lowered to Level II on 21 Sep partly because "data deformasi yang menunjukkan gejala deflasi" (Antara, https://www.antaranews.com/berita/5751925/status-gunung-anak-krakatau-turun-dari-siaga-menjadi-level-ii-waspada). No values or stations are given. The Level III raise on 2 Jul was also attributed to seismicity and deformation.
- No GNSS values were found.

### 3. Field-measured
- +32.8 ha of land, NW–W–SW sector, from pyroclastic deposits and lava flows (detik/DW, 24 Sep). Antara (status-down article) separately says the eruption "menghasilkan aliran lava ke arah barat laut, barat, hingga barat daya".
- New islets: NW at **760 m** and SE at **495 m** from the coast, on a NW–SE line through the main crater. Confirmed by sailors, volunteers and Sentinel imagery as of 23 Sep. 1 km exclusion radius around each (https://babel.antaranews.com/berita/584019/badan-geologi-deteksi-kemunculan-dua-pulau-baru-di-sekitar-krakatau).
- detik embeds a video titled "Penampakan Daratan Baru 30,3 Ha Dekat Anak Krakatau dari Ketinggian" (aerial view). Note it says 30.3 ha, not 32.8 ha. I did not resolve the discrepancy.
- No lat/lon is published. The positions in the existing story are computed from distance and bearing (±a few hundred m).

### 4. Strongest media
1. Commons: lava fountain, 5 Sep 2026 (from the sea): https://commons.wikimedia.org/wiki/File:Mount_Anak_Krakatau_continuous_eruption_and_lava_fountain,_5_September_2026.jpg. Shows activity, not deposit extent. Already in the story.
2. detik aerial video "Penampakan Daratan Baru 30,3 Ha …" on the detik article page. News, link only. Possibly shows the new W-shore land. Not inspected frame by frame.
3. NASA EO Landsat 8 OLI, 5 Sep (public domain): plume-covered, low value for extent.
4. ERCC Daily Map 7 Sep (CC BY 4.0): context only.

There is no independent image yet that shows the new shoreline with a reusable licence. The best route is the parent's own Sentinel-2 after-scenes (S2A_48MWU_20260917 etc. in meta.json) differenced against the before-scenes, to reproduce the 32.8 ha.


### 2b. NGL GNSS stations (checked by the parent)
- No NGL station within 0.5° has 2026 data.

### 5. Openverse / Commons CC image hits
- **Openverse:** "Anak Krakatau 2026" gave **0 hits**.
- **Commons API:** 20 files uploaded since the event, all satellite (CIRA/NOAA-20, NASA EO Landsat/VIIRS: PD; one CC BY 4.0 Himawari-type frame) plus the 5 Sep lava-fountain photo.
- **Three are "geotagged"**, but at the volcano's object location rather than a camera position. None shows the new shoreline unobscured.

**Verdict: partial.** Quantified area change and islet distances exist from an authoritative source, but there is no published map or vector and no deformation numbers. The validation polygon has to be derived from Sentinel-2.


---

## bangladesh-flood

NISAR box: [91.621, 24.343, 91.919, 24.617]. GCOV passes on 07-02 and 07-14.

### 1. Systematic datasets

- **International Charter activation 1042**, "Flood in Bangladesh", activated 2026-07-13 by UNOSAT on behalf of WFP: https://disasterscharter.org/activations/flood-in-bangladesh-activation-1042- . The page lists no value-adders or products.
- **UNOSAT FL20260712BGD** (Charter and UNOSAT, published 21 Jul 2026). "Preliminary satellite-derived flood impact assessment" from **UNOSAT FloodAI on Sentinel-1, 5–18 July 2026**, plus PlanetScope post-event imagery from **14 July 2026**, the same day as the NISAR after-pass. Moulvibazar figures: **641 km² flooded** (the largest of the seven districts), 581 km² of flooded cropland, about 218,700 people exposed. Page 3 is a district map, "Satellite-Detected Flood Extent (5–18 July 2026)… Moulvibazar & Habiganj".
  - PDF (15 pp; I downloaded and read it): https://reliefweb.int/attachments/f08e06f4-7187-4821-91b2-1691e44a1799/UNOSAT_Preliminary_Assessment_Report_FL20260712BGD.pdf . Page: https://reliefweb.int/map/bangladesh/preliminary-satellite-derived-flood-impact-assessment-flood-extent-and-associated-statistics-khagrachari-rangamati-bandarban-coxs-bazar-chattogram-moulvibazar-and-habiganj-districts-bangladesh-21-jul-2026
  - **No vector or raster download found.** HDX has nothing for 2026 Bangladesh, and searches for "FL20260712BGD" and "moulvibazar" returned no matching dataset. The PDF gives no reuse licence and no upazila-level figures. Request the FloodAI extent from unosat@unitar.org, or check the UNOSAT Live Web Map (HDX `unosat-live-web-map`, not checked).
- **Copernicus EMS:** no activation for Bangladesh in 2026. I checked the full list of public activations EMSR870–935.
- **Sentinel Asia:** no 2026 Bangladesh activation on the 2026 EO index. The latest Bangladesh entries are from 2024.
- **FFWC/BWDB:** the site (ffwc.gov.bd) is an Angular app backed by `https://api.ffwc.gov.bd`, which returns 403 "Invalid Security Header" to direct requests. I found no archived bulletin download. SPARRSO: nothing found.
- **Not checked:** Copernicus GFM (the automated Sentinel-1 global flood extent at global-flood.emergency.copernicus.eu). It should cover 9–14 July by design and is the best remaining systematic layer to try.

### 2. GNSS

- EarthScope/UNAVCO lists no stations in the box. I found no public Survey of Bangladesh CORS archive.

### 3. Field-measured values (BWDB gauges and breaches; news, link only)

- **Manu at Railway Bridge and Chandnighat (Moulvibazar):** 55 cm above danger level on 9 Jul, as of about 9:00. The same article gives Dhalai at its Railway Bridge 33 cm above, Kushiyara at Sherpur 31 cm below and rising, and Srimangal rainfall of 95 mm in 24 h after 91 mm the day before. Source: The Daily Star, 9 Jul, https://www.thedailystar.net/news/environment/weather/news/rivers-swell-habiganj-moulvibazar-raising-flood-fears-4219656 (verified on the page).
- **Manu: 84 cm above danger "as of 9am on Saturday" (11 Jul).** Dhalai was 70 cm above on Friday night and fell slightly by Saturday. Source: BWDB XEN Khaled Bin Walid via bdnews24, https://bdnews24.com/bangladesh/6ab2a50a67a0 (verified). The 71 cm reading on 10 Jul comes from the story file; I did not re-verify it.
  - The gauge coordinates are not published in these sources. FFWC's Manu station locations were unavailable because the API is blocked.
- **Breaches** (Daily Country Today, verified: https://www.dailycountrytodaybd.com/story/embankment-breaches-put-100-villages-underwater-in-m%27bazar;-50,000-marooned):
  - The Manu embankment breached at Uazirpur and Haripasha, Tengra union, Rajnagar, flooding 71 villages and marooning about 40,000 people.
  - The Dhalai breaches in Kamalganj flooded 35 villages.
  - The old Manu breach at Shikoria, Prithimpasha union (Kulaura), let water back in. Overtopping in Sharifpur union affected 20–25 homesteads.
  - Families in Moulvibazar Sadar moved to the Mahirgaon Dakhil Madrasa shelter, Chandnighat union.
  - bdnews24 says the Uzirpur collapse happened late Friday night (10 Jul) and flooded at least 10 villages. The story file's 40–50 m breach width comes from Ajker Patrika and is not re-verified here.
  - None of these sites are given with lat/lon in the sources.
- BDRCS Sitrep 3 (12 Jul) confirms the Dhalai embankment breach in Kamalganj: https://reliefweb.int/report/bangladesh/bangladesh-red-crescent-society-situation-report-3-monsoon-triggered-landslides-and-flooding-coxs-bazar-bandarban-chattogram-rangamati-khagrachari-moulvibazar-and-habiganj-bangladesh-12-july-2026-1600-hrs

### 4. Strongest media (≤8)

1. **UNOSAT FL20260712BGD p.3 district flood-extent map** (Sentinel-1 FloodAI, 5–18 Jul) and its PlanetScope 14 Jul imagery. The map has a grid, so the extent can be compared visually against the NISAR change layer. No licence is stated; © Planet for the imagery. Link only. PDF above.
2. **bdnews24 flood photos, 10 Jul**, in the Rajnagar/Kamalganj context. Not geolocated; news, link only.
   - https://media.assettype.com/bdnews24-english/2026-09-08/iw75hbki/moulvibazar_flood_100726_02_1783674940.jpg
   - https://media.assettype.com/bdnews24-english/2026-09-08/4oiary0u/moulvibazar_flood_100726_03_1783675267.jpg
   - https://media.assettype.com/bdnews24-english/2026-09-08/cihobh92/moulvibazar_flood_100726_04_1783675282.jpg
3. **Daily Star "Photo: Star"**, 9 Jul. Captioned only "Flash floods inundated several villages in Moulvibazar"; not located. Link only.
4. I found no aerial or drone imagery and no georeferenced before/after pair.


### 2b. NGL GNSS stations (checked by the parent)
- NGL **MAU2** (24.3972, 91.9064) is inside the box but ended 2020-09. There is no current station.

### 1b. OPERA systematic cross-check (CMR)
- **OPERA DSWx** (NASA dynamic surface-water extent, 30 m GeoTIFF, global; CMR):
  - **DSWx-S1** tiles T46RCN and T46QCM, acquired **2026-07-16** (S1C), two days after the NISAR 07-14 pass. Granule `OPERA_L3_DSWx-S1_T46RCN_20260716T234641Z_20260725T035909Z_S1C_30_v1.0`.
  - DSWx-HLS 2026-07-05, 07-06 and 07-14 (L8/L9; probably cloudy in the monsoon).
  - **This is the best downloadable flood-extent raster found.**

### 5. Openverse / Commons CC image hits
- **Openverse:** "Moulvibazar flood" gave **0 hits**.
- **Commons API:** 49 files uploaded since the event. None is a geotagged photo of this flood inside the box.
- The six geotagged "Flooded Locality of Osmaninagar, Sylhet 01–06" (CC BY-SA 4.0, about 24.63 N 91.68 E, about 1.5 km north of the box) were **taken 2024-07-05**, so they are a different flood. Do not use them.

**Verdict: partial.** There is a district-level Sentinel-1 flood extent (641 km² in Moulvibazar) from a contemporaneous date, but only as a PDF map with no data download. There are gauge exceedances from BWDB via the press and named breach sites, but no coordinates. There is no GNSS, no CEMS and no located media. To make this strong, get the FloodAI vectors from UNOSAT or pull Copernicus GFM for 9–14 Jul.


---

## aspen-acres-fire

### 1. Systematic datasets
- **WFIGS perimeter (NIFC):** `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query?where=OBJECTID%3D55353&outFields=*&f=geojson` (GeoJSON MultiPolygon, 47k vertices).
  - Attributes: IRWIN `{1CDF5E5A-F22E-4352-A582-C2A47663B93D}`, UFID `2026-COCUX-001160`, discovered 2026-06-29 12:04Z, GIS acres **102,003**.
  - The feature is a "Wildfire Daily Fire Perimeter" (Mixed Methods), DateCurrent 2026-08-10, 96% contained. It is not yet in `WFIGS_Interagency_Perimeters_Certified`.
  - Bbox: −105.1466, 37.9192 → −104.8496, 38.2121.
  - **Grid coverage:** the hero grid ends at lon −104.957 and lat 37.969, so the eastern ~10 km of the scar (towards Colorado City and Rye) and a southern strip are **off-grid**.
- **BAER soil burn severity (USFS EDW):** BAER report_id **132**, "Aspen Acres BAER" (Pike and San Isabel NFs).
  - Assessment boundary 104,702.8 ac, boundary date 2026-07-21. BARC→SBS complete. dNBR thresholds low/mod/high = 80/130/253. No pre/post scene IDs recorded.
  - Boundary: `https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BurnedAreaEmergencyResponse_01/MapServer/0/query?where=report_id%3D132&outFields=*&f=geojson`
  - SBS polygons (9,175 features, max 2,000 per request, so page with `resultOffset`): `https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BurnedAreaEmergencyResponse_01/MapServer/1/query?where=report_id%3D132&outFields=soil_burn_severity,gis_acres&f=geojson`
  - Format: GeoJSON, JSON or PBF.
  - The GTAC SBS raster mosaic (`imagery.geoplatform.gov/.../USFS_EDW_BAER_SoilBurnSeverityClassification/ImageServer`) has **no** Aspen Acres item yet.
- **MTBS:** not yet available, as expected for a 2026 fire.
- **Damage and inspection points:** no CAL FIRE-style DINS layer exists.
  - Closest: NRCS EWP damage assessment, 360 "Reviewed" points (at-risk structures and infrastructure, *not* fire damage), plus a perimeter layer. `https://services.arcgis.com/SXbDpmb7xQkk44JV/arcgis/rest/services/Aspen_Acres_Emergency_Watershed_Protection_Program_Damage_Assessment/FeatureServer/2/query?where=1%3D1&outFields=*&f=geojson`
  - "Buildings within Aspen Acres Fire Perimeter (point)", 793 OSM buildings, exposure only and not damage: `https://services3.arcgis.com/APrbG4iiuZuctqvI/arcgis/rest/services/Buildings_within_Aspen_Acres_Fire_Perimeter__point_/FeatureServer/0`
  - The Pueblo County Assessor's damage map (`https://experience.arcgis.com/experience/25736e16bf1a4559b03d122943741a82`) uses `maps.co.pueblo.co.us` services, which timed out, so it is unverified whether it has per-parcel destroyed/damaged status.
- **Post-fire debris-flow and flood assessment:** Olsson "Aspen Acres Susceptibility v2" FeatureServer, with debris-flow, flood and hydrology risk grids, 236 basins (`AspenAcresBasins`, layer 107) and at-risk structures: `https://services6.arcgis.com/gyy0H6zBnh9CbWoj/arcgis/rest/services/Aspen_Acres_Susceptibility_v2_WFL1/FeatureServer`. This is a consultant model product, not observations.
  - USGS debris-flow hazard assessment: not verifiable (403).
- **InciWeb:** the slug is `copsf-aspen-acres-fire` (cited by Wikipedia, e.g. `https://inciweb.wildfire.gov/incident-publication/copsf-aspen-acres-fire/aspen-acres-fire-update-07-05-2026`), but it returns 403 to automated clients, so it is unverified.

### 3. Field-measured
- **BAER SBS acres by class** (sum of EDW polygons for report 132; total 104,696 ac):
  - Very Low/Unburned: **11,873**
  - Low: **41,812**
  - Moderate: **32,852**
  - High: **18,159**
  - That is ≈ 11 / 40 / 31 / 17 %. These are computed by me from the service; the BAER report PDF itself was not found.
- **Flash flood, 2026-08-16:** an 80-year-old man died near **Hwy 78 & Central Ave, Beulah**. The nearest Central Ave node is ≈ 38.0746, −104.9937 (Nominatim; intersection accuracy ~200 m).
  - NWS estimate: **1–1.5 in of rain in ~1.5 h** in Beulah. Flooding was also reported in the Ula Trail area.
  - Source: `https://www.cbsnews.com/colorado/news/one-person-killed-flash-flooding-aspen-acres-burn-scar-southern-colorado/`
  - This was flooding, not a measured debris-flow deposit.
- **Late-July burn-scar flooding:** "at least 11 homes in Beulah/San Isabel damaged" (Gazette, 2026-07-30). Not verified: gazette.com blocks with Cloudflare.
- **Structure losses:** Pueblo County Sheriff tallied at least **254 homes** destroyed in Pueblo County, mostly around Beulah (Colorado Sun 2026-07-13, verified: `https://coloradosun.com/2026/07/13/aspen-acres-fire-survivors-254-homes-destroyed/`). Wikipedia gives >850 structures and 319 homes. No coordinates are published.

### 4. Media (burn extent and edge)
1. **CIRA/NOAA JPSS "Aspen Acres Fire Grows" (2026-06-29 20:50).**
   - `https://commons.wikimedia.org/wiki/File:Aspen_Acres_Fire_Grows_(CIRA_2026-06-29).png`, with unlabelled GIF/WebM variants alongside.
   - Public domain (NOAA). Satellite view at VIIRS scale (~375 m), locatable at the regional scale only.
   - Shows the day-1 run, not the final scar.
2. **NASA MODIS Aqua "Fires Across the Western United States" (2026-06-29).**
   - `https://commons.wikimedia.org/wiki/File:Fires_Across_the_Western_United_States_(MODIS_2026-07-01).jpg`
   - Public domain. Shows smoke plumes at 250 m, so it is weak for the burn edge.
3. **Colorado Sun media tour, 2026-07-10** (Horseshoe Lodge, the South Pine Dr foundation, the mixed burned/unburned pattern).
   - Already in the stories: `https://coloradosun.com/2026/07/10/beulah-firefighters-aspen-acres-fire/`
   - News photos, link only. Locatable to street level (~100–300 m). This is the best "edge pixels are mixed" evidence.
4. **Wikipedia time-lapse GIF**, ignition to 4 July.
   - `https://commons.wikimedia.org/wiki/File:Aspenacrestimelapse.gif`
   - CC BY-SA 4.0 (user-made, not federal), 540×420, coarse.
5. **BAER SBS map:** render from the EDW SBS polygons above. Public domain (USFS). Georeferenced, so this is the best extent and severity "image".

There are no verified aerial obliques or before/after orthophotos with a known location.


### 2b. NGL GNSS stations (checked by the parent)
- **No NGL station inside the grid.** Nearby stations with data through Oct 2026:
  - RG24 (37.9635, −104.9668), at the SE grid corner
  - P037 (38.4218, −105.1047)
  - COCY (38.4382, −105.2448)
- These are useful only as stable reference points. A fire does not produce a GNSS signal.

### 1b. OPERA systematic cross-check (CMR)
- **OPERA DIST-ALERT-HLS** (NASA, 30 m vegetation-disturbance alerts, global; COG via ASF/LP DAAC; found by CMR search `short_name=OPERA_L3_DIST-ALERT-HLS_V1`): 22 granules on tile T13SDC, 2026-06-25 to 07-31. This is an independent, systematic burn/disturbance layer.

### 5. Openverse / Commons CC image hits
- **Openverse:** "Aspen Acres Fire" returned HTTP 504; not completed.
- **Commons API:** 36 files uploaded since the event. They include the CIRA/NOAA "Aspen Acres Fire Grows" stills, GIFs and WebMs (PD), a World Central Kitchen photo (CC BY 4.0) and the CC BY-SA time-lapse GIF.
- **0 are geotagged.**

**Verdict: strong.** The georeferenced BAER SBS polygons (4 classes, about 105k ac) and the WFIGS perimeter are directly comparable to the NISAR burn and coherence layers. Note that ~10 km of the eastern scar is off the hero grid. Field debris-flow evidence is thin (flash floods only).


---

## little-giant-fire

### 1. Systematic datasets
- **WFIGS perimeter (NIFC):** `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query?where=OBJECTID%3D56312&outFields=*&f=geojson` (GeoJSON MultiPolygon, 54k vertices).
  - Attributes: IRWIN `{091081ED-BD23-4610-AE4A-270F95D1711E}`, UFID `2026-WAOWF-260406`, discovered 2026-07-16 01:17Z, **172,912 ac**.
  - 100% contained, DateCurrent 2026-10-13. It is not yet in the Certified layer.
  - Bbox: −120.8711, 47.8205 → −120.2673, 48.1028.
  - **Grid coverage:** the hero grid spans −120.858 to −120.306, so thin western and eastern slivers (the Lake Chelan shore and the Chiwawa headwaters) are off-grid.
- **BAER SBS (USFS EDW):** report_id **177**, "Little Giant BAER" (Okanogan-Wenatchee NF).
  - Boundary 173,171.5 ac, boundary date 2026-09-18.
  - BARC from **pre `A10UFU20240923_20m` / post `B10UFU20260918_20m`** (Sentinel-2, 18 Sep 2026, the **same day as the NISAR 2026-09-18 pass**).
  - dNBR thresholds 71/122/184. Field recon came from a BAER Survey123 survey dated 2026-09-30.
  - SBS polygons (22,466 features; page with `resultOffset`): `https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BurnedAreaEmergencyResponse_01/MapServer/1/query?where=report_id%3D177&outFields=soil_burn_severity,gis_acres&f=geojson`
  - **Easier option: the WA DNR State-BAER dissolved SBS** (4 multipolygons, one per class): `https://services.arcgis.com/4x406oNViizbGo13/arcgis/rest/services/SBAER_soilburnseverity/FeatureServer/0/query?where=Firename%3D%27Little%20Giant%27&outFields=*&f=geojson`
- **Post-fire debris flow (WA DNR State-BAER, based on the USGS model, King et al. 2025, 24 mm/h 15-minute design storm):**
  - Basins: 1,685 for Little Giant (High 172 / Moderate 840 / Low 673; field `H_24_LG`). `https://services.arcgis.com/4x406oNViizbGo13/arcgis/rest/services/SBAER_debrisflowbasins/FeatureServer/1/query?where=Firename%3D%27Little%20Giant%27&outFields=*&f=geojson`
  - Sibling services: `SBAER_debrisflowsegments`, `SBAER_soilerosionindex`, `SBAER_criticalvalues`, `SBAER_fireperimeters` and `SBAER_assessmentboundary`, all under the same `services.arcgis.com/4x406oNViizbGo13` root.
- **WALERT report** (verified, read in full): *Wildfire-Associated Landslide Emergency Response Team Report – 2026 Little Giant Fire*, WALERT Report 2026-04, by Langstroth, Mickelson, Bennett and Amaral (WA Geological Survey), Oct 2026, revised Nov 2026.
  - 22 pp. with 12 plates. Field work 21–23 Sep 2026. PDF, 30 MB: `https://dnr.wa.gov/sites/default/files/2026-10/ger_hazards_landslide_walert_report_little_giant_2026.pdf`
  - The report cites a USGS runout dataset at ScienceBase `6ab84e241ba49b8ead2a9cf7`. Its JSON did not resolve, so it is unverified.
- **MTBS:** not yet available.
- **InciWeb:** the presumed slug `waowf-little-giant-fire` returns 403, so it is unverified. Commons credits USFS photos to "Inciweb Little Giant Fire 2026 - WAOWF".
- **DINS:** none found. Structure losses come only from news (35 structures in the upper Entiat; see the stories).

### 3. Field-measured
- **BAER SBS acres** (WALERT Table 2; EDW sums agree to <0.5%):

  | Class | Acres | Share |
  |---|---:|---:|
  | Unburned/very low | 15,659 | 9% |
  | Low | 84,129 | 49% |
  | Moderate | 57,250 | 33% |
  | High | 15,669 | 9% |

  - High severity is concentrated in the drainages off Tyee Ridge, Fourmile Ridge, Basalt Peak, Estes Butte and Pope Ridge.
- **Observed post-fire debris flows** (WALERT; pins are OSM, the report gives no coordinates):
  - **Pope Creek fan (Site 36)**, ≈ 47.9778, −120.5672 (story pin).
    - 13 Aug 2026 storm (IMET estimate: ~0.25 in in 30 min).
    - Channel incised **15–30 ft** near the apex, mud splatter **>20 ft** above the fan, boulders 1–3 ft distal to **5–10 ft** upslope.
    - The flow crossed the Entiat River and left 1–2 ft (locally 2–4 ft) of fines and sand on the far bank.
    - **One structure destroyed** and two cabins surrounded by mud and boulders.
    - 25 Sep 2026: ~0.5 in of rain in 24 h produced **≥4 pulses**, with tire-sized boulders and severe damage to the road and culvert.
  - **Lake Creek fan (Site 31)**, Lake Creek Campground ≈ 47.933, −120.514 (OSM).
    - After the 13 Aug storm, debris crossed the fan in ≥4 places and the road in 3.
    - 1–7 ft boulders at the road. Near the apex: a 10-ft incised channel with 5-ft boulder levees and 5-ft mud splashes on trees.
  - **Silver Creek (Site 34)**, Silver Falls Campground ≈ 47.958, −120.536 (OSM).
    - After the 13 Aug storm, the upper trail bridge was washed away and a 4+ ft wedge of wood built up at the lower bridge. Avulsions put sediment on Entiat River Rd. Mud reached the campsites.
    - A second flow on 25 Sep deposited mud on the road.
  - **Nineteenmile Campground fan (Site 56, Chiwawa)** ≈ 48.020, −120.827 (OSM).
    - Likely 13 Aug. The channel is scoured ~8 ft deep about 700 ft upslope. The deposit reaches ≤60 ft across and west of Chiwawa River Rd, about 250 ft north of an 18-in culvert.
  - **Rock Creek fan (Site 61)**, near Chiwawa Horse Camp ≈ 47.974, −120.792 (OSM).
    - The BAER assessment reports a debris flow during or after the 13 Aug event. No dimensions given.
  - Pre-fire caution: the deposits at Site 57 and Sites 46–48 date from the **December 2025** atmospheric river. These predate the fire, so don't count them as post-fire change.
- **Structure losses** (see the existing story little-01): 35 structures in the upper Entiat from about MP 25 (Sno-Park ≈ 47.9095, −120.4858). No coordinates per structure.

### 4. Media (burn extent and edge)
1. **WALERT Plates 2, 5, 8, 11: BAER SBS maps** (whole fire, lower Entiat, upper Entiat, Chiwawa), plus Plates 1/4/7/10 (fans and site numbers) and 3/6/9/12 (USGS combined hazard). These are in the PDF above.
   - WA state publication, so cite it; it is not federal public domain.
   - Georeferenced maps. This is the best way to locate the Site 31/34/36 pins precisely.
2. **USFS photo "Little Giant Fire burn scar 7-24-26"**, burnt and downed trees across an FS road.
   - `https://commons.wikimedia.org/wiki/File:Little_Giant_Fire_burn_scar_7-24-26.jpg`
   - Public domain (USFS/InciWeb). No location (not locatable), and it shows the early July burn.
3. **USFS IR/ops maps**, 26 Jul and 10 Aug 2026.
   - `https://commons.wikimedia.org/wiki/File:Little_Giant_Fire_Map_–_August_10,_2026.jpg` and `…July_26,_2026.jpg`
   - Public domain. They show the interim perimeter on a georeferenced basemap, which is useful for timing the growth against the NISAR passes.
4. **USFS "Little Giant Fire Division U 8-14-2026"**, mule deer in the burned area.
   - `https://commons.wikimedia.org/wiki/File:Little_Giant_Fire_Division_U_8-14-2026.jpg`
   - Public domain. No coordinates (division-level only).
5. **KOZI before/after photos of an Entiat River Road home** (story little-01): `https://www.kozi.com/post/two-homes-among-52-structures-lost-in-little-giant-fire`
   - News, link only. Locatable only to the road (several km).
6. The USFS UAS footage of the Pope Creek channel is cited by WALERT but **not publicly posted**.


### 2b. NGL GNSS stations (checked by the parent)
- **No NGL station inside the grid.** Nearby stations:
  - HLDN (48.1974, −120.7795), about 7 km N
  - QMAR (47.7751, −120.9656), about 8 km W
  - LVNW, CHEL, P413, TWSP
- Reference only.

### 1b. OPERA systematic cross-check (CMR)
- **OPERA DIST-ALERT-HLS**: 36 granules on tile T10UFU, 2026-07-10 to 09-30 (COG, CMR `OPERA_L3_DIST-ALERT-HLS_V1`).

### 5. Openverse / Commons CC image hits
- **Openverse:** "Little Giant Fire" returned HTTP 504; not completed.
- **Commons API:** 35 files uploaded since the event, mostly USFS/InciWeb photos and maps (PD, not geotagged).
- **5 are geotagged.** All are distant smoke or pyrocumulus views from Leavenworth, Sloan Peak and Tunnel Creek, outside the grid, so they are of no use for the burn edge.

**Verdict: strong.** There are georeferenced BAER SBS polygons whose post-fire Sentinel-2 date (2026-09-18) matches a NISAR pass, plus 1,685 USGS-model debris-flow basins and five WALERT-measured post-fire debris flows. Those flows are small (fan-scale, ≤ ~100 m), so expect them to be at or below NISAR pixel scale.


---

## Summary

| event | damage / change dataset? | GNSS? | field offsets? | best displacement media | verdict |
|---|---|---|---|---|---|
| kumamoto-quake | No CEMS. GSI slope-failure GeoJSON, SAR displacement-boundary map, post-event orthos; USGS ground-failure models | **Yes**: GEONET/NGL J093 (千丁) about 88 cm NE / −33 cm vs J702 (泉) 18 cm S, across the fault; 8 in-frame stations | **Yes**: 13 GSJ tape-measured right-lateral offsets, 6–184 cm, up to 130 cm vertical | Commons CC BY-SA "fault near Myoken Daiichi Bridge" and Myoken-gu step; MLIT CC BY 4.0 road and rail steps | **strong** |
| panama-quake | EMSR934 GRA points (Tonosí, Llano de Piedras); UNOSAT points (just W of grid); **USGS FFM with NISAR p040 range offsets on our pair**; IGC 9,553-landslide inventory (map only) | NGL ACHO/AZUE/AZUT in frame, but **no post-quake data yet** | **Yes**: Búcaro 1–1.2 m H / ~1 m V; Isla Cañas 15–30 cm subsidence (village-level locations) | News only (La Prensa Búcaro); no open offset photo | **strong** (resolve sign/amplitude vs USGS first) |
| venezuela-quake | **EMSR884 GRM: Sentinel-1 DInSAR LOS polygons + GeoTIFF over the whole frame**; Morón/San Felipe GRA damage points | None in frame (BARQ ~50 km W, data gap) | Almost none: Farriar fissure (located), bridge ~10 cm lateral / 6 cm vertical (unlocated) | EMS GRM map PDF; no open ground photos | **strong** for InSAR cross-check / partial for ground truth |
| mexico-city-subsidence | **OPERA DISP-S1 (4 frames, to Mar 2026)**; NASA PIA26709 NISAR map | **Yes**: MMX1 −26.5 cm/yr (MIDAS), −26.8 cm/yr over the window; ICMX −2.1 cm/yr (to Jan 2026) | Published rates up to 50 cm/yr (Chaussard 2021); Ángel +14 steps | Commons CC BY-SA: Ángel base, sunken Santísima Trinidad, Cathedral (GPS-tagged) | **strong** |
| etna-eruption | No CEMS. INGV lava-field maps 17 and 20 Aug (PDF, to georeference); MOUNTS S1 coherence; OPERA DIST-ALERT | Partial: NGL ESLN/CAF1 1–2 cm toward summit (consistent with INGV deflation); INGV gives no magnitudes | Flow lengths, areas, volumes and front elevations (no lat/lon) | INGV CC BY-ND photos of the Rocca Capra lava front | **strong** for surface change |
| langtang-avalanche | **EMSR927 debris polygons (Syabrubesi 111 ha, Timure 129 ha)**; UNOSAT corridor extent; HOT extent + 16 bridge points; EOS-RS S1 DPM; JAXA ALOS-2 FPM | None (CHLM/DNC4 dead) | Debris depth 1.5–16 m at Gyirong; ~30 cm pre-failure slope motion (unpublished); bridge status points | EMS WorldView-3/Legion orthos; Commons PD before/after (geotagged) | **strong** |
| flores-quake | No CEMS. **EOS-RS S1 Damage Proxy Map (CC BY 4.0, Mbay inset)**; USGS FFM S1 LOS points; BMKG InSAR report (no data) | Partial: strong-motion offset NANFI +36 cm N (in grid); BIG CFLT ~1 cm (far field); no NGL | No measured offsets; Waekokak liquefaction (no values) | DPM PNG/KMZ; news crack photos (poorly located) | **partial** |
| fuego-eruption | **EMSR912 PDC polygons (237 ha main) + 2,984 ha ash-fall vector**, from imagery of 9–11 Aug | None | Run-out 5–7 km; deposit temperatures; **RTK-geotagged INSIVUMEH drone photos inside the EMS polygon** | INSIVUMEH DJI 0043_W / 0146_D (no licence stated) | **strong** for surface change, none for deformation |
| anak-krakatau | None systematic; Badan Geologi +32.8 ha new land (number only, no map) | None (tilt qualitative only) | Islets 760 m NW / 495 m SE (distances only) | No open image of the new shoreline; derive from Sentinel-2 | **partial** |
| bangladesh-flood | UNOSAT FloodAI S1 extent (PDF only, 641 km² Moulvibazar); **OPERA DSWx-S1 2026-07-16 raster**; Charter 1042 (no products) | None (MAU2 dead) | BWDB gauges: Manu 55 cm (9 Jul) and 84 cm (11 Jul) above danger level; breach sites named but not located | None located (bdnews24 news photos) | **partial** |
| aspen-acres-fire | **WFIGS perimeter (102,003 ac) + BAER SBS polygons (report 132)**; OPERA DIST-ALERT; NRCS EWP points | None in grid (not expected) | SBS acres by class: 11.9k / 41.8k / 32.9k / 18.2k ac; flash flood 16 Aug | Render the BAER SBS map; Colorado Sun mixed-edge photos (link only) | **strong** (east ~10 km off-grid) |
| little-giant-fire | **WFIGS perimeter (172,912 ac) + BAER SBS (S2 2026-09-18, same day as a NISAR pass)**; WA DNR debris-flow basins; WALERT report | None in grid | WALERT-measured post-fire debris flows (Pope, Lake, Silver Creeks: 10–30 ft incision, 1–10 ft boulders) | WALERT SBS plates; USFS PD maps | **strong** |
