#!/bin/sh
cd "$(dirname "$0")"
port="${1:-8765}"
echo "Darkside test pages → http://127.0.0.1:${port}/"
python3 -m http.server "$port"
