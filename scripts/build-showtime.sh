#!/usr/bin/env bash
# Build the pinned ShowTime simulator framework outside the repository.
set -euo pipefail

REV=8fdd276e8cbf7281d6bb372e7caf990397d3c2e9
PATCH_ID=brief-indicators-v1
CACHE="${PRAY_VIDEO_SCRATCH_ROOT:?Set PRAY_VIDEO_SCRATCH_ROOT outside the repository}/tools/showtime-${REV}-${PATCH_ID}"
SOURCE="$CACHE/source"
DERIVED="$CACHE/derived"
FRAMEWORK="$DERIVED/Build/Products/Release-iphonesimulator/PackageFrameworks/ShowTime.framework/ShowTime"

if [ ! -d "$SOURCE/.git" ]; then
  mkdir -p "$CACHE"
  git clone https://github.com/KaneCheshire/ShowTime.git "$SOURCE" >&2
  git -C "$SOURCE" checkout --detach "$REV" >&2
fi
[ "$(git -C "$SOURCE" rev-parse HEAD)" = "$REV" ] || { echo "ShowTime cache has an unexpected revision" >&2; exit 1; }

if [ ! -f "$FRAMEWORK" ]; then
  python3 - "$SOURCE/Package.swift" "$SOURCE/Sources/ShowTime/ShowTime.swift" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text()
original = '.library(name: "ShowTime", targets: ["ShowTime"])'
dynamic = '.library(name: "ShowTime", type: .dynamic, targets: ["ShowTime"])'
if original in source:
    path.write_text(source.replace(original, dynamic, 1))
elif dynamic not in source:
    raise SystemExit("Unexpected ShowTime package manifest")

# Keep the pinned upstream revision, but shorten the indicator after touch-up.
path = Path(sys.argv[2])
source = path.read_text()
patches = {
    '@objc public static var disappearDelay: TimeInterval = 0.2':
        '@objc public static var disappearDelay: TimeInterval = 0.0',
    'UIView.animate(withDuration: 0.2, delay: ShowTime.disappearDelay':
        'UIView.animate(withDuration: 0.08, delay: ShowTime.disappearDelay',
}
for original, replacement in patches.items():
    if original in source:
        source = source.replace(original, replacement, 1)
    elif replacement not in source:
        raise SystemExit(f'Unexpected ShowTime source: {original}')
path.write_text(source)
PY
  if ! (cd "$SOURCE" && xcodebuild -scheme ShowTime -configuration Release \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO build > "$CACHE/build.log" 2>&1); then
    tail -40 "$CACHE/build.log" >&2
    exit 1
  fi
fi
[ -f "$FRAMEWORK" ] || { echo "ShowTime framework was not produced" >&2; exit 1; }
printf '%s\n' "$FRAMEWORK"
