# Credits for the lab pages (`/lab/`)

These pages are experiments. Everything credited in the main [CREDITS.md](../../CREDITS.md) is used here under the same terms
(NISAR data, Sentinel-2 imagery, the elevation data, the story and photo sources, the software and the AI statement).

What the lab adds:

- **Map data © OpenStreetMap contributors**, available under the [Open Database Licence (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).
  Roads, railways, rivers, canals, coastlines and place names in `site/lab/data/<event>/basemap.json` were taken from
  [OpenStreetMap](https://www.openstreetmap.org/copyright) through the [Overpass API](https://overpass-api.de/), simplified, and converted to
  positions on each event's grid. The files are a derived database under the ODbL: anyone reusing them must credit OpenStreetMap
  contributors and keep the same licence for the derived data. Every lab page carries the line "© OpenStreetMap contributors".
- **Field-survey offsets** (Kumamoto) in `line.json`: Geological Survey of Japan (GSJ, AIST), 2026 Kumamoto earthquake field photos, as
  listed in `research/media/seeds/kumamoto-quake.json`.
- **Relief shading** (`hillshade.png`) is computed from the elevation layer already published with each event.

NISAR data are provisional. Nothing here is an official product of NASA, ISRO or the Geological Survey of Japan.
