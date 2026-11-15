# Credits

This is the canonical list of everything this project uses: data, reference sources, media,
software, services and AI. The site and the Space Apps submission take their credits from here.
Everything above the generated section is maintained by hand. `tests/test_pipeline.py` fails if a
Python dependency or a script loaded by the site is missing from it, or if the generated section is
stale.

## Satellite and map data

| Data | Provider | Used for | Licence / terms |
|---|---|---|---|
| NISAR L2 GUNW (provisional): geocoded unwrapped interferograms | NASA/JPL-Caltech and ISRO, distributed by the ASF DAAC ([search.asf.alaska.edu](https://search.asf.alaska.edu)), found through NASA CMR | Ground motion, coherence and interferograms for quakes, volcanoes, landslides and subsidence | Free and open (NASA Earth science data policy). Cite "NASA/JPL-Caltech/ISRO, ASF DAAC" |
| NISAR L2 GCOV (provisional): geocoded backscatter | NASA/JPL-Caltech and ISRO, distributed by the ASF DAAC | Before/after radar brightness change for fires and floods | As above |
| Copernicus Sentinel-2 L2A | ESA / European Commission (Copernicus), via [Element 84 Earth Search](https://earth-search.aws.element84.com/v1) on AWS Open Data | Cloud-masked optical composites draped on the 3D terrain | Copernicus Sentinel data terms: free and open. Images say "Contains modified Copernicus Sentinel-2 data" |
| Copernicus GLO-30 DEM | ESA / Airbus (Copernicus), [AWS Open Data](https://registry.opendata.aws/copernicus-dem/) | 3D terrain | Copernicus DEM licence: free, with attribution: "© DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA" |
| OpenStreetMap, via [Nominatim](https://nominatim.openstreetmap.org) | OpenStreetMap contributors | Placing stories, seed places and news headlines | ODbL 1.0: "© OpenStreetMap contributors" |

## Reference and validation sources

These were used to check NISAR against what happened on the ground and to place the stories. Each
link is listed in [`research/validation-sources.md`](research/validation-sources.md); a value shown on
the site is credited in the per-event table below.

| Source | Events | What it gave us |
|---|---|---|
| Copernicus Emergency Management Service ([rapidmapping.emergency.copernicus.eu](https://rapidmapping.emergency.copernicus.eu)) | Panama, Venezuela, Langtang, Fuego | Damage grading, debris and pyroclastic-flow polygons, Sentinel-1 DInSAR polygons (Venezuela EMSR884) |
| ESA Copernicus Sentinel-1 (via EMS, OPERA, EOS-RS and USGS products) | Venezuela, Mexico City, Flores, Langtang, Bangladesh | Independent C-band InSAR and flood extents to cross-check NISAR |
| NASA/JPL OPERA (DISP-S1, DSWx-S1, DIST-ALERT) | Mexico City, Bangladesh, Etna, Langtang, fires | Systematic displacement, surface water and disturbance products |
| USGS Earthquake Hazards Program ([earthquake.usgs.gov](https://earthquake.usgs.gov)) | Quakes | Event parameters, ShakeMaps, finite-fault models, ground-failure models |
| Nevada Geodetic Laboratory ([geodesy.unr.edu](https://geodesy.unr.edu)) | Kumamoto, Mexico City, Etna and others | GNSS station time series (MIDAS rates, co-seismic offsets) |
| Geological Survey of Japan, AIST ([gsj.jp](https://www.gsj.jp)) | Kumamoto | Field-measured fault offsets and field photos. GSJ Terms of Use, compatible with CC BY 4.0 |
| Headquarters for Earthquake Research Promotion / GSI GEONET ([jishin.go.jp](https://www.jishin.go.jp), [gsi.go.jp](https://www.gsi.go.jp)) | Kumamoto | GNSS co-seismic offsets, slope-failure maps |
| GEER Association ([geerassociation.org](https://geerassociation.org)) | Venezuela | Field reconnaissance (GEER-087, doi:10.18118/G6S95Q) |
| UNOSAT ([unosat.org](https://unosat.org)), Sentinel Asia, International Charter Space and Major Disasters | Panama, Langtang, Bangladesh | Damage and flood assessments |
| EOS Remote Sensing, Earth Observatory of Singapore | Flores, Langtang | Damage Proxy Maps (CC BY 4.0) |
| INGV Osservatorio Etneo ([ct.ingv.it](https://www.ct.ingv.it)) | Etna | Lava-flow maps, bulletins, photos (CC BY-ND) |
| INSIVUMEH, CONRED (Guatemala) | Fuego | Bulletins, drone photos, run-out distances |
| BMKG, Badan Geologi, BIG (Indonesia) | Flores, Anak Krakatau | Event reports, new-land area, geodetic points |
| BWDB (Bangladesh Water Development Board) | Bangladesh | River gauge levels |
| ICIMOD, Humanitarian OpenStreetMap Team ([data.humdata.org](https://data.humdata.org)) | Langtang | Debris extent, bridge status points |
| NIFC WFIGS interagency perimeters; USDA Forest Service BAER soil-burn-severity | Aspen Acres, Little Giant | Fire perimeters and burn severity to validate the backscatter change |
| WA DNR / WALERT | Little Giant | Post-fire debris-flow observations |
| Published science (e.g. Chaussard et al. 2021 on Mexico City subsidence; NASA PIA26709) | Mexico City | Subsidence rates and the NISAR reference map |
| News outlets (cited per item, e.g. La Prensa, Telemetro, Infobae, Colorado Sun, The Daily Star, Kompas) | All | Ground stories, linked to the original. News images appear only as pixelated previews linked to the article |

## Ground media sources

Every photo or street view shown carries its own credit and licence on the event page, and is listed
per event below. These are the services they come from.

| Source | Licence of what we show | How it is used |
|---|---|---|
| [Wikimedia Commons](https://commons.wikimedia.org) | As stated per file (CC BY, CC BY-SA, CC0, public domain) | Photos, credited to the author with a link to the file page |
| [Openverse](https://openverse.org) | As stated per item (CC licences) | Photo search across Flickr and other CC sources |
| [Mapillary](https://www.mapillary.com) | CC BY-SA 4.0, credited to the contributor | Before/after street views |
| [Panoramax](https://panoramax.fr) | As stated per picture (usually CC BY-SA 4.0) | Street views |
| [GDELT Project](https://www.gdeltproject.org) DOC API | Index only; articles belong to their publishers | Finding news articles. Their preview images are shown pixelated (56 px), linked to the source |

## Software

| Software | Licence | Used for |
|---|---|---|
| [three.js](https://threejs.org) 0.170.0 (via [jsDelivr](https://www.jsdelivr.com)) | MIT | 3D viewer and About presentation |
| [Marked](https://marked.js.org/) 18.0.11 | MIT | Build-time rendering of the public Create guide and credits; no browser dependency |
| [NumPy](https://numpy.org) | BSD-3-Clause | Raster processing |
| [SciPy](https://scipy.org) | BSD-3-Clause | Filtering, interpolation |
| [h5py](https://www.h5py.org) / HDF5 | BSD-3-Clause / BSD-style | Reading NISAR HDF5 products |
| [rasterio](https://rasterio.readthedocs.io) / GDAL | BSD-3-Clause / MIT | Reading the DEM and Sentinel-2 COGs, reprojection |
| [pyproj](https://pyproj4.github.io/pyproj/) / PROJ | MIT / MIT | Coordinate transforms |
| [Pillow](https://python-pillow.org) | MIT-CMU (HPND) | Image output, pixelated previews |
| [Requests](https://requests.readthedocs.io) | Apache-2.0 | HTTP |
| [pytest](https://pytest.org) | MIT | Tests |
| Python 3.12 | PSF License | Pipeline |

## Services

| Service | Used for |
|---|---|
| NASA Earthdata Login and [CMR](https://cmr.earthdata.nasa.gov) | NISAR granule search and authenticated download |
| Alaska Satellite Facility DAAC | NISAR data hosting |
| AWS Open Data | Sentinel-2 and Copernicus DEM hosting |
| GitHub and GitHub Pages | Code hosting and the public site |

## About presentation

The 30-second presentation at `site/about.html` reuses the event data and viewer. Its method diagrams
are code-drawn schematics, not additional measurements. Full source-photo verification and provenance
are in [site/about/README.md](site/about/README.md) and [photo-source.json](site/about/photo-source.json).

- **Schoolyard photograph:** Akai, Ota, Maruyama, Yoshimi, Azuma, Ninomiya / Geological Survey of Japan,
  AIST, Emergency field report No. 5, photo 10. [Source report](https://www.gsj.jp/hazards/earthquake/kumamoto2026/kumamoto2026-02.html);
  [original photograph](https://www.gsj.jp/hazards/earthquake/kumamoto2026/images/kumamoto2026-17.png);
  [GSJ Terms of Use](https://www.gsj.jp/license/license.html#01), CC BY 4.0 compatible. The original
  1021 × 767 PNG bytes and annotations are unchanged. Presentation crop/reframing and English caption
  by Dancing With The SARs; no GSJ endorsement is implied. The 94 cm value is the field survey, not NISAR.
- **Sideways-slip prototype:** GSJ field offsets and Nevada Geodetic Laboratory daily positions for
  GSI GEONET stations. The field between observations is modelled, exaggerated and imperfect; vertical
  movement is omitted. See [the model and sources](docs/slip.md). It is not radar-measured sideways motion.
- Radar, Sentinel-2 imagery and terrain carry the satellite-data credits and terms above. The twelve-event
  mosaic uses the committed radar-layer images, not twelve additional claims of scientific validation.

## AI ("Super Intelligence") disclosure

We used a combination of AI models and coding agents throughout. They did research for candidate
events and ground stories, wrote most of the pipeline and site code, and drafted the docs. Every
value and source was checked against the original, and a person makes the editorial choices in the
editor.

No documentary photograph, satellite image or map data on the site was generated by AI. The About
presentation’s code-drawn method schematics were authored with AI assistance and are labelled as
schematics, not observations. Any generative-media image added later must carry a visible label
on the image itself (e.g. "SI-generated image via <tool>") and be listed here.

## Project licence

The project's own code and text are released under CC0 1.0 (see [LICENSE](LICENSE)). Third-party
data and media keep their own licences, as listed above and per item.

<!-- credits:begin (generated by pipeline.credits; do not edit by hand) -->

## Per event

Everything each event page shows, from `site/events/<slug>/meta.json` and `stories.json`. Rejected stories are left out; media appears once an editor selects it.

### Anak Krakatau lava flows, Indonesia (`anak-krakatau`)

| What | Credit | Licence | Source |
|---|---|---|---|
| NISAR ground motion and coherence | NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC | free and open (NASA Earth science data policy) | [search.asf.alaska.edu](https://search.asf.alaska.edu) |
| Optical imagery (draped ground) | Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search | Copernicus Sentinel data terms (free and open, with attribution) | [earth-search.aws.element84.com](https://earth-search.aws.element84.com/v1) |
| NISAR radar backscatter | NISAR L2 GCOV (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC | free and open (NASA Earth science data policy) | [search.asf.alaska.edu](https://search.asf.alaska.edu) |
| Story: 32.8 ha of new land on the west shore of Anak Krakatau | DW Indonesia / detikNews, quoting PVMBG head Rita Susilawati (Badan Geologi) | news, link only | [dw.com](https://www.dw.com/id/analisis-badan-geologi-soal-munculnya-daratan-baru-di-dekat-gunung-anak-krakatau/a-79405451) |
| Establishing shot (not of the event): Anak Krakatau, january 2016.jpg | Tyke | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Anak_Krakatau,_january_2016.jpg) |
| Story: New islet 760 m off the northwest coast | M. Riezko Bima Elko Prasetyo / ANTARA, quoting Badan Geologi | news, link only | [babel.antaranews.com](https://babel.antaranews.com/berita/584019/badan-geologi-deteksi-kemunculan-dua-pulau-baru-di-sekitar-krakatau) |
| Establishing shot (not of the event): Uprising-mt anak krakatau.jpg | Uprising | CC BY-SA 3.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Uprising-mt_anak_krakatau.jpg) |
| Story: New islet 495 m off the southeast coast | M. Riezko Bima Elko Prasetyo / ANTARA, quoting Badan Geologi | news, link only | [babel.antaranews.com](https://babel.antaranews.com/berita/584019/badan-geologi-deteksi-kemunculan-dua-pulau-baru-di-sekitar-krakatau) |
| Establishing shot (not of the event): Anak Krakatau volcano (50984292248).jpg | Annamaria Luongo | CC BY 2.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Anak_Krakatau_volcano_(50984292248).jpg) |
| Story: Lava fountain from the summit crater, 5 September | Pemprov Lampung (Lampung Provincial Government), via Wikimedia Commons | Public domain (per Wikimedia Commons) | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Mount_Anak_Krakatau_continuous_eruption_and_lava_fountain,_5_September_2026.jpg) |
| Story: Northeast shore: no new land | Badan Geologi (PVMBG), ESDM | Indonesian government agency report; text cited, no image used | [geologi.esdm.go.id](https://geologi.esdm.go.id/media-center/perkembangan-erupsi-gunungapi-anak-krakatau-tanggal-7-september-2026) |
| Establishing shot (not of the event): Anak Krakatau with some activity visible, Indonesia - April 17th, 2020 (49787256542).jpg | Pierre Markuse from Hamm, Germany | CC BY 2.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Anak_Krakatau_with_some_activity_visible,_Indonesia_-_April_17th,_2020_(49787256542).jpg) |

### Aspen Acres Fire, Colorado (`aspen-acres-fire`)

| What | Credit | Licence | Source |
|---|---|---|---|
| NISAR radar backscatter | NISAR L2 GCOV (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC: 5 passes, track 19 | free and open (NASA Earth science data policy) | [search.asf.alaska.edu](https://search.asf.alaska.edu) |
| Optical imagery (draped ground) | Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search | Copernicus Sentinel data terms (free and open, with attribution) | [earth-search.aws.element84.com](https://earth-search.aws.element84.com/v1) |

### Moulvibazar floods, Bangladesh (`bangladesh-flood`)

| What | Credit | Licence | Source |
|---|---|---|---|
| NISAR radar backscatter | NISAR L2 GCOV (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC: 3 passes, track 91 | free and open (NASA Earth science data policy) | [search.asf.alaska.edu](https://search.asf.alaska.edu) |
| Optical imagery (draped ground) | Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search | Copernicus Sentinel data terms (free and open, with attribution) | [earth-search.aws.element84.com](https://earth-search.aws.element84.com/v1) |
| Story: Manu embankment breaks at Uzirpur; villages of Tengra union go under | Ajker Patrika (Bengali); also bdnews24 https://bdnews24.com/bangladesh/6ab2a50a67a0 and Daily Country Today https://www.dailycountrytodaybd.com/story/embankment-breaches-put-100-villages-underwater-in-m%27bazar;-50,000-marooned | news, link only | [ajkerpatrika.com](https://www.ajkerpatrika.com/bangladesh/moulvibazar/ajpjcscs423r5) |
| Establishing shot (not of the event): Tarapasha High School and College (Cropped).jpg | Ahmed Reza Khan | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Tarapasha_High_School_and_College_(Cropped).jpg) |
| Story: Defaloura and Rajnagar town: on the flood's edge, under threat but not reported flooded | Daily Country Today, Moulvibazar correspondent | news, link only | [dailycountrytodaybd.com](https://www.dailycountrytodaybd.com/story/embankment-breaches-put-100-villages-underwater-in-m%27bazar;-50,000-marooned) |
| Establishing shot (not of the event): Tea garden of Moulvibazar.jpg | Sujitpauldu | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Tea_garden_of_Moulvibazar.jpg) |
| Story: Moulvibazar town holds behind its embankment as the Manu runs up to 84 cm above danger | The Daily Star (9 Jul 2026); Daily Country Today https://dailycountrytodaybd.com/story/embankment-breaches-along-manu-river-:-40-villages-flooded-in-moulvibazar; bdnews24 | news, link only | [thedailystar.net](https://www.thedailystar.net/news/environment/weather/news/rivers-swell-habiganj-moulvibazar-raising-flood-fears-4219656) |
| Establishing shot (not of the event): Moulvibazar Govt. High School School house of the British Time..jpg | Mr.smtanim | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Moulvibazar_Govt._High_School_School_house_of_the_British_Time..jpg) |
| Story: Kamarchak: water spills over the dam at Ward 2 | SK Sirajul Islam Siraj, Daily Country Today | news, link only | [dailycountrytodaybd.com](https://dailycountrytodaybd.com/story/embankment-breaches-along-manu-river-:-40-villages-flooded-in-moulvibazar) |

### Etna fissure eruption, Italy (`etna-eruption`)

| What | Credit | Licence | Source |
|---|---|---|---|
| NISAR ground motion and coherence | NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC | free and open (NASA Earth science data policy) | [search.asf.alaska.edu](https://search.asf.alaska.edu) |
| Optical imagery (draped ground) | Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search | Copernicus Sentinel data terms (free and open, with attribution) | [earth-search.aws.element84.com](https://earth-search.aws.element84.com/v1) |
| Story: Lava front at the foot of Rocca Capra, burning broom and pine | Boris Behncke, INGV-Osservatorio Etneo (Figura 8) | CC BY-ND 4.0 (INGVvulcani blog licence) | [ingvvulcani.com](https://ingvvulcani.com/2026/08/22/etna-la-calda-estate-del-2026/) |
| Story: Rocca Capra ridge: the island the lava flowed around | Boris Behncke, INGV-Osservatorio Etneo (Figura 8) | CC BY-ND 4.0 (INGVvulcani blog licence) | [ingvvulcani.com](https://ingvvulcani.com/2026/08/22/etna-la-calda-estate-del-2026/) |
| Story: New vent at Monte Rittmann: cone collapse and small pyroclastic flows | Marco Firetto Carlino, INGV-Osservatorio Etneo (Figura 7) | CC BY-ND 4.0 (INGVvulcani blog licence) | [ingvvulcani.com](https://ingvvulcani.com/2026/08/22/etna-la-calda-estate-del-2026/) |
| Story: Zafferana Etnea: ash, not lava | Daniele Andronico, INGV-Osservatorio Etneo (Figura 9) | CC BY-ND 4.0 (INGVvulcani blog licence) | [ingvvulcani.com](https://ingvvulcani.com/2026/08/22/etna-la-calda-estate-del-2026/) |
| Story: Fissure activity on the Voragine, seen from Pizzi Deneri | Stefano Branca, INGV-Osservatorio Etneo (Figura 3) | CC BY-ND 4.0 (INGVvulcani blog licence) | [ingvvulcani.com](https://ingvvulcani.com/2026/08/22/etna-la-calda-estate-del-2026/) |

### Flores Sea M7.8 earthquake, Indonesia (`flores-quake`)

| What | Credit | Licence | Source |
|---|---|---|---|
| NISAR ground motion and coherence | NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC | free and open (NASA Earth science data policy) | [search.asf.alaska.edu](https://search.asf.alaska.edu) |
| Optical imagery (draped ground) | Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search | Copernicus Sentinel data terms (free and open, with attribution) | [earth-search.aws.element84.com](https://earth-search.aws.element84.com/v1) |
| Story: Ground cracks spouting hot water at Tonggurambang | Albert Aquinaldo / TribunFlores.com | news, link only | [flores.tribunnews.com](https://flores.tribunnews.com/nagekeo/63995/warga-nagekeo-panik-air-panas-menyembur-dari-retakan-tanah-usai-gempa-flores-ntt) |
| Establishing shot (not of the event): Kota Mbay, Nagekeo, Flores, NTT.jpg | Ignas Kunda | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Kota_Mbay,_Nagekeo,_Flores,_NTT.jpg) |
| Story: Five houses wrecked in Aeramo, Dusun V | Arkadius Togo / FloresPos.net | news, link only | [florespos.net](https://florespos.net/2026/08/15/gempa-guncang-nagekeo-5-rumah-rusak-berat-warga-aeramo-mengungsi-ke-gunung/) |
| Establishing shot (not of the event): Bukit Weworowet Mbay-Nagekeo.jpg | Novia Aziza | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Bukit_Weworowet_Mbay-Nagekeo.jpg) |
| Story: Tsunami hits a 356-pupil scout camp on the beach at Kota Jogo, Anakoli | Vokal Publika | news, link only | [vokalpublika.com](https://vokalpublika.com/tangisan-di-bibir-pantai-kota-jogo-kepanikan-saat-gempa-menghentikan-kegiatan-pramuka/) |
| Establishing shot (not of the event): PANTAI KOTAJOGO.jpg | Niko Segu Do | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:PANTAI_KOTAJOGO.jpg) |
| Story: Degalea, on the south coast: 60 houses and two schools heavily damaged | Ekora NTT | news, link only | [ekorantt.com](https://ekorantt.com/2026/08/18/puluhan-rumah-warga-dan-fasilitas-umum-di-pelosok-nagekeo-rusak-berat-dampak-gempa/) |
| Establishing shot (not of the event): Foto budaya Nagekeo.jpg | Yohanes Jawa | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Foto_budaya_Nagekeo.jpg) |
| Story: RSUD Ende: patients moved into tents as a precaution | Seraphinus Sandi Hayon Jehadu, Ihsanuddin / Kompas.com | news, link only | [regional.kompas.com](https://regional.kompas.com/read/2026/08/15/230008578/gempa-ntt-15-pasien-dan-5-bayi-dirawat-di-tenda-darurat-rsud-ende) |
| Establishing shot (not of the event): Penampakan Gunung Meja, Ende..jpg | Pravda V. Wardhana | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Penampakan_Gunung_Meja,_Ende..jpg) |

### Fuego eruption, Guatemala (`fuego-eruption`)

| What | Credit | Licence | Source |
|---|---|---|---|
| NISAR ground motion and coherence | NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC | free and open (NASA Earth science data policy) | [search.asf.alaska.edu](https://search.asf.alaska.edu) |
| Optical imagery (draped ground) | Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search | Copernicus Sentinel data terms (free and open, with attribution) | [earth-search.aws.element84.com](https://earth-search.aws.element84.com/v1) |
| Story: Pyroclastic flows down the Taniluyá barranca, beside Panimaché and Morelia | INSIVUMEH, Sección de Vulcanología | Guatemalan government agency report; text cited, no image used | [insivumeh.gob.gt](https://insivumeh.gob.gt/actualizacion-de-la-actividad-del-volcan-de-fuego-hoy-04-de-agosto/) |
| Establishing shot (not of the event): Sunrise over the clouds on Acatenango.jpg | Bex Walton | CC BY 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Sunrise_over_the_clouds_on_Acatenango.jpg) |
| Story: Panimaché I and II: ash on the roofs, families evacuated, homes standing | Rolando Alvarado / La Hora | news, link only | [lahora.gt](https://lahora.gt/nacionales/ralvarado/2026/08/04/erupcion-volcan-de-fuego-patrullas-de-rescate-evacuan-a-familias-de-panimache-i-y-ii-y-morelia/) |
| Establishing shot (not of the event): Up early to watch the sunrise over Fuego from Acatenango summit.jpg | Bex Walton | CC BY 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Up_early_to_watch_the_sunrise_over_Fuego_from_Acatenango_summit.jpg) |
| Story: Morelia: ashfall and evacuation, no flow damage | Rolando Alvarado / La Hora | news, link only | [lahora.gt](https://lahora.gt/nacionales/ralvarado/2026/08/04/erupcion-volcan-de-fuego-patrullas-de-rescate-evacuan-a-familias-de-panimache-i-y-ii-y-morelia/) |
| Establishing shot (not of the event): It was cloudy when we arrived but Fuego showed its face from time to time.jpg | Bex Walton | CC BY 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:It_was_cloudy_when_we_arrived_but_Fuego_showed_its_face_from_time_to_time.jpg) |
| Story: El Porvenir: preventive evacuation on the west flank | The Watchers; La Hora | news, link only | [watchers.news](https://watchers.news/2026/08/04/) |
| Establishing shot (not of the event): Guatemala 2024 10.jpg | Iro Bosero | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Guatemala_2024_10.jpg) |
| Story: Barranca Las Lajas: flows down the southeast flank | IFRC GO field report / Cruz Roja Guatemalteca, via ReliefWeb | ReliefWeb/IFRC report; text cited, no image used | [reliefweb.int](https://reliefweb.int/report/guatemala/gtm-erupcion-volcanica-08-2026-actividad-volcan-fuego-guatemala-2026-08-05) |
| Establishing shot (not of the event): 200904-volcanes-luna.jpg | Luisfi | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:200904-volcanes-luna.jpg) |

### Kumamoto M6.8 earthquake, Japan (`kumamoto-quake`)

| What | Credit | Licence | Source |
|---|---|---|---|
| NISAR ground motion and coherence | NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC | free and open (NASA Earth science data policy) | [search.asf.alaska.edu](https://search.asf.alaska.edu) |
| Optical imagery (draped ground) | Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search | Copernicus Sentinel data terms (free and open, with attribution) | [earth-search.aws.element84.com](https://earth-search.aws.element84.com/v1) |
| Story: Fault offset 94 cm across the playground of Ryuho Elementary School | Akai, Ota, Maruyama, Yoshimi, Azuma, Ninomiya / AIST Geological Survey of Japan (photo 10, 第5報) | GSJ Terms of Use (CC BY 4.0 compatible) | [gsj.jp](https://www.gsj.jp/hazards/earthquake/kumamoto2026/kumamoto2026-02.html) |
| Story: Yatsushiro Shrine (Myoken-gu) torn by the fault: approach path offset 95 cm | Katorisi / Wikimedia Commons (gate photo); offset figures from AIST GSJ photo 12 (https://www.gsj.jp/hazards/earthquake/kumamoto2026/images/kumamoto2026-19.png) | CC BY-SA 4.0 (Commons photo); GSJ photo: GSJ Terms of Use (CC BY 4.0 compatible) | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Damage_to_the_sacred_gate_(shinmon)_of_Myoken-gu,_caused_by_the_2026_Kumamoto_Earthquake._Yatsushiro_City,_Japan.jpg) |
| Story: Expressway viaduct dropped where the rupture passes under Myoken Daiichi Bridge (Yatsushiro JCT) | Katorisi / Wikimedia Commons; MLIT closure photo also on Commons (File:Minami Kyushu Expwy Broken Bridge after 2026 Kumamoto Earthquake (Yatsushiro JCT - Yatsushiro Minami IC).png, CC BY 4.0, 国土交通省) | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Minami-Kyushu_Expressway,_Myoken_Dai-ichi_Bridge_northbound,_damage_from_the_2026_Kumamoto_earthquake,_and_the_cracks_in_the_surrounding_area._Yatsushiro_City,_Japan.jpg) |
| Story: Nippon Paper Yatsushiro mill: chimney collapse killed nine, 2 km off the fault | 国土地理院 (Geospatial Information Authority of Japan) via Wikimedia Commons; ground rescue photo: 総務省消防庁 (File:Rescue at NPI Yatsushiro Plant (2026 Kumamoto Earthquake).jpg, CC BY 4.0) | Attribution (GSI, per Commons) | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Aerial_photograph_of_the_Nippon_Paper_Industries_Yatsushiro_Plant,_which_collapsed_due_to_the_2026_Kumamoto_earthquake._Taken_on_July_29,_2026.jpg) |
| Story: AEON Mall Kumamoto: second floor collapsed with ~3,000 shoppers inside | 総務省消防庁 (Fire and Disaster Management Agency) via Wikimedia Commons; also JGSDF photo File:20260730 JGSDF Officers in AEON Mall Kumamoto after Earthquake.jpg (CC BY 4.0, 防衛省) | CC BY 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Rescue_at_AEON_Mall_Kumamoto_(2026_Kumamoto_Earthquake).jpg) |
| Story: Kumamoto Castle: Nishi-demaru stone walls down again, 13 km from the rupture | Katorisi / Wikimedia Commons | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Stone_walls_of_the_Nishi-demaru_of_Kumamoto_Castle_that_collapsed_due_to_the_2026_Kumamoto_Earthquake._Kumamoto_City,_Japan.jpg) |
| Story: AEON Mall Uki: ceiling collapse right where NISAR's step crosses Ogawa | Wikipedia (text); AIST GSJ 第6報 https://www.gsj.jp/hazards/earthquake/kumamoto2026/kumamoto2026-03.html | no image found | [en.wikipedia.org](https://en.wikipedia.org/wiki/2026_Kumamoto_earthquake) |
| Establishing shot (not of the event): Kumamoto prefectural road route 014, Uki, Matsubase.jpg | 運動会プロテインパワー | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Kumamoto_prefectural_road_route_014,_Uki,_Matsubase.jpg) |
| Media: GSJ photo 3: 城南町鰐瀬 paddy over the 鰐瀬 trench, 23 cm | Source: Geological Survey of Japan web page (https://www.gsj.jp/hazards/earthquake/kumamoto2026/kumamoto2026-02.html), AIST GSJ 第5報 field photo | GSJ Terms of Use (CC BY 4.0 compatible) | [gsj.jp](https://www.gsj.jp/hazards/earthquake/kumamoto2026/kumamoto2026-02.html) |
| Media: 20260730 Track Damage of Kagoshima Line (Matsubase - Ogawa) | 国土交通省 | CC BY 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:20260730_Track_Damage_of_Kagoshima_Line_(Matsubase_-_Ogawa).jpg) |
| Media: 20260729 Inside AEON Mall Kumamoto Search and Rescue by Kumamoto Police (2026 Kumamoto Earthquake) | 警察庁 | CC BY 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:20260729_Inside_AEON_Mall_Kumamoto_Search_and_Rescue_by_Kumamoto_Police_(2026_Kumamoto_Earthquake).png) |

### Langtang ice-rock avalanche, Nepal (`langtang-avalanche`)

| What | Credit | Licence | Source |
|---|---|---|---|
| NISAR ground motion and coherence | NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC | free and open (NASA Earth science data policy) | [search.asf.alaska.edu](https://search.asf.alaska.edu) |
| Optical imagery (draped ground) | Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search | Copernicus Sentinel data terms (free and open, with attribution) | [earth-search.aws.element84.com](https://earth-search.aws.element84.com/v1) |
| Story: Syabrubesi from the air: the town on the terrace stands, the valley floor below it is grey debris | Onlinekhabar (aerial photo, published 31 Aug 2026) | news, link only | [english.onlinekhabar.com](https://english.onlinekhabar.com/syabrubesi-bhotekoshi-flood-photos.html) |
| Story: Upper Syabrubesi: houses on the terrace above the debris line survived | Onlinekhabar (aerial photo, published 31 Aug 2026) | news, link only | [english.onlinekhabar.com](https://english.onlinekhabar.com/syabrubesi-bhotekoshi-flood-photos.html) |
| Story: Timure: 'only six damaged houses remain standing' | The Kathmandu Post (third-party photo) | news, link only | [kathmandupost.com](https://kathmandupost.com/national/2026/09/16/the-august-26-floods-wiped-timure-off-the-map) |
| Story: CCTV: the flood hits Gyirong Port at the border crossing | CCTV footage, unknown author, via Wikimedia Commons | Public domain (as tagged on Commons) | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Mudslide_at_Gyirong_Port_2_(screenshot).png) |
| Story: Ghattekhola: settlement, immigration office and Rasuwagadhi hydro site 'disappeared' | The Kathmandu Post | news, link only | [kathmandupost.com](https://kathmandupost.com/national/2026/09/16/the-august-26-floods-wiped-timure-off-the-map) |
| Establishing shot (not of the event): Customs office.JPG | Krish Dulal | CC BY-SA 3.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Customs_office.JPG) |
| Story: NH42 Trishuli Corridor road and suspension bridge between Syabrubesi and Timure (before) | Curt1us / Wikimedia Commons | CC BY 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:NH42_Trishuli_Corridor_towards_Syaphru.jpg) |
| Story: Dhunche, the district HQ on the ridge, stayed out of the flood's path and became the access point | Photo: Rajivkilanashrestha / Wikimedia Commons (2016). Status: Hiking Nepal, 'Rasuwa Flooding Update', 6 Sep 2026 | CC BY-SA 4.0 (photo); story text news, link only | [hikingnepal.com](https://www.hikingnepal.com/rasuwa-flood-august-2026-current-status-of-langtang-gosaikunda-and-tamang-heritage-routes) |

### Little Giant Fire, Washington (`little-giant-fire`)

| What | Credit | Licence | Source |
|---|---|---|---|
| NISAR radar backscatter | NISAR L2 GCOV (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC: 5 passes, track 71 | free and open (NASA Earth science data policy) | [search.asf.alaska.edu](https://search.asf.alaska.edu) |
| Optical imagery (draped ground) | Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search | Copernicus Sentinel data terms (free and open, with attribution) | [earth-search.aws.element84.com](https://earth-search.aws.element84.com/v1) |

### Mexico City subsidence (`mexico-city-subsidence`)

| What | Credit | Licence | Source |
|---|---|---|---|
| NISAR ground motion and coherence | NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC: 28 chained interferograms, track 19 | free and open (NASA Earth science data policy) | [search.asf.alaska.edu](https://search.asf.alaska.edu) |
| Optical imagery (draped ground) | Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search | Copernicus Sentinel data terms (free and open, with attribution) | [earth-search.aws.element84.com](https://earth-search.aws.element84.com/v1) |
| Story: A kilometre-long crack runs under homes on the Tláhuac / Valle de Chalco line | MILENIO | news, link only | [milenio.com](https://www.milenio.com/politica/comunidad/tlahuac-valle-chalco-enorme-grieta-afecta-calles-viviendas) |
| Story: Sierra de Santa Catarina: the volcanic ridge that doesn't sink | Crater_sp (Flickr), via Wikimedia Commons | CC BY-SA 2.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Iztapalapa_desde_el_cerro_de_la_Estrella.jpg) |
| Story: Templo de la Santísima Trinidad: a church now below street level | LBM1948, via Wikimedia Commons | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Ciudad_de_M%C3%A9xico,_edificios_1986_01.jpg) |
| Story: The Metropolitan Cathedral, sinking unevenly into the lake-bed | ProtoplasmaKid, via Wikimedia Commons; text: en.wikipedia 'Mexico City Metropolitan Cathedral' | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Catedral_Metropolitana_de_la_Ciudad_de_M%C3%A9xico_1.jpg) |
| Story: Ángel de la Independencia: 14 steps added as the ground fell away | Diego Delso, via Wikimedia Commons; text: en.wikipedia 'Angel of Independence' | CC BY-SA 3.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Monumento_a_la_Independencia,_M%C3%A9xico_D.F.,_M%C3%A9xico,_2014-10-13,_DD_19.JPG) |
| Story: Ciudad Universitaria on the Pedregal lava: the stable south | ProtoplasmaKid, via Wikimedia Commons; text: es.wikipedia 'Ciudad Universitaria (UNAM)' | CC BY-SA 3.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Ciudad_Universitaria_UNAM_-_Torre_de_Rector%C3%ADa_-_1.jpg) |
| Media: Inclinada - panoramio | Carlos Perez Chavez | CC BY-SA 3.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Inclinada_-_panoramio.jpg) |
| Media: Muestra del hundimiento de la Ciudad de México | User:Gengiskanhg | CC BY-SA 3.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Muestra_del_hundimiento_de_la_Ciudad_de_M%C3%A9xico.jpeg) |

### Azuero M7.7 earthquake, Panama (`panama-quake`)

| What | Credit | Licence | Source |
|---|---|---|---|
| NISAR ground motion and coherence | NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC | free and open (NASA Earth science data policy) | [search.asf.alaska.edu](https://search.asf.alaska.edu) |
| Optical imagery (draped ground) | Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search | Copernicus Sentinel data terms (free and open, with attribution) | [earth-search.aws.element84.com](https://earth-search.aws.element84.com/v1) |
| Story: Búcaro: the ground split 1–1.2 m sideways and 1 m up; the road 'lifted two to three metres' | La Prensa (Panamá), photos Alexander Arosemena; La Estrella de Panamá https://www.laestrella.com.pa/panama/nacional/terremoto-hundio-30-centimetros-de-isla-canas-de-acuerdo-a-estudios-preliminares-MB26639225; OCHA SitRep 3 https://reliefweb.int/report/panama/panama-earthquake-azuero-veraguas-situation-report-no-03-12-october-2026-1430 | news, link only | [prensa.com](https://www.prensa.com/sociedad/secuelas-del-terremoto-la-grieta-de-bucaro-el-dilema-de-isla-canas-y-el-resurgir-de-la-colorada/) |
| Establishing shot (not of the event): Entrada de Pocri de Los Santos.jpg | Villalaso | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Entrada_de_Pocri_de_Los_Santos.jpg) |
| Story: Tonosí: hotel collapsed; patients treated in tents | U.S. Army photo by Pfc. Carolyn Dodge (Commons); TVN https://www.tvn-2.com/nacionales/temblor-panama-tonosi-enfrenta-perdidas_1_2266543.html | Public domain (US Government) | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:U_S_Ambassador_to_Panama_Visits_Tonosi_Panama_to_Deliver_Food_and_Supplies_(10038246).jpg) |
| Story: El Cacao: a resident in front of his earthquake-damaged home | World Central Kitchen (Flickr) via Wikimedia Commons | CC BY 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Afectado_por_el_terremoto_de_Panam%C3%A1_en_El_Cacao.jpg) |
| Story: Isla Cañas sank 15–30 cm and was cut in two by the sea | La Estrella de Panamá; La Prensa (Ohigginis Arcia Jaramillo) | news, link only | [laestrella.com.pa](https://www.laestrella.com.pa/panama/nacional/terremoto-hundio-30-centimetros-de-isla-canas-de-acuerdo-a-estudios-preliminares-MB26639225) |
| Establishing shot (not of the event): Escuela presidente porras.jpg | Maria Maarbes | CC BY-SA 3.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Escuela_presidente_porras.jpg) |
| Story: Macaracas: a 68-year-old woman killed by a collapsing wall, far from the rupture | Wikipedia (citing Panamanian press) | no image found | [en.wikipedia.org](https://en.wikipedia.org/wiki/2026_Panama_earthquake) |
| Story: Río Oria bridge closed: residents carry supplies across on foot | Telemetro Reporta | news, link only | [telemetro.com](https://www.telemetro.com/nacionales/cierran-puente-el-rio-oria-pedasi-danos-estructurales-terremoto-n6095089) |
| Establishing shot (not of the event): Playa en pedasi destiladeros.jpg | Villarrealjj24 | CC BY 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Playa_en_pedasi_destiladeros.jpg) |
| Story: Las Tablas: the provincial hospital stayed fit to treat patients while Tonosí's was shut | TVN (Panamá); OPS/OMS https://www.paho.org/es/noticias/17-10-2026-ops-apoya-continuidad-atencion-tonosi-tras-terremoto-panama | news, link only | [tvn-2.com](https://www.tvn-2.com/nacionales/temblor-panama-instalaciones-salud-afectadas-cocle-chitre-lastablas_1_2265992.html) |
| Establishing shot (not of the event): Parque Belisario Porras Barahona, popularmente llamado Parque Porras, Ciudad de Las Tablas, Provincia de Los Santos, República de Panamá. (2025).jpg | SportingVVE | CC0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Parque_Belisario_Porras_Barahona,_popularmente_llamado_Parque_Porras,_Ciudad_de_Las_Tablas,_Provincia_de_Los_Santos,_Rep%C3%BAblica_de_Panam%C3%A1._(2025).jpg) |
| Story: Cañas: the mainland village took in the families from the island that sank | OPS/OMS (Pan American Health Organization) | news, link only | [paho.org](https://www.paho.org/es/noticias/17-10-2026-ops-apoya-continuidad-atencion-tonosi-tras-terremoto-panama) |
| Establishing shot (not of the event): Camino para Isla Caña.jpg | Ayaita | CC BY-SA 3.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Camino_para_Isla_Ca%C3%B1a.jpg) |
| Story: Cambutal: across the fault from Tonosí, considered as a place to move Tonosí's patients | TVN (Panamá) | news, link only | [tvn-2.com](https://www.tvn-2.com/nacionales/temblor-panama-instalaciones-salud-afectadas-cocle-chitre-lastablas_1_2265992.html) |
| Establishing shot (not of the event): PuebloCambutal Los Santos Panama 07.jpg | Ayaita | CC BY-SA 3.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:PuebloCambutal_Los_Santos_Panama_07.jpg) |

### Yaracuy M7.2 + M7.5 doublet, Venezuela (`venezuela-quake`)

| What | Credit | Licence | Source |
|---|---|---|---|
| NISAR ground motion and coherence | NISAR L2 GUNW (provisional), NASA/JPL-Caltech/ISRO, via ASF DAAC | free and open (NASA Earth science data policy) | [search.asf.alaska.edu](https://search.asf.alaska.edu) |
| Optical imagery (draped ground) | Contains modified Copernicus Sentinel-2 data (ESA), via Element 84 Earth Search | Copernicus Sentinel data terms (free and open, with attribution) | [earth-search.aws.element84.com](https://earth-search.aws.element84.com/v1) |
| Story: Las Colinas de Morón: 16 houses fell, two women killed, 250 families sleeping outside | Dayrí Blanco / El Carabobeño (photos courtesy of residents) | news, link only | [diariodelosandes.com](https://diariodelosandes.com/carabobo-16-viviendas-colapsaron-en-las-colinas-de-moron-y-250-familias-siguen-sin-volver-a-sus-casas/) |
| Establishing shot (not of the event): Moron, edo. Carabobo.JPG | Eduardo Bonet | CC BY-SA 3.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Moron,_edo._Carabobo.JPG) |
| Story: La Mar Suites, Tucacas: beachfront block collapsed, 12 dead | El Nacional / El Carabobeño | news, link only | [elnacional.com](https://www.elnacional.com/2026/06/hallan-12-cuerpos-entre-los-escombros-de-edificio-colapsado-en-tucacas/) |
| Establishing shot (not of the event): Tucacas, Estado Falcon, Venezuela..jpeg | Maria Gracia Quintero | CC BY-SA 3.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Tucacas,_Estado_Falcon,_Venezuela..jpeg) |
| Story: Boca de Aroa: sand and water boiled up through cracks during the shaking | GEER-087 report (Cabas, Sancio et al.), citing StEER (2026) DesignSafe PRJ-6380 | report, link only | [geerassociation.org](https://geerassociation.org/?view=geerreports&id=117&layout=default) |
| Establishing shot (not of the event): Amanecer en las playas de boca de aroa.jpg | Maria e. villegas | CC BY-SA 3.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Amanecer_en_las_playas_de_boca_de_aroa.jpg) |
| Story: Pueblo Farriar: a 380 m crack opened along the river bank | GEER Association, GEER-087 report (A. Cabas, J. Perri, R. B. Sancio, eds.; doi:10.18118/G6S95Q), Fig. 11-16a; photo R. Mata, E. Núñez et al. | GEER report figure; pixelated preview, link to source | [geerassociation.org](https://geerassociation.org/?view=geerreports&id=117) |
| Story: San Felipe: 13 homes heavily damaged, yet NISAR barely moved | Wikipedia | no image found | [en.wikipedia.org](https://en.wikipedia.org/wiki/2026_Venezuela_earthquakes) |
| Establishing shot (not of the event): Avenida Caracas - San Felipe.jpg | Daniel Doffiny | CC BY-SA 4.0 | [commons.wikimedia.org](https://commons.wikimedia.org/wiki/File:Avenida_Caracas_-_San_Felipe.jpg) |

<!-- credits:end -->
