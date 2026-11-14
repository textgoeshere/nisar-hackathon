# nisar-hackathon: visualize and contextualize world events with NISAR L-band (NASA/ISRO) radar data

Catastrophic natural or anthropogenic events that make the news affect individual humans in different ways. Our hypothesis is that the stories on the ground can be contextualized when you see them from orbit. Two homes in an earthquake: one destroyed and one survived; the space data shows the geophysical boundary between them that explains the difference.

## Outline plan

1. Breadth-first research for candidate news events that would show up in NISAR data (based on type and timeframe)
2. Rank and filter candidate events for NISAR before/after coverage

Pick one event to test the hypothesis. Expect the hypothesis is most likely to succeed where the event leaves a sharp boundary in the ground: faults, subsidence edges, debris channels, lava fronts, e.g. Kumamoto.

Run the following steps e2e for that event:
 
3. Ingest and process (clean and classify) the relevant data
4. Build 3d visualization
5. Research and generate candidate geo-located ground media & stories
6. Implement basic human editorial layer for (5) to select final media & stories
7. Integrate all the pieces

Ship POC by EOD Saturday latest.
Repeat for the other events.

8. Polish, ship, repeat

Complete submission by 12pm Sunday latest.

**Stretch goal: data-driven anomaly detection**

## Method, step by step

Each step is documented from first principles, with the commands to reproduce it:

1. [Discover candidate events](docs/1-discover.md)
2. [Rank by NISAR coverage](docs/2-coverage.md)

## Run

```sh
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pipeline.coverage          # step 2: CMR search, no login needed
cd site && python3 -m http.server 8000         # open http://localhost:8000
```

Reading NISAR data (step 3 onward) needs a free [Earthdata Login](https://urs.earthdata.nasa.gov) bearer token in `EARTHDATA_TOKEN`.

