#!/usr/bin/env python3
"""Save review frames and measure final App Store video pacing."""
from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
CROPS = {
    "intention": (90, 550, 710, 220),
    "answer": (70, 1110, 750, 230),
    "reflection": (70, 790, 750, 330),
}


class RecordingQualityError(RuntimeError):
    """The recording lacks enough visible frames for a quality measurement."""


def output_time(raw: float, segments: list[dict]) -> float:
    elapsed = 0.0
    for segment in segments:
        if raw <= segment["end"]:
            return elapsed + max(0.0, raw - segment["start"]) / segment["speed"]
        elapsed += (segment["end"] - segment["start"]) / segment["speed"]
    return elapsed + max(0.0, raw - segments[-1]["end"])


def video_frames(video: Path, start: float, duration: float, crop: tuple[int, int, int, int],
                 *, grayscale: bool = False):
    x, y, width, height = crop
    channels = 1 if grayscale else 3
    command = [
        "ffmpeg", "-v", "error", "-ss", f"{start:.6f}", "-t", f"{duration:.6f}",
        "-i", str(video), "-vf",
        f"crop={width}:{height}:{x}:{y},fps=30,format={'gray' if grayscale else 'rgb24'}",
        "-f", "rawvideo", "-",
    ]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        while frame := process.stdout.read(width * height * channels):
            if len(frame) != width * height * channels:
                raise RuntimeError("Incomplete decoded video frame")
            yield frame
        error = process.stderr.read()
        if process.wait():
            raise RuntimeError(f"FFmpeg frame analysis failed: {error.decode()}")
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()


def typing_updates(video: Path, start: float, end: float, crop: tuple[int, int, int, int]):
    _, _, width, height = crop
    previous_mask = None
    previous_caret = None
    updates = []
    frame_count = 0
    for frame in video_frames(video, start - 0.1, end - start + 0.2, crop):
        white = bytearray(width * height)
        blue = []
        for index in range(width * height):
            r, g, b = frame[index * 3:index * 3 + 3]
            if r > 170 and g > 160 and b > 145:
                white[index] = 1
            if b > 145 and b > r * 1.6 and b > g * 1.35:
                blue.append(index)
        caret = None
        if len(blue) >= 25:
            caret = (round(sum(index % width for index in blue) / len(blue)),
                     round(sum(index // width for index in blue) / len(blue)))
        changed = sum(a != b for a, b in zip(white, previous_mask)) if previous_mask else 0
        moved = (previous_caret is not None and caret is not None
                 and abs(caret[0] - previous_caret[0]) + abs(caret[1] - previous_caret[1]) > 4)
        if changed >= 5 or moved:
            updates.append({"frame": frame_count, "white_pixels": changed, "caret_moved": moved})
        previous_mask = white
        if caret is not None:
            previous_caret = caret
        frame_count += 1
    first_glyph = next((index for index, update in enumerate(updates) if update["white_pixels"] >= 5), None)
    if first_glyph is None:
        raise RecordingQualityError("No visible typing was detected")
    updates = updates[first_glyph:]
    gaps = [round((b["frame"] - a["frame"]) / 30 * 1000)
            for a, b in zip(updates, updates[1:])]
    ordered_gaps = sorted(gaps)
    p95_index = (len(ordered_gaps) - 1) * 0.95
    p95_gap = (ordered_gaps[int(p95_index)] +
               (ordered_gaps[min(int(p95_index) + 1, len(ordered_gaps) - 1)] -
                ordered_gaps[int(p95_index)]) * (p95_index % 1)) if ordered_gaps else 0
    return {"characters_or_caret_updates": len(updates), "max_visible_gap_ms": max(gaps, default=0),
            "p95_visible_gap_ms": round(p95_gap, 1),
            "updates": updates, "gaps_ms": gaps, "analyzed_frames": frame_count}


def flame_motion(video: Path, start: float, duration: float) -> dict:
    previous = None
    first = None
    changes = []
    for frame in video_frames(video, start, duration, (320, 180, 246, 280), grayscale=True):
        if first is None:
            first = frame
        if previous is not None:
            changes.append(sum(abs(a - b) for a, b in zip(frame, previous)) / len(frame))
        previous = frame
    if not changes:
        raise RecordingQualityError("Flame interval has too few frames")
    return {"median_mean_absolute_pixel_change": round(statistics.median(changes), 4),
            "max_mean_absolute_pixel_change": round(max(changes), 4),
            "first_to_last_mean_absolute_pixel_change": round(
                sum(abs(a - b) for a, b in zip(first, previous)) / len(first), 4)}


def first_question_clear_hold(video: Path, threshold_end: float, answer_tap: float,
                              crop: tuple[int, int, int, int]) -> dict:
    reference_frames = list(video_frames(video, answer_tap - 0.35, 0.15, crop, grayscale=True))
    if not reference_frames:
        raise RecordingQualityError("No first-question reference frame")
    reference = reference_frames[-1]
    differences = []
    for frame in video_frames(video, threshold_end, answer_tap - threshold_end - 0.1, crop, grayscale=True):
        differences.append(sum(abs(a - b) for a, b in zip(frame, reference)) / len(frame))
    first_stable = next(
        (index for index in range(len(differences) - 2) if all(value < 0.1 for value in differences[index:index + 3])),
        None,
    )
    if first_stable is None:
        raise RecordingQualityError("First question never settled before the answer tap")
    visible_at = threshold_end + first_stable / 30
    return {"clear_at_seconds": round(visible_at, 3),
            "answer_tap_seconds": round(answer_tap, 3),
            "clear_read_seconds": round(answer_tap - visible_at, 3)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("locale")
    args = parser.parse_args()
    work = Path(os.environ["PRAY_VIDEO_SCRATCH_DIR"])
    frames = work / "frames" / args.locale
    frames.mkdir(parents=True, exist_ok=False)
    markers = {item["name"]: item["time"] for item in json.loads(
        (work / f"raw/{args.locale}-full.markers.json").read_text())["markers"]}
    plan = json.loads((work / f"montage-{args.locale}/plan.json").read_text())
    segments = plan["segments"]
    video = work / "final" / f"appstore-{args.locale}.mp4"
    raw_video = work / "raw" / f"{args.locale}-full.mp4"
    fixture = json.loads((ROOT / "store/video/demo-content.json").read_text())["locales"][args.locale]
    pacing = json.loads((ROOT / "store/video/pacing.json").read_text())
    limits = pacing["verification"]
    required_markers = set(limits["required_markers"])
    missing_markers = sorted(required_markers - markers.keys())
    if missing_markers:
        raise RuntimeError(f"Required video markers missing: {', '.join(missing_markers)}")
    review = work / f"review/appstore-{args.locale}-full.mp4"
    if not review.is_file():
        raise RuntimeError("Uncut review copy is missing")
    raw_size = json.loads(subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height", "-of", "json", str(raw_video)], text=True,
    ))["streams"][0]
    output_size = json.loads(subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height", "-of", "json", str(video)], text=True,
    ))["streams"][0]

    timeline = []
    for point in limits["frame_points"]:
        name, marker, offset = point["name"], point["marker"], point["offset_seconds"]
        raw = markers[marker] + offset
        at = output_time(raw, segments)
        image = frames / f"{name}.png"
        with (frames / f"{name}.log").open("w") as log:
            result = subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-ss", f"{at:.3f}", "-i", str(video),
                 "-frames:v", "1", str(image)], stdout=log, stderr=subprocess.STDOUT,
            )
        if result.returncode or not image.is_file():
            raise RuntimeError(f"Frame extraction failed: {name}")
        timeline.append(f"{name}: raw={raw:.3f}s montage={at:.3f}s")
    (frames / "timeline.txt").write_text("\n".join(timeline) + "\n")

    typing = {}
    for field in CROPS:
        start = output_time(markers[f"{field}_typing_start"], segments)
        end = output_time(markers[f"{field}_typing_end"], segments)
        typing[field] = typing_updates(video, start, end, CROPS[field])
        raw_crop = tuple(round(value * raw_size["width" if index % 2 == 0 else "height"] /
                               output_size["width" if index % 2 == 0 else "height"])
                         for index, value in enumerate(CROPS[field]))
        typing[field]["raw"] = typing_updates(
            raw_video, markers[f"{field}_typing_start"], markers[f"{field}_typing_end"], raw_crop)
        value = fixture["typed"]["takeaway" if field == "reflection" else field]
        typing[field]["total_keystrokes"] = len(value)
        typing[field]["expected_visible_characters"] = sum(not char.isspace() for char in value)
    (frames / "typing-metrics.json").write_text(json.dumps(typing, indent=2) + "\n")
    issues = []
    for field, result in typing.items():
        if result["raw"]["characters_or_caret_updates"] < result["expected_visible_characters"]:
            issues.append(f"{field} raw typing visible updates: {result['raw']['characters_or_caret_updates']} "
                          f"< required {result['expected_visible_characters']}")
        for source, measured in (("raw", result["raw"]), ("final", result)):
            if measured["max_visible_gap_ms"] > limits["hard_typing_max_gap_ms"]:
                issues.append(f"{field} {source} typing maximum gap: "
                              f"{measured['max_visible_gap_ms']} ms "
                              f"> limit {limits['hard_typing_max_gap_ms']} ms")

    motion = {
        "before_focus": flame_motion(video, output_time(markers["reflection_input_down"], segments) - 0.35, 0.3),
        "focused_typing": flame_motion(video, output_time(markers["reflection_typing_start"], segments) + 0.4, 1.5),
        "after_blur": flame_motion(video, output_time(markers["reflection_save_down"], segments) - 0.4, 0.3),
    }
    (frames / "flame-motion.json").write_text(json.dumps(motion, indent=2) + "\n")

    spans = {
        "first_screen": ("home_ready", "home_tap_down"),
        "threshold_hold": ("threshold_hold_down", "threshold_hold_up"),
        "first_question_before_answer": ("question_read_start", "answer_open_down"),
        "before_next_question": ("answer_save_up", "next_question_down"),
        "second_question_read": ("next_question_read_start", "scripture_open_down"),
        "before_reflection_typing": ("reflection_input_up", "reflection_typing_start"),
        "after_reflection_typing": ("reflection_typing_end", "reflection_save_down"),
        "home_total_before_journal": ("reflection_save_up", "journal_open_down"),
        "home_visible_before_journal": ("saved_notice_start", "journal_open_down"),
        "journal_final": ("journal_expand_up", "journal_end"),
    }
    holds = {}
    for name, (start, end) in spans.items():
        holds[name] = {"real_seconds": round(markers[end] - markers[start], 3),
                       "montage_seconds": round(output_time(markers[end], segments) - output_time(markers[start], segments), 3)}
    clear_question = first_question_clear_hold(
        video, output_time(markers["threshold_hold_up"], segments),
        output_time(markers["answer_open_down"], segments),
        tuple(limits["first_question_crop"]),
    )
    if not limits["min_clear_question_seconds"] <= clear_question["clear_read_seconds"] <= limits["max_clear_question_seconds"]:
        issues.append(f"First question clear reading {clear_question['clear_read_seconds']} s is outside "
                      f"{limits['min_clear_question_seconds']}–{limits['max_clear_question_seconds']} s")
    for name in ("first_screen", "before_next_question", "before_reflection_typing", "after_reflection_typing"):
        if not limits["min_comprehension_pause_seconds"] <= holds[name]["montage_seconds"] <= limits["max_comprehension_pause_seconds"]:
            issues.append(f"{name} comprehension pause: {holds[name]['montage_seconds']} s outside "
                          f"{limits['min_comprehension_pause_seconds']}–{limits['max_comprehension_pause_seconds']} s")
    if holds["home_total_before_journal"]["real_seconds"] < limits["min_home_hold_seconds"]:
        issues.append(f"Home hold: {holds['home_total_before_journal']['real_seconds']} s "
                      f"< minimum {limits['min_home_hold_seconds']} s")
    if holds["threshold_hold"]["real_seconds"] < limits["min_threshold_hold_seconds"]:
        issues.append(f"Threshold hold: {holds['threshold_hold']['real_seconds']} s "
                      f"< minimum {limits['min_threshold_hold_seconds']} s")
    (frames / "holds.json").write_text(json.dumps(holds, indent=2) + "\n")

    typing_metrics = {
        field: {"visible_updates": result["characters_or_caret_updates"],
                "raw_visible_updates": result["raw"]["characters_or_caret_updates"],
                "required_visible_characters": result["expected_visible_characters"],
                "max_gap_ms": result["max_visible_gap_ms"],
                "p95_gap_ms": result["p95_visible_gap_ms"],
                "raw_max_gap_ms": result["raw"]["max_visible_gap_ms"],
                "raw_p95_gap_ms": result["raw"]["p95_visible_gap_ms"]}
        for field, result in typing.items()
    }
    duration = plan["actual_duration"]
    duration_margin = round(limits["max_duration_seconds"] - duration, 3)
    duration_metrics = {"actual_seconds": duration,
                        "target_max_seconds": limits["target_max_duration_seconds"],
                        "target_met": duration <= limits["target_max_duration_seconds"],
                        "app_store_max_seconds": limits["max_duration_seconds"],
                        "margin_to_limit_seconds": duration_margin,
                        "warning_within_limit_seconds": limits["duration_warning_margin_seconds"],
                        "near_limit_warning": duration_margin <= limits["duration_warning_margin_seconds"]}
    metrics = {"duration": duration_metrics,
               "typing": typing_metrics, "typing_target_gap_ms": limits["metric_typing_target_gap_ms"],
               "holds": holds, "first_question_clear_read_seconds": clear_question["clear_read_seconds"],
               "flame_motion": motion,
               "flame_targets": {"frozen_max_change": limits["metric_flame_frozen_max_change"],
                                 "animated_min_change": limits["metric_flame_animated_min_change"]}}
    reflection = typing["reflection"]
    summary = {"video": str(video), "duration_seconds": duration,
               "review_copy": str(review), "question_next": fixture["questions"]["next"],
               "typed_intention": fixture["typed"]["intention"], "holds": holds,
               "first_question_clear_read": clear_question,
               "reflection_updates": reflection["characters_or_caret_updates"],
               "reflection_expected_visible_characters": reflection["expected_visible_characters"],
               "reflection_total_keystrokes": reflection["total_keystrokes"],
               "reflection_max_gap_ms": reflection["max_visible_gap_ms"], "flame_motion": motion,
               "typing_method": "Bright text or blue caret changes in each final 30 fps frame; whitespace keystrokes do not require a visible update; focus lead-in excluded.",
               "hard_checks": {"required_markers": sorted(required_markers),
                               "typing_max_gap_ms": limits["hard_typing_max_gap_ms"],
                               "clear_question_seconds": [limits["min_clear_question_seconds"],
                                                          limits["max_clear_question_seconds"]],
                               "comprehension_pause_seconds": [limits["min_comprehension_pause_seconds"],
                                                               limits["max_comprehension_pause_seconds"]]},
               "metrics": metrics,
               "warnings": ([f"Duration {duration:.3f}s is within {duration_margin:.3f}s of the "
                             f"{limits['max_duration_seconds']:g}s App Store limit"]
                            if duration_metrics["near_limit_warning"] else []),
               "status": "failed" if issues else "passed", "issues": issues}
    (frames / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    if issues:
        raise RuntimeError("Video verification failed: " + "; ".join(issues))
    print(f"Verified {video}: {plan['actual_duration']:.3f}s, reflection "
          f"{reflection['characters_or_caret_updates']}/{reflection['expected_visible_characters']} visible updates, "
          f"max gap {reflection['max_visible_gap_ms']} ms; frames: {frames}")


if __name__ == "__main__":
    try:
        main()
    except RecordingQualityError as error:
        frames = Path(os.environ["PRAY_VIDEO_SCRATCH_DIR"]) / "frames" / sys.argv[1]
        frames.mkdir(parents=True, exist_ok=True)
        (frames / "quality-failure.json").write_text(json.dumps({"issues": [str(error)]}) + "\n")
        raise
