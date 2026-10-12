#!/usr/bin/env python3
"""Seed the Play screenshot state into the installed test Release through the signed DB probe.

Reuses the App Store video seed contract (scripts/appstore-video-seed-db.py): ui_language,
prayer_minutes=5, scripture_preferences from the fixture catalog, consents core/answer allowed and
transcription undecided. Adds prayed_days for the last 5 local days so Home shows the 5-day week.
Usage: play-screens-seed.py <fixture.json> <locale> <today YYYY-MM-DD in emulator local time>
"""
import importlib.util, json, subprocess, sys
from pathlib import Path
from datetime import date, timedelta
fixture_path, locale, today = sys.argv[1:4]
repo = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("seed", f"{repo}/scripts/appstore-video-seed-db.py")
seed = importlib.util.module_from_spec(spec); spec.loader.exec_module(seed)
version, provider = seed.consent_contract()
item = json.load(open(fixture_path))["locales"][locale]
c = item["catalog"]
prefs = {"language": locale, "languageName": item["language_name_national"], "translationCode": c["translation"],
         "translationAlias": c["translation_alias"], "translationName": c["translation_name"], "voiceCode": c["voice"],
         "voiceAlias": c["voice_alias"], "voiceName": c["voice_name"], "voiceIsMusic": False}
meta = {"ui_language": locale, "prayer_minutes": "5",
        "scripture_preferences": json.dumps(prefs, ensure_ascii=False, separators=(",", ":"))}
for purpose in seed.CONSENT_KEYS:
    meta[f"privacy_consent_{purpose}"] = json.dumps({"decision": "undecided" if purpose == "audio_transcription" else "allowed",
                                                     "noticeVersion": version, "providerContract": provider}, separators=(",", ":"))
q = lambda v: "'" + v.replace("'", "''") + "'"
statements = ["DELETE FROM prayed_days"]
statements += [f"INSERT OR REPLACE INTO meta (key,value) VALUES ({q(k)},{q(v)})" for k, v in meta.items()]
d0 = date.fromisoformat(today)
statements.append("INSERT INTO prayed_days (day) VALUES " + ",".join(f"({q((d0 - timedelta(days=i)).isoformat())})" for i in range(5)))
for sql in statements:
    subprocess.run([sys.executable, f"{repo}/scripts/android-db-probe.py", "--device", "emulator-5554", "--mode", "execute", "--sql", sql],
                   check=True, stdout=subprocess.DEVNULL)
print(f"seeded {len(statements)} statements")
