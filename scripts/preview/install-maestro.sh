#!/usr/bin/env bash
# Installs the pinned Maestro CLI (the version the repository's flows are
# tested with, see testing/README.md) and puts it on PATH for later steps.
set -euo pipefail
version=2.10.0
sha256=29b675e10cc12080e445e9bfb2e2b4e4dfb9c0f2e30d5884120d258b5e1cd991
dir="${RUNNER_TEMP:?}/maestro-cli"
mkdir -p "$dir"
curl -fsSL -o "$dir/maestro.zip" "https://github.com/mobile-dev-inc/maestro/releases/download/cli-$version/maestro.zip"
echo "$sha256  $dir/maestro.zip" | shasum -a 256 -c -
(cd "$dir" && python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(".")' maestro.zip)
chmod +x "$dir/maestro/bin/maestro"
echo "$dir/maestro/bin" >> "${GITHUB_PATH:?}"
"$dir/maestro/bin/maestro" --version
