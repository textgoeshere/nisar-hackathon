#!/bin/bash
# Regenerates site/lab/atlas/shots/ (needs the site served on 127.0.0.1:8781 and Google Chrome). Run from the repository root.
set -e
export NO_PROXY=127.0.0.1 NODE_USE_ENV_PROXY=0
S=pipeline/lab/atlas/shoot.mjs; O=site/lab/atlas/shots; U=http://127.0.0.1:8781/lab/atlas/
mkdir -p $O
cut_of() { case $1 in kumamoto-quake) echo site-gsj-08;; mexico-city-subsidence) echo 1;; etna-eruption) echo 3;; esac; }
for e in kumamoto-quake mexico-city-subsidence etna-eruption; do
  c=$(cut_of $e)
  node $S --url "${U}?e=$e" --size 390x844 --dsf 1.5 --out $O/$e-phone.jpg
  node $S --url "${U}?e=$e" --size 1280x900 --dsf 1 --out $O/$e-laptop.jpg
  node $S --url "${U}?e=$e&cut=$c" --size 1280x900 --dsf 1 --out $O/$e-laptop-cut.jpg
  node $S --url "${U}?e=$e&cut=$c" --size 390x844 --dsf 1.5 --out $O/$e-phone-cut.jpg
  echo "[{\"scroll\":0},{\"eval\":\"document.querySelector('#section').scrollIntoView({block:'start'}); 1\"},{\"wait\":500},{\"shot\":\"$O/$e-phone-section.jpg\"}]" > /tmp/atlas-section-steps.json
  node $S --url "${U}?e=$e&cut=$c" --size 390x844 --dsf 1.5 --actions /tmp/atlas-section-steps.json
  node $S --url "${U}?e=$e&view=scene" --size 390x844 --dsf 1.5 --out $O/$e-phone-scene.jpg
done
