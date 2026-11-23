#!/bin/zsh
# Render Google Play graphics with headless Chrome:
# a 1024x500 feature graphic from store/play/feature-graphic.html per language — PNG without alpha
# (Play requires 24-bit; alpha is stripped via BMP), and a 512x512 icon from assets/icon.png —
# a 32-bit PNG with alpha, as Play requires.
# Headless Chrome writes the screenshot but never exits on its own, so wait for the file and kill the process.
set -euo pipefail
ROOT=${0:A:h:h}
HTML=$ROOT/store/play/feature-graphic.html
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[[ -x $CHROME ]] || { echo "Google Chrome not found at $CHROME" >&2; exit 1; }
WORK=$(mktemp -d)
trap 'rm -rf $WORK' EXIT
shot() { # shot <url> <width> <height> <out>
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --user-data-dir=$WORK/profile --allow-file-access-from-files \
    --window-size=$2,$3 --virtual-time-budget=3000 --screenshot=$4 "$1" >/dev/null 2>&1 &
  local pid=$!
  for i in {1..60}; do [[ -s $4 ]] && break; sleep 0.5; done
  sleep 1
  kill $pid 2>/dev/null || true
  wait $pid 2>/dev/null || true
  [[ -s $4 ]] || { echo "Chrome produced no screenshot for $1" >&2; exit 1; }
}
for lang in ru uk en; do
  raw=$WORK/raw-$lang.png
  shot "file://$HTML?lang=$lang" 1024 500 $raw
  sips -s format bmp $raw --out $WORK/$lang.bmp >/dev/null
  sips -s format png $WORK/$lang.bmp --out $ROOT/store/play/feature-graphic-$lang.png >/dev/null
done
# jimp-compact ships with Expo (@expo/image-utils) and writes PNG as RGBA.
node -e "require('jimp-compact').read(process.argv[1]).then(i => i.resize(512, 512).writeAsync(process.argv[2]))" \
  $ROOT/assets/icon.png $ROOT/store/play/icon-512.png
sips -g pixelWidth -g pixelHeight -g hasAlpha $ROOT/store/play/feature-graphic-*.png $ROOT/store/play/icon-512.png
