#!/usr/bin/env python3
"""Calibrate, record, and verify one App Store preview take with AXe."""
from __future__ import annotations

import argparse
import errno
import json
import math
import os
import pty
import subprocess
import time
from pathlib import Path

from appstore_video_keyboard import typing_steps

CALIBRATION_POLL_SECONDS = 0.1
CALIBRATION_TIMEOUT_SECONDS = 15.0

def nodes(node):
    if isinstance(node, dict):
        yield node
        for child in node.get("children", []):
            yield from nodes(child)
    elif isinstance(node, list):
        for child in node:
            yield from nodes(child)


def one_element(tree, element_id: str):
    matches = [item for item in nodes(tree) if item.get("AXUniqueId") == element_id and item.get("enabled")]
    distinct = {
        (item["frame"]["x"], item["frame"]["y"], item["frame"]["width"], item["frame"]["height"]): item
        for item in matches if item.get("frame")
    }
    if len(distinct) > 1:
        raise RuntimeError(f"Ambiguous accessibility element: {element_id}")
    return next(iter(distinct.values())) if distinct else None


def on_screen(tree, item):
    screen = tree[0]["frame"]
    frame = item["frame"]
    return (frame["x"] < screen["x"] + screen["width"] and
            frame["x"] + frame["width"] > screen["x"] and
            frame["y"] < screen["y"] + screen["height"] and
            frame["y"] + frame["height"] > screen["y"])


class Driver:
    def __init__(self, args):
        self.udid = args.udid
        self.locale = args.locale
        self.log_dir = args.log_dir
        self.coords_path = args.coords
        self.markers_path = args.markers
        self.record_origin = args.record_origin
        pacing = json.loads(args.pacing.read_text())
        if pacing.get("schema") != 1:
            raise ValueError("Unsupported video pacing schema")
        self.pause = pacing["recording_pause_seconds"]
        self.typing_delay = pacing["typing_delay_seconds"]
        self.special_pause = pacing["special_key_pause_seconds"]
        self.threshold_hold = pacing["threshold_hold_seconds"]
        self.marker_settle = pacing["marker_settle_seconds"]
        self.question_capture = pacing["verification"]
        required_pauses = {
            "home_before_start", "after_home_tap", "before_intention", "after_intention",
            "before_threshold_hold", "first_question_after_visible", "after_answer_open",
            "before_answer_typing", "after_answer_typing", "before_next_question",
            "second_question_before_scripture", "scripture_before_finish",
            "before_reflection_input", "before_reflection_typing", "after_reflection_typing",
            "after_reflection_return", "home_before_journal", "before_journal_expand",
            "journal_final_hold",
        }
        if set(self.pause) != required_pauses or set(self.typing_delay) != {"intention", "answer", "reflection"} or set(self.special_pause) != {"before_punctuation", "after_punctuation", "after_uppercase"}:
            raise ValueError("Video pacing keys do not match the recorded story")
        values = [*self.pause.values(), *self.typing_delay.values(), *self.special_pause.values(), self.threshold_hold]
        if any(not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0 for value in values):
            raise ValueError("Video pacing values must be positive finite seconds")
        limits = pacing["verification"]
        if (self.threshold_hold < limits["min_threshold_hold_seconds"] or
                self.pause["home_before_journal"] < limits["min_home_hold_seconds"]):
            raise ValueError("Threshold or home hold is shorter than the required minimum")
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.step = 0
        self.coords = {}
        self.touch_times = []
        self.key_times = []
        self.question_visible_at = None
        self.question_reference_path = self.coords_path.with_suffix(".question.gray")
        self.question_frame_index = 0
        fixture = json.loads(args.fixture.read_text())
        locale_fixture = fixture["locales"][self.locale]
        typed = locale_fixture["typed"]
        self.capture = locale_fixture["capture"]
        self.questions = locale_fixture["questions"]
        self.keyboard = json.loads(args.keyboard_map.read_text())[self.locale]
        self.copy = (typed["intention"], typed["answer"], typed["takeaway"])

    def command(self, name: str, args: list[str]):
        self.step += 1
        path = self.log_dir / f"{self.step:03d}-{name}.log"
        if name.startswith("recorded-"):
            rc = self.traced_command(args, path)
        else:
            with path.open("w") as out:
                rc = subprocess.run(args, stdout=out, stderr=subprocess.STDOUT).returncode
        (self.log_dir / f"{self.step:03d}-{name}.exit").write_text(f"{rc}\n")
        if rc:
            raise RuntimeError(f"{name} failed ({rc}); see {path}")

    def traced_command(self, args: list[str], path: Path):
        master, slave = pty.openpty()
        started = time.monotonic()
        process = subprocess.Popen(args, stdout=slave, stderr=slave, close_fds=True)
        os.close(slave)
        pending = b""
        trace_path = self.log_dir / "recorded-key-events.tsv"
        with path.open("w") as log, trace_path.open("a") as trace:
            while True:
                try:
                    chunk = os.read(master, 4096)
                except OSError as exc:
                    if exc.errno == errno.EIO:
                        break
                    raise
                if not chunk:
                    break
                pending += chunk
                while b"\n" in pending:
                    raw, pending = pending.split(b"\n", 1)
                    line = raw.decode("utf-8", errors="replace").rstrip("\r")
                    elapsed = time.monotonic() - started
                    log.write(f"{elapsed:.6f}\t{line}\n")
                    if "Sending Touch" in line:
                        self.touch_times.append(started + elapsed - self.record_origin)
                    if "Sending Composite [Key" in line or "Sending Key" in line:
                        trace.write(f"{started + elapsed - self.record_origin:.6f}\t{line}\n")
                        self.key_times.append((started + elapsed - self.record_origin, line))
            if pending:
                log.write(f"{time.monotonic() - started:.6f}\t{pending.decode('utf-8', errors='replace')}\n")
        os.close(master)
        return process.wait()

    def question_frame(self) -> tuple[bytes, float]:
        self.question_frame_index += 1
        path = self.log_dir / f"question-screen-{self.question_frame_index:02d}.png"
        screenshot = subprocess.run(
            ["xcrun", "simctl", "io", self.udid, "screenshot", "--type=png", str(path)],
            capture_output=True,
        )
        captured_at = time.monotonic()
        if screenshot.returncode or not path.is_file():
            raise RuntimeError(f"Question screenshot failed: {screenshot.stderr.decode(errors='replace')}")
        image = path.read_bytes()
        if not image.startswith(b"\x89PNG"):
            raise RuntimeError(f"Question screenshot is not PNG: {path}")
        x, y, width, height = self.question_capture["first_question_crop"]
        decoded = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", "pipe:0", "-vf",
             f"scale=886:1920,crop={width}:{height}:{x}:{y},format=gray",
             "-frames:v", "1", "-f", "rawvideo", "pipe:1"],
            input=image, capture_output=True,
        )
        if decoded.returncode or len(decoded.stdout) != width * height:
            raise RuntimeError(f"Question screenshot decode failed: {decoded.stderr.decode(errors='replace')}")
        return decoded.stdout, captured_at

    def wait_question_visible(self) -> None:
        reference = self.question_reference_path.read_bytes()
        width, height = self.question_capture["first_question_crop"][2:]
        if len(reference) != width * height:
            raise RuntimeError("Calibrated first-question frame has an invalid size")
        deadline = time.monotonic() + self.question_capture["first_question_visibility_timeout_seconds"]
        samples = []
        while True:
            frame, captured_at = self.question_frame()
            difference = sum(abs(a - b) for a, b in zip(frame, reference)) / len(reference)
            samples.append({"time": round(captured_at - self.record_origin, 3),
                            "mean_pixel_difference": round(difference, 4)})
            if difference <= self.question_capture["first_question_visibility_max_difference"]:
                self.question_visible_at = captured_at - self.record_origin
                (self.log_dir / "question-visibility.json").write_text(
                    json.dumps({"matched": True, "samples": samples}, indent=2) + "\n")
                return
            if time.monotonic() >= deadline:
                (self.log_dir / "question-visibility.json").write_text(
                    json.dumps({"matched": False, "samples": samples}, indent=2) + "\n")
                raise RuntimeError("First question did not match its fully visible calibration frame")
            time.sleep(self.question_capture["first_question_visibility_poll_seconds"])

    def snapshot(self, name: str):
        self.step += 1
        path = self.log_dir / f"{self.step:03d}-{name}.json"
        with path.open("w") as out:
            result = subprocess.run(["axe", "describe-ui", "--udid", self.udid], stdout=out, stderr=subprocess.PIPE, text=True)
        (self.log_dir / f"{self.step:03d}-{name}.exit").write_text(f"{result.returncode}\n")
        if result.returncode:
            raise RuntimeError(f"describe-ui failed: {result.stderr.strip()}; see {path}")
        return json.loads(path.read_text())

    def locate(self, element_id: str, *, timeout: float | None = None,
               expected_text: str | None = None, expected_value: str | None = None,
               absent_ids: tuple[str, ...] = ()):
        deadline = time.monotonic() + (CALIBRATION_TIMEOUT_SECONDS if timeout is None else timeout)
        while True:
            tree = self.snapshot(element_id)
            item = one_element(tree, element_id)
            if element_id == "dock-next-question-button":
                label = self.capture["next_question_label"]
                matches = [node for node in nodes(tree)
                           if node.get("AXLabel") == label and node.get("enabled") and
                           node.get("frame") and on_screen(tree, node)]
                if len(matches) > 1:
                    raise RuntimeError(f"Ambiguous next-question control: {len(matches)} matches")
                item = matches[0] if matches else None
            elif element_id == "journal-top-entry":
                entries = [node for node in nodes(tree)
                           if self.copy[0] in str(node.get("AXLabel") or "") and node.get("frame")]
                item = min(entries, key=lambda node: node["frame"]["y"]) if entries else None
            if (item and (expected_value is not None and item.get("AXValue") != expected_value or
                          expected_text is not None and not any(node.get("AXLabel") == expected_text
                                                              for node in nodes(tree)) or
                          any(absent and on_screen(tree, absent)
                              for absent in (one_element(tree, absent_id) for absent_id in absent_ids)))):
                item = None
            if item:
                frame = item["frame"]
                point = [round(frame["x"] + frame["width"] / 2, 1),
                         round(frame["y"] + frame["height"] / 2, 1)]
                self.coords[element_id] = point
                return item
            if time.monotonic() >= deadline:
                raise RuntimeError(f"Transition did not become ready: {element_id} "
                                   f"within {CALIBRATION_TIMEOUT_SECONDS if timeout is None else timeout}s")
            time.sleep(CALIBRATION_POLL_SECONDS)

    def tap(self, element_id: str, *, timeout: float | None = None):
        self.locate(element_id, timeout=timeout)
        x, y = self.coords[element_id]
        self.command(element_id, ["axe", "tap", "-x", str(x), "-y", str(y),
                                  "--tap-style", "physical", "--udid", self.udid])

    def type_text(self, value: str, field_id: str, delay: float):
        path = self.log_dir / f"{self.step + 1:03d}-typing.steps"
        path.write_text("\n".join(typing_steps(value, self.keyboard, delay, self.special_pause)) + "\n")
        self.command("typing", ["axe", "batch", "--udid", self.udid, "--file", str(path)])
        tree = self.snapshot("typed-value")
        item = one_element(tree, field_id)
        if not item or item.get("AXValue") != value:
            raise RuntimeError(f"Typed {field_id} differs: {item.get('AXValue') if item else None!r} != {value!r}")

    def input_value(self):
        item = one_element(self.snapshot("keyboard-value"), "setup-goal-input")
        if not item:
            raise RuntimeError("Goal input missing during keyboard preflight")
        return item.get("AXValue") or ""

    def clear_goal_input(self):
        current = self.input_value()
        if len(current) > 1:
            self.command("select-goal", ["axe", "key-combo", "--modifiers", "227", "--key", "4", "--udid", self.udid])
            time.sleep(0.15)
        self.command("clear-goal", ["axe", "key", "42", "--udid", self.udid])
        time.sleep(0.2)
        if self.input_value():
            raise RuntimeError("Keyboard preflight could not clear its probe text")

    def ensure_keyboard_layout(self):
        expected = self.capture["keyboard_probe"]
        self.command("keyboard-probe", ["axe", "key", "22", "--udid", self.udid])
        observed = self.input_value().lower()
        if observed != expected:
            self.command("keyboard-switch", ["axe", "key-combo", "--modifiers", "224", "--key", "44", "--udid", self.udid])
            self.clear_goal_input()
            self.command("keyboard-probe", ["axe", "key", "22", "--udid", self.udid])
            observed = self.input_value().lower()
        if observed != expected:
            raise RuntimeError(f"Active keyboard layout mismatch: expected {self.locale}, got {observed!r}")
        self.clear_goal_input()
        print(f"Verified active {self.locale} keyboard layout", flush=True)

    def keyboard_preflight(self):
        self.tap("start-prayer-button")
        self.tap("setup-goal-input")
        self.ensure_keyboard_layout()
        self.command("setup-back", ["axe", "tap", "-x", "45", "-y", "100",
                                    "--tap-style", "physical", "--udid", self.udid])
        self.locate("start-prayer-button", timeout=5)

    def calibrate(self):
        intention, answer, takeaway = self.copy
        self.tap("start-prayer-button")
        self.locate("setup-goal-input")
        self.tap("setup-goal-input")
        self.locate("setup-goal-input")
        self.ensure_keyboard_layout()
        self.type_text(intention, "setup-goal-input", self.typing_delay["intention"])
        self.locate("setup-next-button")
        duration = self.locate("setup-duration-value")
        if "5" not in str(duration.get("AXLabel")):
            raise RuntimeError("The setup duration is not five minutes")
        self.tap("setup-next-button")
        self.locate("threshold-hold-button")
        x, y = self.coords["threshold-hold-button"]
        self.command("hold", ["axe", "touch", "-x", str(x), "-y", str(y),
                              "--down", "--up", "--delay", str(self.threshold_hold), "--udid", self.udid])
        self.locate("dock-answer-button", timeout=45, expected_text=self.questions["first"])
        time.sleep(self.question_capture["first_question_reference_settle_seconds"])
        reference, _ = self.question_frame()
        self.question_reference_path.write_bytes(reference)
        self.tap("dock-answer-button")
        self.locate("answer-input")
        self.tap("answer-input")
        self.locate("answer-input")
        self.type_text(answer, "answer-input", self.typing_delay["answer"])
        self.locate("answer-save-button")
        self.tap("answer-save-button")
        self.locate("dock-next-question-button", absent_ids=("answer-sheet-handle",))
        self.tap("dock-next-question-button")
        self.locate("dock-answer-button", expected_text=self.questions["next"])
        self.tap("dock-scripture-tab")
        self.locate("scripture-audio-button")
        self.tap("session-finish-button")
        self.locate("reflect-question", expected_text=self.questions["reflect"])
        self.tap("reflection-input")
        self.locate("reflection-input")
        self.type_text(takeaway, "reflection-input", self.typing_delay["reflection"])
        self.locate("reflection-input", expected_value=takeaway)
        self.command("return", ["axe", "key", "40", "--udid", self.udid])
        self.locate("reflect-complete-button")
        self.tap("reflect-complete-button")
        self.locate("prayer-saved-notice")
        self.tap("journal-button")
        self.locate("journal-top-entry")
        self.tap("journal-top-entry")
        self.locate("journal-title", expected_text=answer)
        self.verify_end()
        tree = self.snapshot("screen-size")
        if not isinstance(tree, list) or len(tree) != 1 or "frame" not in tree[0]:
            raise RuntimeError("Cannot determine simulator screen size from accessibility")
        screen = tree[0]["frame"]
        if screen["x"] != 0 or screen["y"] != 0 or screen["width"] <= 0 or screen["height"] <= 0:
            raise RuntimeError("Invalid simulator accessibility screen frame")
        self.coords_path.write_text(json.dumps({"locale": self.locale, "udid": self.udid,
                                                "screen": screen, "coordinates": self.coords},
                                               ensure_ascii=False, indent=2) + "\n")
        print(f"Calibrated {len(self.coords)} element coordinates", flush=True)

    def verify_end(self):
        intention, answer, takeaway = self.copy
        tree = self.snapshot("journal-verification")
        if not one_element(tree, "journal-title"):
            raise RuntimeError("Journal title missing after take")
        labels = "\n".join(str(item.get("AXLabel") or "") + "\n" + str(item.get("AXValue") or "")
                           for item in nodes(tree))
        if any(value not in labels for value in (intention, answer, takeaway)):
            raise RuntimeError("Expanded journal entry or answers missing after take")
        print("Verified expanded journal entry and answers", flush=True)

    def recorded_steps(self):
        data = json.loads(self.coords_path.read_text())
        if data.get("locale") != self.locale or data.get("udid") != self.udid:
            raise RuntimeError("Calibration locale or simulator does not match recorded take")
        coords = data["coordinates"]

        def tap(element_id: str):
            if element_id not in coords:
                raise RuntimeError(f"Coordinate not calibrated: {element_id}")
            x, y = coords[element_id]
            return f"tap -x {x} -y {y}"

        def touch(element_id: str):
            if element_id not in coords:
                raise RuntimeError(f"Coordinate not calibrated: {element_id}")
            x, y = coords[element_id]
            return f"touch -x {x} -y {y} --down --up --delay {self.threshold_hold}"

        def pause(name: str):
            return f"sleep {self.pause[name]}"

        intention, answer, takeaway = self.copy
        return [
            pause("home_before_start"), tap("start-prayer-button"),
            pause("after_home_tap"), tap("setup-goal-input"),
            pause("before_intention"),
            *typing_steps(intention, self.keyboard, self.typing_delay["intention"], self.special_pause),
            pause("after_intention"), tap("setup-next-button"),
            pause("before_threshold_hold"), touch("threshold-hold-button"),
            "wait-for-visible-first-question", tap("dock-answer-button"),
            pause("after_answer_open"), tap("answer-input"),
            pause("before_answer_typing"),
            *typing_steps(answer, self.keyboard, self.typing_delay["answer"], self.special_pause),
            pause("after_answer_typing"), tap("answer-save-button"),
            pause("before_next_question"), tap("dock-next-question-button"),
            pause("second_question_before_scripture"), tap("dock-scripture-tab"),
            pause("scripture_before_finish"), tap("session-finish-button"),
            pause("before_reflection_input"), tap("reflection-input"),
            pause("before_reflection_typing"),
            *typing_steps(takeaway, self.keyboard, self.typing_delay["reflection"], self.special_pause),
            pause("after_reflection_typing"), "key 40",
            pause("after_reflection_return"), tap("reflect-complete-button"),
            pause("home_before_journal"), tap("journal-button"),
            pause("before_journal_expand"), tap("journal-top-entry"),
            pause("journal_final_hold"),
        ]

    def write_markers(self, elapsed: float):
        if len(self.touch_times) != 28:
            raise RuntimeError(f"Expected 28 physical touch events for markers, got {len(self.touch_times)}")
        touch = self.touch_times
        def typing_span(after, before, *, omit_return=False):
            keys = [(at, line) for at, line in self.key_times if touch[after] < at < touch[before]]
            if omit_return:
                keys = keys[:-2]  # AXe пишет нажатие и отпускание Return двумя последними событиями.
            if len(keys) < 2:
                raise RuntimeError(f"Typing markers need at least two key events: {after}, {before}")
            return round(keys[0][0] - 0.03, 3), round(keys[-1][0] + 0.09, 3)
        intention_start, intention_end = typing_span(3, 4)
        answer_start, answer_end = typing_span(11, 12)
        reflection_start, reflection_end = typing_span(21, 22, omit_return=True)
        marker_times = {
            "home_ready": max(0.0, touch[0] - self.pause["home_before_start"]),
            "home_tap_down": touch[0], "home_tap_up": touch[1],
            "setup_input_down": touch[2], "setup_input_up": touch[3],
            "intention_typing_start": intention_start, "intention_typing_end": intention_end,
            "setup_next_down": touch[4], "setup_next_up": touch[5],
            "threshold_hold_down": touch[6], "threshold_hold_up": touch[7],
            "question_read_start": self.question_visible_at,
            "answer_open_down": touch[8], "answer_open_up": touch[9],
            "answer_input_down": touch[10], "answer_input_up": touch[11],
            "answer_typing_start": answer_start, "answer_typing_end": answer_end,
            "answer_save_down": touch[12], "answer_save_up": touch[13],
            "next_question_down": touch[14], "next_question_up": touch[15],
            "next_question_read_start": touch[15] + self.marker_settle["next_question"],
            "scripture_open_down": touch[16], "scripture_open_up": touch[17],
            "scripture_read_start": touch[17] + self.marker_settle["scripture"],
            "session_finish_down": touch[18], "session_finish_up": touch[19],
            "reflection_read_start": touch[19] + self.marker_settle["reflection"],
            "reflection_input_down": touch[20], "reflection_input_up": touch[21],
            "reflection_typing_start": reflection_start, "reflection_typing_end": reflection_end,
            "reflection_save_down": touch[22], "reflection_save_up": touch[23],
            "saved_notice_start": touch[23] + self.marker_settle["saved_notice"],
            "journal_open_down": touch[24], "journal_open_up": touch[25],
            "journal_expand_down": touch[26], "journal_expand_up": touch[27],
            "journal_read_start": touch[27] + self.marker_settle["journal"],
            "journal_end": touch[27] + self.pause["journal_final_hold"],
        }
        names = list(marker_times)
        if any(marker_times[b] <= marker_times[a] for a, b in zip(names, names[1:])):
            raise RuntimeError("Recorded story markers are not strictly ordered")
        payload = {"schema": 1, "locale": self.locale, "source": "AXe physical touch timestamps",
                   "recorded_wall_seconds": round(elapsed, 3),
                   "markers": [{"name": name, "time": round(marker_times[name], 3)} for name in names]}
        self.markers_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")

    def record(self):
        steps = self.recorded_steps()
        anchor = steps.index("wait-for-visible-first-question")
        intro = self.log_dir / "recorded-intro.steps"
        outro = self.log_dir / "recorded-outro.steps"
        intro.write_text("\n".join(steps[:anchor]) + "\n")
        outro.write_text("\n".join(steps[anchor + 1:]) + "\n")
        started = time.monotonic()
        self.command("recorded-intro", ["axe", "batch", "--udid", self.udid, "--file", str(intro),
                                        "--tap-style", "physical", "--verbose"])
        self.wait_question_visible()
        time.sleep(self.pause["first_question_after_visible"])
        self.command("recorded-outro", ["axe", "batch", "--udid", self.udid, "--file", str(outro),
                                        "--tap-style", "physical", "--verbose"])
        elapsed = time.monotonic() - started
        self.write_markers(elapsed)
        (self.log_dir / "recorded-take-wall-seconds.txt").write_text(f"{elapsed:.3f}\n")
        print(f"Recorded AXe actions completed in {elapsed:.1f}s", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("calibrate", "keyboard-preflight", "record", "verify"), required=True)
    parser.add_argument("--locale", required=True)
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--pacing", type=Path, required=True)
    parser.add_argument("--keyboard-map", type=Path, required=True)
    parser.add_argument("--udid", required=True)
    parser.add_argument("--log-dir", type=Path, required=True)
    parser.add_argument("--coords", type=Path, required=True)
    parser.add_argument("--record-origin", type=float)
    parser.add_argument("--markers", type=Path)
    args = parser.parse_args()
    if args.mode == "record" and (args.record_origin is None or args.markers is None):
        parser.error("record mode requires --record-origin and --markers")
    driver = Driver(args)
    if args.mode == "calibrate":
        driver.calibrate()
    elif args.mode == "keyboard-preflight":
        driver.keyboard_preflight()
    elif args.mode == "record":
        driver.record()
    else:
        driver.verify_end()


if __name__ == "__main__":
    main()
