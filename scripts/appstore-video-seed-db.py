#!/usr/bin/env python3
"""Create and install a verified off-camera SQLite seed for the video simulator."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent.parent
CONSENT_KEYS = ("core_prayer_ai", "answer_context", "audio_transcription")


def consent_contract() -> tuple[int, str]:
    source = (ROOT / "lib/privacyConsent.ts").read_text()
    version = re.search(r"export const PRIVACY_NOTICE_VERSION = (\d+);", source)
    provider = re.search(r"export const PRIVACY_PROVIDER_CONTRACT = '([^']+)';", source)
    if not version or not provider:
        raise ValueError("Current privacy consent contract could not be read")
    return int(version.group(1)), provider.group(1)


def verify_database(path: Path, locale: str, fixture: dict, day: str) -> None:
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Seed database integrity check failed")
        sessions = db.execute("SELECT topic,planned_minutes,elapsed_sec,takeaway FROM sessions").fetchall()
        answers = db.execute("SELECT question_index,question,text FROM answers").fetchall()
        if sessions != [(fixture["seed"]["intention"], 5, 53, fixture["seed"]["takeaway"])]:
            raise ValueError("Seed database must contain exactly the previous journal session")
        if answers != [(0, fixture["questions"]["first"], fixture["seed"]["answer"])]:
            raise ValueError("Seed answer differs from the fixture")
        if db.execute("SELECT day FROM prayed_days").fetchall() != [(day,)]:
            raise ValueError("Seed prayed day differs from the simulator date")
        meta = dict(db.execute("SELECT key,value FROM meta"))
        if meta.get("ui_language") != locale or meta.get("prayer_minutes") != "5":
            raise ValueError("Seed language or prayer duration is invalid")
        for purpose in CONSENT_KEYS:
            decision = json.loads(meta[f"privacy_consent_{purpose}"])["decision"]
            expected = "undecided" if purpose == "audio_transcription" else "allowed"
            if decision != expected:
                raise ValueError(f"Seed consent differs for {purpose}")
    finally:
        db.close()


def create_database(args) -> None:
    for name in ("lib/db.ts", "lib/settings.ts"):
        if not (ROOT / name).is_file():
            raise ValueError(f"Current app source missing: {name}")
    version, provider = consent_contract()
    fixture = json.loads(args.fixture.read_text())["locales"][args.locale]
    if fixture["typed"]["intention"].strip().casefold() == fixture["seed"]["intention"].strip().casefold():
        raise ValueError("The seed journal topic duplicates the filmed topic")
    output = args.output.resolve()
    runs = ROOT / "store/video/runs"
    if (ROOT in output.parents and runs not in output.parents) or output.exists():
        raise ValueError("Seed database output must be new and inside store/video/runs or outside the repository")
    output.parent.mkdir(parents=True, exist_ok=True)
    local_now = datetime.now(timezone.utc).astimezone(ZoneInfo(args.app_timezone))
    day = local_now.date().isoformat()
    started_at = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    catalog = fixture["catalog"]
    preferences = {
        "language": args.locale,
        "languageName": fixture["language_name_national"],
        "translationCode": catalog["translation"],
        "translationAlias": catalog["translation_alias"],
        "translationName": catalog["translation_name"],
        "voiceCode": catalog["voice"],
        "voiceAlias": catalog["voice_alias"],
        "voiceName": catalog["voice_name"],
        "voiceIsMusic": False,
    }
    db = sqlite3.connect(output)
    try:
        db.executescript("""
            PRAGMA foreign_keys = ON;
            CREATE TABLE sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              started_at TEXT NOT NULL,
              topic TEXT NOT NULL DEFAULT '',
              planned_minutes INTEGER NOT NULL,
              elapsed_sec INTEGER NOT NULL DEFAULT 0,
              takeaway TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE answers (
              session_id INTEGER NOT NULL REFERENCES sessions(id),
              question_index INTEGER NOT NULL,
              question TEXT NOT NULL,
              text TEXT NOT NULL DEFAULT '',
              PRIMARY KEY (session_id, question_index)
            );
            CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE prayed_days (day TEXT PRIMARY KEY);
        """)
        db.execute("INSERT INTO sessions (id,started_at,topic,planned_minutes,elapsed_sec,takeaway) VALUES (1,?,?,?,?,?)",
                   (started_at, fixture["seed"]["intention"], 5, 53, fixture["seed"]["takeaway"]))
        db.execute("INSERT INTO answers (session_id,question_index,question,text) VALUES (1,0,?,?)",
                   (fixture["questions"]["first"], fixture["seed"]["answer"]))
        db.execute("INSERT INTO prayed_days (day) VALUES (?)", (day,))
        meta = {"ui_language": args.locale, "prayer_minutes": "5",
                "scripture_preferences": json.dumps(preferences, ensure_ascii=False, separators=(",", ":"))}
        for purpose in CONSENT_KEYS:
            decision = "undecided" if purpose == "audio_transcription" else "allowed"
            meta[f"privacy_consent_{purpose}"] = json.dumps(
                {"decision": decision, "noticeVersion": version, "providerContract": provider},
                separators=(",", ":"),
            )
        db.executemany("INSERT INTO meta (key,value) VALUES (?,?)", meta.items())
        db.commit()
    finally:
        db.close()
    verify_database(output, args.locale, fixture, day)
    (output.parent / "seed-manifest.json").write_text(json.dumps({
        "locale": args.locale, "day": day, "topic": fixture["seed"]["intention"],
        "database_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "consent_notice_version": version, "consent_provider_contract": provider,
    }, ensure_ascii=False, indent=2) + "\n")
    print(f"Seed database ready: {output}")


def install_database(args) -> None:
    state = subprocess.check_output(["xcrun", "simctl", "list", "devices", "-j"], text=True)
    devices = [item for group in json.loads(state)["devices"].values() for item in group if item["udid"] == args.udid]
    if len(devices) != 1 or devices[0]["state"] != "Shutdown":
        raise ValueError("Video simulator must be shut down before DB installation")
    manifest = json.loads((args.database.parent / "seed-manifest.json").read_text())
    if hashlib.sha256(args.database.read_bytes()).hexdigest() != manifest["database_sha256"]:
        raise ValueError("Seed database SHA-256 differs from its manifest")
    fixture = json.loads(args.fixture.read_text())["locales"][manifest["locale"]]
    verify_database(args.database, manifest["locale"], fixture, manifest["day"])
    folder = args.container / "Documents/SQLite"
    if not (args.container / "Documents").is_dir():
        raise ValueError(f"Installed app Documents directory missing: {args.container}")
    folder.mkdir(exist_ok=True)
    target = folder / "lampada.db"
    for name in ("lampada.db-wal", "lampada.db-shm"):
        (folder / name).unlink(missing_ok=True)
    pending = folder / "lampada.db.video-pending"
    if pending.exists():
        raise ValueError(f"Stale pending seed database: {pending}")
    shutil.copy2(args.database, pending)
    os.replace(pending, target)
    verify_database(target, manifest["locale"], fixture, manifest["day"])
    print(f"Installed verified seed database for {manifest['locale']} in {args.container}")


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create")
    create.add_argument("--locale", required=True)
    create.add_argument("--app-timezone", required=True)
    create.add_argument("--fixture", type=Path, required=True)
    create.add_argument("--output", type=Path, required=True)
    install = commands.add_parser("install")
    install.add_argument("--database", type=Path, required=True)
    install.add_argument("--fixture", type=Path, required=True)
    install.add_argument("--container", type=Path, required=True)
    install.add_argument("--udid", required=True)
    args = parser.parse_args()
    if args.command == "create":
        create_database(args)
    else:
        install_database(args)


if __name__ == "__main__":
    main()
