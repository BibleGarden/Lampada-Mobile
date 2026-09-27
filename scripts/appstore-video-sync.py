#!/usr/bin/env python3
"""Align AXe host-clock markers to raw video PTS using ShowTime tap circles."""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
from pathlib import Path


TAPS = (
    ("home_tap_down", "start-prayer-button"),
    ("setup_input_down", "setup-goal-input"),
)


def video_size(path: Path) -> tuple[int, int]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    streams = json.loads(result.stdout)["streams"]
    if len(streams) != 1:
        raise ValueError("Expected one raw video stream")
    return streams[0]["width"], streams[0]["height"]


def repaired_frame_times(path: Path) -> tuple[list[float], list[float], list[dict]]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_frames",
         "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    original = [float(frame["best_effort_timestamp_time"])
                for frame in json.loads(result.stdout)["frames"]]
    if not original or original[0] != 0:
        raise ValueError("Raw video must start at PTS zero")
    repaired = [0.0]
    resets = []
    for index, (previous, current) in enumerate(zip(original, original[1:]), start=1):
        delta = current - previous
        if delta < 0:
            resets.append({"frame": index, "previous_pts": previous, "next_pts": current,
                           "backward_seconds": round(-delta, 6)})
            delta = 1 / 60
        repaired.append(repaired[-1] + delta)
    return original, repaired, resets


def repaired_onset(raw_pts: float, original: list[float], repaired: list[float]) -> float:
    index = min(range(len(original)), key=lambda item: abs(original[item] - raw_pts))
    if abs(original[index] - raw_pts) > 0.002:
        raise ValueError(f"Detected ShowTime PTS {raw_pts} is absent from ffprobe frames")
    return repaired[index]


def measured_frame_interval(original: list[float]) -> float:
    intervals = sorted(current - previous for previous, current in zip(original, original[1:])
                       if current > previous)
    if not intervals:
        raise ValueError("Raw video has no forward frame intervals")
    # Редкие паузы не должны расширять допуск; короткие пакетные кадры не должны его сужать.
    return intervals[math.ceil(0.95 * len(intervals)) - 1]


def tap_circle_onset(raw: Path, marker_time: float, point: list[float],
                     scale: float, settings: dict, log_dir: Path, label: str) -> dict:
    size = round(settings["crop_radius_points"] * scale * 2)
    left = round(point[0] * scale - size / 2)
    top = round(point[1] * scale - size / 2)
    if left < 0 or top < 0:
        raise ValueError(f"Tap detection crop is outside the video: {label}")
    frame_bytes = size * size * 3
    rgb = log_dir / f"{label}.rgb"
    log = log_dir / f"{label}.ffmpeg.log"
    duration = marker_time + settings["search_after_seconds"] + 0.2
    command = [
        "ffmpeg", "-v", "info", "-t", str(duration), "-i", str(raw), "-vf",
        f"crop={size}:{size}:{left}:{top},format=rgb24,showinfo,setpts=N",
        "-fps_mode", "passthrough", "-f", "rawvideo", "-",
    ]
    with rgb.open("wb") as frames, log.open("wb") as errors:
        result = subprocess.run(command, stdout=frames, stderr=errors)
    log.with_suffix(".exit").write_text(f"{result.returncode}\n")
    if result.returncode:
        raise RuntimeError(f"ShowTime frame decode failed; see {log}")
    timestamps = [float(value) for value in re.findall(r"pts_time:([0-9.]+)", log.read_text())]
    data = rgb.read_bytes()
    rgb.unlink()
    if len(data) % frame_bytes or len(data) // frame_bytes != len(timestamps):
        raise RuntimeError(f"Decoded frames ({len(data) // frame_bytes}) and PTS ({len(timestamps)}) "
                           f"disagree for {label}; see {log}")
    previous = 0
    for index, pts in enumerate(timestamps):
        frame = data[index * frame_bytes:(index + 1) * frame_bytes]
        blue = sum(
            b > 135 and b > r * 1.5 and b > g * 1.1
            for r, g, b in zip(frame[::3], frame[1::3], frame[2::3])
        )
        if (marker_time - settings["search_before_seconds"] <= pts <=
                marker_time + settings["search_after_seconds"] and
                previous < settings["blue_pixel_min"] <= blue):
            return {"marker": label, "host_seconds": marker_time, "video_pts_seconds": pts,
                    "offset_seconds": pts - marker_time, "blue_pixels": blue}
        previous = blue
    raise RuntimeError(f"No first ShowTime circle frame for {label}; see {log}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--host-markers", type=Path, required=True)
    parser.add_argument("--video-markers", type=Path, required=True)
    parser.add_argument("--coords", type=Path, required=True)
    parser.add_argument("--pacing", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if args.video_markers.exists() or args.report.exists():
        parser.error("Synchronized markers or report already exist")
    settings = json.loads(args.pacing.read_text())["clock_sync"]
    if any(not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0
           for value in settings.values()):
        raise ValueError("Clock sync settings must be positive finite values")
    if type(settings["sync_tolerance_frames"]) is not int:
        raise ValueError("sync_tolerance_frames must be a positive integer")
    host = json.loads(args.host_markers.read_text())
    markers = {item["name"]: item["time"] for item in host["markers"]}
    calibrated = json.loads(args.coords.read_text())
    native_width, native_height = video_size(args.raw)
    screen = calibrated["screen"]
    scale = native_width / screen["width"]
    if abs(scale - native_height / screen["height"]) > 0.01:
        raise ValueError("Video pixels and calibrated accessibility points have different scales")
    log_dir = args.report.parent / "clock-sync"
    log_dir.mkdir(parents=True, exist_ok=False)
    original_pts, repaired_pts, resets = repaired_frame_times(args.raw)
    frame_interval = measured_frame_interval(original_pts)
    max_disagreement = settings["sync_tolerance_frames"] * frame_interval
    taps = [
        tap_circle_onset(args.raw, markers[marker], calibrated["coordinates"][element],
                         scale, settings, log_dir, marker)
        for marker, element in TAPS
    ]
    disagreement = abs(taps[0]["offset_seconds"] - taps[1]["offset_seconds"])
    report = {"status": "checking", "raw_size": [native_width, native_height],
              "accessibility_scale": scale, "raw_pts_resets": resets,
              "raw_frame_interval_p95_seconds": round(frame_interval, 6),
              "sync_tolerance_frames": settings["sync_tolerance_frames"],
              "sync_tolerance_seconds": round(max_disagreement, 6),
              "first_tap_offset_seconds": round(taps[0]["offset_seconds"], 6),
              "second_tap_offset_seconds": round(taps[1]["offset_seconds"], 6),
              "second_tap_disagreement_seconds": round(disagreement, 6), "taps": taps}
    if disagreement > max_disagreement:
        report.update(status="failed", failure="first two tap offsets disagree")
        args.report.write_text(json.dumps(report, indent=2) + "\n")
        raise RuntimeError(
            f"ShowTime clock offsets {taps[0]['offset_seconds']:+.4f}s and "
            f"{taps[1]['offset_seconds']:+.4f}s disagree by {disagreement:.4f}s "
            f"(tolerance {max_disagreement:.4f}s from "
            f"{settings['sync_tolerance_frames']} measured raw frames); see {args.report}"
        )
    offset = repaired_onset(taps[0]["video_pts_seconds"], original_pts, repaired_pts) - markers[TAPS[0][0]]
    answer = tap_circle_onset(
        args.raw, markers["answer_open_down"], calibrated["coordinates"]["dock-answer-button"],
        scale, settings, log_dir, "answer_open_down",
    )
    answer_video_time = repaired_onset(answer["video_pts_seconds"], original_pts, repaired_pts)
    answer_adjustment = answer_video_time - (markers["answer_open_down"] + offset)
    report.update(offset_seconds=round(offset, 6), answer_marker_adjustment_seconds=round(answer_adjustment, 6))
    report["taps"].append(answer)
    if abs(answer_adjustment) > settings["max_first_outro_adjustment_seconds"]:
        report.update(status="failed", failure="first tap after AXe batch split differs")
        args.report.write_text(json.dumps(report, indent=2) + "\n")
        raise RuntimeError(f"First tap after AXe batch split differs by {answer_adjustment:.4f}s")
    later = tap_circle_onset(
        args.raw, markers["reflection_input_down"], calibrated["coordinates"]["reflection-input"],
        scale, settings, log_dir, "reflection_input_down",
    )
    later_video_time = repaired_onset(later["video_pts_seconds"], original_pts, repaired_pts)
    later_offset = later_video_time - markers["reflection_input_down"]
    later_disagreement = abs(later_offset - offset)
    report.update(later_tap_offset_seconds=round(later_offset, 6),
                  later_tap_disagreement_seconds=round(later_disagreement, 6))
    report["taps"].append(later)
    if later_disagreement > max_disagreement:
        report.update(status="failed", failure="later tap offset differs")
        args.report.write_text(json.dumps(report, indent=2) + "\n")
        raise RuntimeError(f"Later ShowTime offset {later_offset:+.4f}s differs from "
                           f"initial offset {offset:+.4f}s by {later_disagreement:.4f}s "
                           f"(tolerance {max_disagreement:.4f}s from "
                           f"{settings['sync_tolerance_frames']} measured raw frames); "
                           f"see {args.report}")
    corrected = {**host, "source": "ShowTime-aligned monotonic video timeline",
                 "clock_offset_seconds": round(offset, 6),
                 "markers": [{**item, "time": round(item["time"] + offset +
                                                (answer_adjustment if item["name"] in
                                                 {"answer_open_down", "answer_open_up"} else 0), 6)}
                             for item in host["markers"]]}
    args.video_markers.write_text(json.dumps(corrected, ensure_ascii=False, indent=2) + "\n")
    report["status"] = "passed"
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Aligned AXe markers to video PTS by {offset:+.4f}s; "
          f"second tap differs by {disagreement:.4f}s")


if __name__ == "__main__":
    main()
