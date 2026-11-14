#!/bin/sh
# Headless render check: scripts/shot.sh <url-path> <out.png> [height]
# Renders the page with software WebGL and saves a screenshot. Used before each push.
URL="http://localhost:${PORT:-8770}/$1"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-proxy-server \
  --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1280,${3:-1400} \
  --virtual-time-budget=20000 --user-data-dir=$(mktemp -d) --screenshot="$2" "$URL" >/dev/null 2>&1
echo "$2"
