#!/bin/sh
# Regenerates deploy/HR_OS.gs (single paste-in file) from apps-script/*.gs
set -e
cd "$(dirname "$0")/.."
mkdir -p deploy
{ echo "// VFL HR OS — combined Apps Script (generated from apps-script/*.gs; do not edit here)"
  for f in $(ls apps-script/*.gs | sort); do echo; echo "// ===== $(basename "$f") ====="; cat "$f"; done; } > deploy/HR_OS.gs
cp apps-script/appsscript.json deploy/appsscript.json
