#!/usr/bin/env python3
"""Make one continuous App Store preview from a marked simulator take."""
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import time
from pathlib import Path


TRANSITIONS = {
    "home_tap_up", "setup_next_up", "threshold_hold_up", "answer_open_up",
    "scripture_open_up", "session_finish_up",
    "reflection_save_up", "journal_open_up",
}
HOLD_START = "threshold_hold_down"
TYPING_STARTS = {
    "intention_typing_start": "intention_typing_end",
    "answer_typing_start": "answer_typing_end",
    "reflection_typing_start": "reflection_typing_end",
}


def probe(path: Path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration,size:stream=codec_name,profile,pix_fmt,width,height,avg_frame_rate,bit_rate,channels",
         "-of", "json", str(path)], capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)


def validate_markers(path: Path, locale: str):
    payload = json.loads(path.read_text())
    if payload.get("schema") != 1 or payload.get("locale") != locale:
        raise ValueError("Marker schema or locale does not match the raw take")
    markers = payload.get("markers")
    if not isinstance(markers, list) or not markers:
        raise ValueError("Marker sidecar is empty")
    names = [item["name"] for item in markers]
    times = [item["time"] for item in markers]
    if len(set(names)) != len(names) or any(not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 for value in times):
        raise ValueError("Markers contain duplicate names or invalid timestamps")
    if any(next_time <= time for time, next_time in zip(times, times[1:])):
        raise ValueError("Story markers are not strictly ordered")
    return dict(zip(names, times)), names


def validate_plan(path: Path, markers: dict):
    pacing = json.loads(path.read_text())
    if pacing.get("schema") != 1 or not isinstance(pacing.get("montage"), dict):
        raise ValueError("Unsupported video pacing schema")
    plan = pacing["montage"]
    start = plan.get("start_marker")
    end = plan.get("end_marker")
    if start not in markers or end not in markers or markers[start] >= markers[end]:
        raise ValueError("Head or tail marker is missing or reversed")
    if plan.get("default_speed") != 1.0:
        raise ValueError("Unmarked motion must stay at real-time speed")
    speeds = plan.get("speed_after")
    if not isinstance(speeds, dict) or set(speeds) - (TRANSITIONS | TYPING_STARTS.keys() | {HOLD_START}):
        raise ValueError("Speed plan contains an unsupported segment")
    if any(name not in markers or not isinstance(speed, (int, float)) or
           not 1 < speed <= (3 if name in TYPING_STARTS else 2 if name == HOLD_START else 1.5)
           for name, speed in speeds.items()):
        raise ValueError("Speed must be >1 and within its segment limit")
    for start, end in TYPING_STARTS.items():
        if start not in markers or end not in markers or markers[start] >= markers[end]:
            raise ValueError(f"Typing marker pair missing or reversed: {start}, {end}")
    return plan


def make_segments(markers: dict, names: list[str], plan: dict, raw_duration: float):
    start = plan["start_marker"]
    end = plan["end_marker"]
    selected = names[names.index(start):names.index(end) + 1]
    if markers[selected[-2]] >= raw_duration:
        raise ValueError("The last visible journal marker is after the raw video ends")
    if markers[end] - raw_duration > 3:
        raise ValueError("Raw recording lost more than 3 seconds of its journal tail")
    segments = []
    for name, next_name in zip(selected, selected[1:]):
        start_time = markers[name]
        end_time = min(markers[next_name], raw_duration)
        if start_time >= raw_duration:
            break
        if end_time - start_time < 0.03:
            raise ValueError(f"Segment too short at marker {name}")
        speed = float(plan["speed_after"].get(name, 1.0))
        segments.append({"name": name, "next": next_name, "start": start_time,
                         "end": end_time, "speed": speed})
    pad = max(0.0, markers[end] - raw_duration)
    duration = sum((item["end"] - item["start"]) / item["speed"] for item in segments) + pad
    return segments, pad, duration


def filter_graph(segments: list[dict], pad: float):
    terms = [
        f"clip(PTS*TB-{item['start']:.6f}\\,0\\,"
        f"{item['end'] - item['start']:.6f})/{item['speed']:.6f}"
        for item in segments
    ]
    tail = (f"[0:v]trim=start={segments[0]['start']:.6f}:end={segments[-1]['end']:.6f},"
            f"setpts=({'+'.join(terms)})/TB,fps=30")
    if pad > 0:
        tail += f",tpad=stop_mode=clone:stop_duration={pad:.6f}"
    return tail + ",format=yuv420p[v]"


def verify_output(path: Path, min_duration: float, max_duration: float):
    result = probe(path)
    duration = float(result["format"]["duration"])
    if not min_duration <= duration <= max_duration:
        raise ValueError(f"App Store preview duration {duration:.3f}s outside "
                         f"{min_duration:g}–{max_duration:g}s")
    videos = [stream for stream in result["streams"] if stream["codec_name"] == "h264"]
    audios = [stream for stream in result["streams"] if stream["codec_name"] == "aac"]
    if len(videos) != 1 or len(audios) != 1:
        raise ValueError("Expected one H.264 video and one AAC audio stream")
    video, audio = videos[0], audios[0]
    if (video["profile"] != "High" or video["pix_fmt"] != "yuv420p" or
            (video["width"], video["height"]) != (886, 1920) or
            video["avg_frame_rate"] != "30/1" or audio["channels"] != 2):
        raise ValueError("App Store preview stream settings are invalid")
    if int(video.get("bit_rate", 0)) > 12_000_000:
        raise ValueError("Video bit rate exceeds 12 Mbps")
    return duration, result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("locale")
    args = parser.parse_args()
    work = Path(os.environ["PRAY_VIDEO_SCRATCH_DIR"])
    args.raw = work / "raw" / f"{args.locale}-full.mp4"
    args.markers = work / "raw" / f"{args.locale}-full.markers.json"
    args.plan = Path("store/video/pacing.json")
    args.output = work / "final" / f"appstore-{args.locale}.mp4"
    if not args.raw.is_file():
        parser.error(f"Raw take missing: {args.raw}")
    markers, names = validate_markers(args.markers, args.locale)
    plan = validate_plan(args.plan, markers)
    duration_limits = json.loads(args.plan.read_text())["verification"]
    min_duration = duration_limits["min_duration_seconds"]
    max_duration = duration_limits["max_duration_seconds"]
    raw_duration = float(probe(args.raw)["format"]["duration"])
    build = work / f"montage-{args.locale}"
    build.mkdir(parents=True, exist_ok=True)
    encode_started = time.monotonic()
    normalized = build / "normalized.mkv"
    with (build / "normalize.log").open("w") as log:
        result = subprocess.run([
            "ffmpeg", "-y", "-v", "error", "-i", str(args.raw),
            "-vf", "setpts=if(eq(N\\,0)\\,0\\,PREV_OUTPTS+"
            "if(lt(PTS\\,PREV_INPTS)\\,1/(60*TB)\\,PTS-PREV_INPTS)),"
            "fps=30,scale=886:1920:force_original_aspect_ratio=increase,"
            "crop=886:1920,setsar=1,format=yuv420p",
            "-an", "-c:v", "ffv1", str(normalized),
        ], stdout=log, stderr=subprocess.STDOUT)
    (build / "normalize.exit").write_text(f"{result.returncode}\n")
    if result.returncode:
        raise RuntimeError(f"Raw video normalization failed; see {build / 'normalize.log'}")
    normalized_duration = float(probe(normalized)["format"]["duration"])
    segments, pad, predicted = make_segments(markers, names, plan, normalized_duration)
    summary = {"raw_duration": raw_duration, "normalized_duration": normalized_duration,
               "head_trim": markers[plan["start_marker"]],
               "tail_trim": max(0.0, normalized_duration - markers[plan["end_marker"]]),
               "tail_still_frame": pad, "predicted_duration": predicted, "segments": segments}
    (build / "plan.json").write_text(json.dumps(summary, indent=2) + "\n")
    if not min_duration <= predicted <= max_duration:
        trim = [item for item in segments if item["name"] in TRANSITIONS and item["speed"] < 1.5]
        options = ", ".join(
            f"{item['name']} ({(item['end'] - item['start']) / item['speed']:.2f}s)"
            for item in trim
        )
        raise ValueError(
            f"Planned duration {predicted:.3f}s outside {min_duration:g}–{max_duration:g}s. "
            f"Consider shortening only these non-reading transitions: {options}. "
            f"No reading hold was cut; see {build / 'plan.json'}"
        )
    graph = build / "filter.txt"
    graph.write_text(filter_graph(segments, pad))
    pending = build / "pending.mp4"
    with (build / "ffmpeg.log").open("w") as log:
        result = subprocess.run([
            "ffmpeg", "-y", "-v", "error", "-i", str(normalized),
            "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
            "-filter_complex_script", str(graph), "-map", "[v]", "-map", "1:a:0",
            "-shortest", "-r", "30", "-c:v", "libx264", "-preset", "slow",
            "-crf", "18", "-maxrate", "12M", "-bufsize", "16M", "-profile:v", "high",
            "-level", "4.2", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
            "-ac", "2", "-movflags", "+faststart", str(pending),
        ], stdout=log, stderr=subprocess.STDOUT)
    (build / "ffmpeg.exit").write_text(f"{result.returncode}\n")
    if result.returncode:
        raise RuntimeError(f"FFmpeg montage failed; see {build / 'ffmpeg.log'}")
    encode_seconds = time.monotonic() - encode_started
    verify_started = time.monotonic()
    actual, metadata = verify_output(pending, min_duration, max_duration)
    (build / "ffprobe.json").write_text(json.dumps(metadata, indent=2) + "\n")
    with (build / "decode.log").open("w") as log:
        decoded = subprocess.run(["ffmpeg", "-v", "error", "-i", str(pending), "-f", "null", "-"],
                                 stdout=log, stderr=subprocess.STDOUT)
    (build / "decode.exit").write_text(f"{decoded.returncode}\n")
    if decoded.returncode or (build / "decode.log").stat().st_size:
        raise RuntimeError(f"Montage full decode failed; see {build / 'decode.log'}")
    verify_seconds = time.monotonic() - verify_started
    args.output.parent.mkdir(parents=True, exist_ok=True)
    pending.replace(args.output)
    summary["actual_duration"] = actual
    (build / "plan.json").write_text(json.dumps(summary, indent=2) + "\n")
    (build / "stage-seconds.json").write_text(
        json.dumps({"montage": round(encode_seconds, 3), "verification": round(verify_seconds, 3)}, indent=2) + "\n"
    )
    print(f"App Store preview: {args.output} ({actual:.3f}s)")


if __name__ == "__main__":
    main()
