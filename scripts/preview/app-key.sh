#!/usr/bin/env bash
# Computes the cache keys of a preview build.
#
# Usage: app-key.sh <ios|android> <variant> <tooling-dir> <app-dir> <app-sha> <env-hash>
#
# Prints "name=value" lines for $GITHUB_OUTPUT:
#   app_key   the key of the built app. It changes whenever anything that
#             changes the built app changes: the app commit, the lockfile, the
#             toolchain of the runner (Xcode and the iOS SDK, CocoaPods, or the
#             Java, SDK build tools and NDK), the build scripts of this
#             directory and the secret build values (as a hash).
#   deps_key  the key of the native dependency caches (CocoaPods, Xcode's
#             compilation cache). It changes with the inputs that produce the
#             Podfile: package-lock.json, app.json, plugins/, patches/,
#             modules/, the toolchain and the build scripts.
#   gradle_key the key of the Gradle caches (about 2.4 GB, the largest entry).
#             It follows the same inputs but neither the toolchain nor the
#             build scripts, so a change of a script does not write a new copy:
#             Gradle checks its own cache entries.
#   <variant> the same as app_key, so a job output can be named by variant (the
#             outputs of a matrix job are merged by name).
# A table of the components goes to $GITHUB_STEP_SUMMARY, so two runs show which
# input changed the key. No secret value is printed: <env-hash> is a hash made
# by the plan job from the secret values together.
set -euo pipefail
platform="${1:?platform}" variant="${2:?variant}" tooling="${3:?tooling-dir}" app="${4:?app-dir}"
sha="${5:?app-sha}" env_hash="${6:?env-hash}"
[[ "$platform" == ios || "$platform" == android ]] || { echo "Unknown platform: $platform" >&2; exit 2; }
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Not a full commit SHA: $sha" >&2; exit 2; }
[[ "$env_hash" =~ ^[0-9a-f]{32}$ ]] || { echo 'The env hash must be 32 hex digits.' >&2; exit 2; }

short() { shasum -a 256 | cut -c1-16; }
# files_digest <dir> <path>...: one digest over the names and contents of the files.
files_digest() {
  local dir="$1" path existing=()
  shift
  # An older commit may lack a path (for example modules/).
  for path in "$@"; do [[ -e "$dir/$path" ]] && existing+=("$path"); done
  (cd "$dir" && find "${existing[@]}" -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 | short)
}

build_scripts=(env.sh xcode-cache-env.sh app-key.sh build-android.sh ios-prebuild.sh ios-pods.sh ios-build.sh ios-boot.sh)
scripts_digest="$(
  cd "$tooling/scripts/preview"
  for f in "${build_scripts[@]}"; do [[ -f "$f" ]] && echo "$f"; done | xargs shasum -a 256 | short
)"
lock_digest="$(files_digest "$app" package-lock.json)"
inputs_digest="$(files_digest "$app" package-lock.json app.json plugins patches modules)"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$platform" == ios ]]; then
  toolchain="$(printf '%s; iphonesimulator SDK %s; CocoaPods %s; %s; node %s' \
    "$(xcodebuild -version | tr '\n' ' ')" "$(xcrun --sdk iphonesimulator --show-sdk-version)" \
    "$(pod --version)" "$(uname -m)" "$node_major")"
else
  sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
  toolchain="$(printf 'java %s; build-tools %s; ndk %s; cmake %s; %s; node %s' \
    "$(java -version 2>&1 | head -1)" "$(ls "$sdk/build-tools" | tr '\n' ',')" \
    "$(ls "$sdk/ndk" 2>/dev/null | tr '\n' ',')" "$(ls "$sdk/cmake" 2>/dev/null | tr '\n' ',')" \
    "$(uname -m)" "$node_major")"
fi
toolchain_digest="$(printf '%s' "$toolchain" | short)"

app_digest="$(printf 'app-key v1\n%s\n%s\n%s\n%s\n%s\n%s\n' "$platform" "$sha" "$lock_digest" "$toolchain_digest" "$scripts_digest" "$env_hash" | short)"
deps_digest="$(printf 'deps-key v1\n%s\n%s\n%s\n%s\n' "$platform" "$inputs_digest" "$toolchain_digest" "$scripts_digest" | short)"
app_key="preview-app-$platform-$sha-$app_digest"
deps_key="preview-deps-$platform-$deps_digest"
gradle_key="preview-gradle-$platform-$inputs_digest"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "#### App cache key: $platform $variant"
    echo
    echo '| Component | Value |'
    echo '| --- | --- |'
    echo "| app commit | \`$sha\` |"
    echo "| lockfile | \`$lock_digest\` |"
    echo "| toolchain | $toolchain (\`$toolchain_digest\`) |"
    echo "| build scripts | \`$scripts_digest\` |"
    echo "| secret build values (hash) | \`${env_hash:0:12}\` |"
    echo "| app key | \`$app_key\` |"
    echo "| dependency key | \`$deps_key\` |"
    echo "| Gradle key | \`$gradle_key\` |"
    echo
  } >>"$GITHUB_STEP_SUMMARY"
fi
{
  echo "app_key=$app_key"
  echo "deps_key=$deps_key"
  echo "gradle_key=$gradle_key"
  echo "$variant=$app_key"
}
