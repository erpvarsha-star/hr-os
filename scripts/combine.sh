#!/bin/sh
# Regenerates deploy/HR_OS.gs (single paste-in file) from apps-script/*.gs
set -e
cd "$(dirname "$0")/.."
mkdir -p deploy
# The version line is the date plus the git short hash of HEAD at combine time, i.e. the commit BEFORE the one that
# contains the combined file. That is acceptable: it still identifies the source the file was built from.
VERSION="$(date +%Y-%m-%d) $(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
{ echo "var HROS_VERSION = '$VERSION';"
  echo "// VFL HR OS — combined Apps Script (generated from apps-script/*.gs; do not edit here)"
  for f in $(ls apps-script/*.gs | sort); do echo; echo "// ===== $(basename "$f") ====="; cat "$f"; done; } > deploy/HR_OS.gs
cp apps-script/appsscript.json deploy/appsscript.json
