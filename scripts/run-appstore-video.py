#!/usr/bin/env python3
"""Build, seed, film, edit, and verify App Store previews in one invocation."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from appstore_video_keyboard import validate_fixture

ROOT = Path(__file__).resolve().parent.parent
DEVICE = "Lampada AppStore UK iPhone 17 Pro Max"
DEFAULT_SCRATCH = ROOT / "store/video/runs"
AXE_VERSION = "1.8.0"
MOCK_ENV = {"EXPO_NO_DOTENV": "1", "EXPO_PUBLIC_API_URL": "http://127.0.0.1:9086",
            "EXPO_PUBLIC_AI_PROXY_KEY": "video-preview-mock", "EXPO_PUBLIC_BUILD_CHANNEL": "test",
            "EXPO_PUBLIC_APPSTORE_VIDEO": "1"}
NATIVE_FINGERPRINT_FILE = "appstore-video-native.sha256"


class QualityGateFailure(RuntimeError):
    def __init__(self, reasons: list[str], metrics: dict | None = None,
                 duration_seconds: float | None = None):
        super().__init__("; ".join(reasons))
        self.reasons = reasons
        self.metrics = metrics
        self.duration_seconds = duration_seconds


def run(command: list[str], log: Path, env: dict[str, str] | None = None) -> str:
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("w") as output:
        result = subprocess.run(command, cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT)
    log.with_suffix(".exit").write_text(f"{result.returncode}\n")
    if result.returncode:
        lines = log.read_text().strip().splitlines()
        detail = lines[-1] if lines else "command produced no output"
        raise RuntimeError(f"{' '.join(command[:2])} exited {result.returncode}: {detail}; see {log}")
    return log.read_text().strip()


def source_hash() -> str:
    listed = subprocess.check_output(["git", "ls-files", "-co", "--exclude-standard", "-z"], cwd=ROOT)
    source_dirs = {"app", "assets", "components", "lib", "hooks", "contexts", "providers", "constants", "languages"}
    root_files = {"app.json", "app.config.js", "babel.config.js", "metro.config.js",
                  "package.json", "package-lock.json", "tsconfig.json"}
    paths = [Path(name.decode()) for name in listed.split(b"\0") if name]
    paths = [path for path in paths if path.parts[0] in source_dirs or str(path) in root_files
             or str(path) == "scripts/build-appstore-video-app.sh"]
    paths += [Path(name) for name in ("ios/Lampada/Info.plist", "ios/Lampada.xcodeproj/project.pbxproj")
              if (ROOT / name).is_file()]
    digest = hashlib.sha256()
    for path in sorted(set(paths)):
        if (ROOT / path).is_file():
            digest.update(str(path).encode() + b"\0")
            digest.update((ROOT / path).read_bytes())
    return digest.hexdigest()


def native_hash() -> str:
    """Fingerprint generated iOS sources and locked native dependencies."""
    ios = ROOT / "ios"
    if not (ios / "Lampada.xcworkspace").is_dir():
        raise RuntimeError("Native iOS workspace is missing after prebuild")
    paths = [path for path in ios.rglob("*") if path.is_file()
             and not any(part in {"Pods", "build", "DerivedData", "xcuserdata"}
                         for part in path.relative_to(ios).parts)
             and path.name != ".DS_Store"]
    paths += [ROOT / name for name in ("package.json", "package-lock.json", "app.json")]
    paths += [path for path in (ROOT / "modules").rglob("*") if path.is_file()]
    digest = hashlib.sha256()
    for path in sorted(set(paths)):
        if not path.is_file():
            raise RuntimeError(f"Native dependency input is missing: {path}")
        digest.update(str(path.relative_to(ROOT)).encode() + b"\0")
        digest.update(path.read_bytes())
    return digest.hexdigest()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def pipeline_hash() -> str:
    paths = [*sorted((ROOT / "scripts").glob("*appstore*")),
             ROOT / "scripts/build-showtime.sh", ROOT / "testing/e2e/sim-udid.sh",
             ROOT / "store/video/demo-content.json", ROOT / "store/video/pacing.json"]
    digest = hashlib.sha256()
    for path in paths:
        if path.is_file():
            digest.update(str(path.relative_to(ROOT)).encode() + b"\0")
            digest.update(path.read_bytes())
    return digest.hexdigest()


def preflight(work: Path, env: dict[str, str]) -> tuple[str, Path]:
    for name, hint in (("axe", "brew install cameroncooke/axe/axe"),
                       ("ffmpeg", "brew install ffmpeg"), ("ffprobe", "brew install ffmpeg"),
                       ("xcrun", "install Xcode"), ("xcodebuild", "install Xcode"),
                       ("npx", "install Node.js and run npm ci"), ("git", "install Git"),
                       ("grep", "install macOS command-line tools")):
        if shutil.which(name, path=env["PATH"]) is None:
            raise RuntimeError(f"Missing {name}; {hint}")
    if not (ROOT / "ios/Lampada.xcworkspace").is_dir():
        run(["npx", "expo", "prebuild", "--platform", "ios"],
            work / "preflight/prebuild.log", {**env, **MOCK_ENV})
        if not (ROOT / "ios/Lampada.xcworkspace").is_dir():
            raise RuntimeError("Expo prebuild completed without creating ios/Lampada.xcworkspace")
    version = run(["axe", "--version"], work / "preflight/axe.log")
    if version != AXE_VERSION:
        raise RuntimeError(f"AXe {AXE_VERSION} required, found {version!r}; see store/README.md")
    run(["python3", "scripts/appstore-video-mock.py", "--fixture", "store/video/demo-content.json",
         "--pacing", "store/video/pacing.json", "--validate"], work / "preflight/fixture.log")
    fixture = json.loads((ROOT / "store/video/demo-content.json").read_text())
    pacing = json.loads((ROOT / "store/video/pacing.json").read_text())
    ids = [item["capture"]["host_keyboard_layout"] for item in fixture["locales"].values()]
    output = run(["xcrun", "swift", "scripts/appstore-video-keyboard.swift", *ids],
                 work / "preflight/system-keyboard-layouts.log")
    system_layouts = json.loads(output.splitlines()[-1])
    keyboard_maps = {locale: system_layouts[item["capture"]["host_keyboard_layout"]]
                     for locale, item in fixture["locales"].items()}
    validate_fixture(fixture, keyboard_maps, pacing)
    keyboard_map = work / "preflight/keyboard-map.json"
    keyboard_map.write_text(json.dumps(keyboard_maps, ensure_ascii=False, indent=2) + "\n")
    showtime = Path(run(["bash", "scripts/build-showtime.sh"], work / "preflight/showtime.log", env).splitlines()[-1])
    if not showtime.is_file():
        raise RuntimeError(f"Pinned ShowTime binary missing: {showtime}")
    return str(showtime), keyboard_map


def installed_app(work: Path) -> Path | None:
    udid = run([str(ROOT / "testing/e2e/sim-udid.sh"), DEVICE], work / "preflight/simulator-id.log")
    state = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "-j"], text=True))
    devices = [item for group in state["devices"].values() for item in group if item["udid"] == udid]
    if len(devices) != 1:
        raise RuntimeError("Named App Store simulator is missing or ambiguous")
    if devices[0]["state"] == "Shutdown":
        run(["xcrun", "simctl", "boot", udid], work / "preflight/simulator-boot.log")
    elif devices[0]["state"] != "Booted":
        raise RuntimeError(f"Unexpected simulator state: {devices[0]['state']}")
    run(["xcrun", "simctl", "bootstatus", udid, "-b"], work / "preflight/simulator-ready.log")
    result = subprocess.run(["xcrun", "simctl", "get_app_container", udid, "twinkler", "app"],
                            capture_output=True, text=True)
    (work / "preflight/installed-app.exit").write_text(f"{result.returncode}\n")
    if result.returncode:
        return None
    path = Path(result.stdout.strip())
    if not (path / "main.jsbundle").is_file():
        raise RuntimeError("Installed app has no main.jsbundle")
    return path


def get_app(work: Path, scratch: Path, env: dict[str, str]) -> tuple[Path, float, str, bool]:
    start = time.monotonic()
    native = native_hash()
    (work / "expected-native.sha256").write_text(native + "\n")
    probe = work / "bundle-probe"
    probe.mkdir()
    run(["npx", "expo", "export:embed", "--platform", "ios", "--dev", "false",
         "--entry-file", "node_modules/expo-router/entry.js", "--bundle-output", str(probe / "main.jsbundle"),
         "--assets-dest", str(probe / "assets")], work / "bundle-probe.log", {**env, **MOCK_ENV})
    expected = sha256(probe / "main.jsbundle")
    (work / "expected-jsbundle.sha256").write_text(expected + "\n")
    installed = installed_app(work)
    if (installed and sha256(installed / "main.jsbundle") == expected
            and (installed / NATIVE_FINGERPRINT_FILE).is_file()
            and (installed / NATIVE_FINGERPRINT_FILE).read_text().strip() == native):
        return installed, time.monotonic() - start, "installed_reused", True
    fingerprint = hashlib.sha256((source_hash() + native).encode()).hexdigest()
    cache = scratch / "cache" / fingerprint
    app = cache / "Lampada-video-mock.app"
    if ((app / "main.jsbundle").is_file() and sha256(app / "main.jsbundle") == expected
            and (app / NATIVE_FINGERPRINT_FILE).is_file()
            and (app / NATIVE_FINGERPRINT_FILE).read_text().strip() == native):
        return app, time.monotonic() - start, "cache_reused", False
    if cache.exists():
        raise RuntimeError(f"Incomplete build cache at {cache}; inspect it before removing")
    cache.mkdir(parents=True)
    run(["bash", "scripts/build-appstore-video-app.sh"], work / "bundle.log",
        {**env, "PRAY_VIDEO_SCRATCH_DIR": str(cache)})
    if not (app / "main.jsbundle").is_file() or sha256(app / "main.jsbundle") != expected:
        raise RuntimeError("Release build bundle differs from current JS inputs and mock environment")
    (app / NATIVE_FINGERPRINT_FILE).write_text(native + "\n")
    (cache / "source-sha256.txt").write_text(fingerprint + "\n")
    return app, time.monotonic() - start, "rebuilt", False


def capture_times(work: Path) -> dict[str, float]:
    values = {}
    for line in (work / "logs/stage-seconds.tsv").read_text().splitlines():
        name, seconds = line.split("\t")
        if name in values:
            raise ValueError(f"Duplicate capture stage: {name}")
        values[name] = float(seconds)
    required = {"boot_seed_calibration", "calibration", "boot_seed_take", "record", "verification"}
    if set(values) != required:
        raise ValueError(f"Incomplete capture timing: {set(values) ^ required}")
    return values


def shoot(locale: str, local: Path, app: Path, showtime: str, keyboard_map: Path,
          skip_install: bool, env: dict[str, str], retake_source: Path | None = None) -> dict:
    local.mkdir()
    local_env = {**env, "PRAY_VIDEO_SCRATCH_DIR": str(local), "PRAY_VIDEO_LOG_DIR": str(local / "logs"),
                 "PRAY_VIDEO_APP_PATH": str(app), "PRAY_VIDEO_SHOWTIME": showtime,
                 "PRAY_VIDEO_KEYBOARD_MAP": str(keyboard_map),
                 "PRAY_VIDEO_SKIP_INSTALL": "1" if skip_install else "0"}
    if retake_source is not None:
        local_env["PRAY_VIDEO_RETAKE_SOURCE"] = str(retake_source)
    run(["bash", "scripts/capture-appstore-video.sh", locale], local / "capture.log", local_env)
    stages = capture_times(local)
    run(["python3", "scripts/montage-appstore-video.py", locale], local / "montage.log", local_env)
    montage = json.loads((local / f"montage-{locale}/stage-seconds.json").read_text())
    start = time.monotonic()
    try:
        run(["python3", "scripts/verify-appstore-video.py", locale], local / "final-verify.log", local_env)
    except RuntimeError:
        frames = local / "frames" / locale
        summary_path = frames / "summary.json"
        quality_path = frames / "quality-failure.json"
        if summary_path.is_file():
            summary = json.loads(summary_path.read_text())
            if summary["status"] == "failed":
                if summary["configuration_issues"]:
                    raise RuntimeError("Video pacing configuration failed: " +
                                       "; ".join(summary["configuration_issues"])) from None
                if summary["quality_issues"]:
                    raise QualityGateFailure(summary["quality_issues"], summary["metrics"],
                                             summary["duration_seconds"]) from None
        if quality_path.is_file():
            raise QualityGateFailure(json.loads(quality_path.read_text())["issues"]) from None
        raise
    verify_seconds = time.monotonic() - start
    final = local / "final" / f"appstore-{locale}.mp4"
    duration = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
                                              "format=duration", "-of", "csv=p=0", str(final)], text=True).strip())
    summary = json.loads((local / "frames" / locale / "summary.json").read_text())
    deliverable = ROOT / "store/video" / f"appstore-{locale}.mp4"
    pending = deliverable.with_name(deliverable.name + ".pending")
    if pending.exists():
        raise RuntimeError(f"Stale pending deliverable: {pending}")
    shutil.copy2(final, pending)
    os.replace(pending, deliverable)
    timings = {"boot_seed": stages["boot_seed_calibration"] + stages["boot_seed_take"],
               "calibration": stages["calibration"], "record": stages["record"],
               "montage": montage["montage"],
               "verification": stages["verification"] + montage["verification"] + verify_seconds}
    return {"file": str(deliverable), "work_copy": str(final),
            "review": str(local / "review" / f"appstore-{locale}-full.mp4"),
            "duration_seconds": duration,
            "hard_checks": summary["hard_checks"], "metrics": summary["metrics"],
            "warnings": summary["warnings"],
            "typing": {"updates": summary["reflection_updates"],
                       "characters": summary["reflection_expected_visible_characters"],
                       "keystrokes": summary["reflection_total_keystrokes"],
                       "max_gap_ms": summary["reflection_max_gap_ms"]},
            "stages_seconds": timings}


def main() -> int:
    if sys.version_info < (3, 9):
        raise SystemExit("App Store video pipeline requires Python 3.9 or newer")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("locale", help="Locale in store/video/demo-content.json, or all")
    parser.add_argument("--work-root", type=Path, default=DEFAULT_SCRATCH,
                        help="Directory for ignored run logs and build cache (default: store/video/runs)")
    args = parser.parse_args()
    fixture = json.loads((ROOT / "store/video/demo-content.json").read_text())
    max_attempts = json.loads((ROOT / "store/video/pacing.json").read_text())["verification"]["max_capture_attempts"]
    if type(max_attempts) is not int or max_attempts < 1:
        parser.error("verification.max_capture_attempts must be a positive integer")
    locales = list(fixture["locales"]) if args.locale == "all" else [args.locale]
    if set(locales) - set(fixture["locales"]):
        parser.error(f"Unknown locale: {args.locale}")
    scratch = args.work_root.expanduser().resolve()
    allowed_inside = ROOT / "store/video/runs"
    if scratch == ROOT or (ROOT in scratch.parents and scratch != allowed_inside and allowed_inside not in scratch.parents):
        parser.error("Work root inside the repository must be under store/video/runs")
    scratch.mkdir(parents=True, exist_ok=True)
    work = scratch / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    work.mkdir(parents=True)
    tool_path = os.environ["PATH"]
    if shutil.which("npx", path=tool_path) is None:
        node_dir = Path("/usr/local/bin")
        if (node_dir / "node").is_file() and (node_dir / "npx").is_file():
            tool_path += os.pathsep + str(node_dir)
            print(f"Using Node.js tools from {node_dir}", flush=True)
    env = {**os.environ, "PATH": tool_path, "PRAY_VIDEO_SCRATCH_ROOT": str(scratch)}
    started = time.monotonic()
    report = {"source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
              "source_hash": source_hash(), "pipeline_hash": pipeline_hash(),
              "locales": {}, "exit_code": 1}
    try:
        preflight_start = time.monotonic()
        showtime, keyboard_map = preflight(work, env)
        report["preflight_seconds"] = time.monotonic() - preflight_start
        app, report["bundle_seconds"], report["bundle_mode"], skip_install = get_app(work, scratch, env)
        report["rebuilt"] = report["bundle_mode"] == "rebuilt"
        for locale in locales:
            attempt_records = []
            report["locales"][locale] = {"attempts": attempt_records}
            locale_work = work / locale
            locale_work.mkdir()
            for number in range(1, max_attempts + 1):
                attempt_work = locale_work / f"attempt-{number:02d}"
                calibration_source = locale_work / "attempt-01"
                try:
                    result = shoot(locale, attempt_work, app, showtime, keyboard_map,
                                   skip_install if number == 1 else True, env,
                                   calibration_source if number > 1 else None)
                except QualityGateFailure as error:
                    attempt_records.append({"number": number, "status": "quality_rejected",
                                            "reason": error.reasons, "metrics": error.metrics,
                                            "duration_seconds": error.duration_seconds,
                                            "work": str(attempt_work)})
                    print(f"{locale} attempt {number}/{max_attempts}: quality rejected: "
                          f"{error}", flush=True)
                    if number == max_attempts:
                        reasons = "; ".join(f"attempt {item['number']}: {', '.join(item['reason'])}"
                                            for item in attempt_records)
                        raise RuntimeError(f"{locale} exhausted {max_attempts} attempts: {reasons}")
                except Exception as error:
                    attempt_records.append({"number": number, "status": "deterministic_failure",
                                            "reason": str(error), "work": str(attempt_work)})
                    print(f"{locale} attempt {number}/{max_attempts}: deterministic failure: {error}", flush=True)
                    raise
                else:
                    attempt_records.append({"number": number, "status": "passed",
                                            "reason": "All hard checks passed", "work": str(attempt_work),
                                            "duration_seconds": result["duration_seconds"],
                                            "metrics": result["metrics"]})
                    report["locales"][locale].update(result)
                    print(f"{locale} attempt {number}/{max_attempts}: passed all hard checks", flush=True)
                    break
            item = report["locales"][locale]
            metrics = item["metrics"]
            gaps = ", ".join(f"{field} raw {data['raw_visible_updates']}/"
                             f"{data['required_visible_characters']} "
                             f"raw/final max {data['raw_max_gap_ms']}/{data['max_gap_ms']}ms "
                             f"p95 {data['raw_p95_gap_ms']}/{data['p95_gap_ms']}ms"
                             for field, data in metrics["typing"].items())
            holds = ", ".join(f"{name} {data['montage_seconds']}s"
                              for name, data in metrics["holds"].items())
            flame = metrics["flame_motion"]
            print(f"FINAL {item['file']} | attempts {len(attempt_records)}/{max_attempts} | "
                  f"{item['duration_seconds']:.3f}s "
                  f"(target ≤{metrics['duration']['target_max_seconds']}s, "
                  f"margin {metrics['duration']['margin_to_limit_seconds']}s) | typing {gaps} | "
                  f"clear question {metrics['first_question_clear_read_seconds']}s | holds {holds} | "
                  f"flame before/focused/after "
                  f"{flame['before_focus']['first_to_last_mean_absolute_pixel_change']}/"
                  f"{flame['focused_typing']['median_mean_absolute_pixel_change']}/"
                  f"{flame['after_blur']['first_to_last_mean_absolute_pixel_change']} | exit 0", flush=True)
            for warning in item["warnings"]:
                print(f"WARNING {locale}: {warning}", flush=True)
        report["exit_code"] = 0
    except Exception as error:
        report["error"] = str(error)
        print(f"VIDEO PIPELINE FAILED: {error}", file=sys.stderr, flush=True)
    finally:
        try:
            udid = subprocess.check_output([str(ROOT / "testing/e2e/sim-udid.sh"), DEVICE], text=True).strip()
            subprocess.run(["xcrun", "simctl", "shutdown", udid], capture_output=True)
        except Exception as error:
            report["cleanup_error"] = str(error)
            report["exit_code"] = 1
        report["total_seconds"] = time.monotonic() - started
        (work / "pipeline-report.json").write_text(json.dumps(report, indent=2) + "\n")
        print(f"Report: {work / 'pipeline-report.json'} | total {report['total_seconds']:.1f}s | "
              f"exit {report['exit_code']}", flush=True)
    return report["exit_code"]


if __name__ == "__main__":
    sys.exit(main())
