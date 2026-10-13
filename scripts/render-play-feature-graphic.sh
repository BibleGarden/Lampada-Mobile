#!/bin/zsh
# Рендер графики Google Play через headless Chrome:
# feature graphic 1024x500 из store/play/feature-graphic.html на каждый язык — PNG без альфы
# (Play требует 24-bit; альфа снимается через BMP), и иконка 512x512 из assets/icon.png —
# 32-bit PNG с альфой, как требует Play.
# Headless Chrome сохраняет скриншот, но не завершается сам, поэтому ждём файл и гасим процесс.
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
# jimp-compact приходит с Expo (@expo/image-utils) и пишет PNG как RGBA.
node -e "require('jimp-compact').read(process.argv[1]).then(i => i.resize(512, 512).writeAsync(process.argv[2]))" \
  $ROOT/assets/icon.png $ROOT/store/play/icon-512.png
sips -g pixelWidth -g pixelHeight -g hasAlpha $ROOT/store/play/feature-graphic-*.png $ROOT/store/play/icon-512.png
