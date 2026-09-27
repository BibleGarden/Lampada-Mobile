#!/usr/bin/env python3
"""Serve strict, fixture-backed API responses for App Store video capture."""
from __future__ import annotations

import argparse
import json
import re
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


EXPECTED_KEY = "video-preview-mock"
CANONICAL_ID = re.compile(r"^v\d{1,3}:(\d{2})\.(\d{3})\.(\d{3})-(\d{3})$")


def load_fixture(path: Path):
    data = json.loads(path.read_text())
    if not isinstance(data, dict) or not isinstance(data.get("status"), str) or not data["status"]:
        raise ValueError("Fixture must explicitly identify content approval status")
    locales = data.get("locales")
    if not isinstance(locales, dict) or not locales:
        raise ValueError("Fixture must define at least one locale")
    for locale, item in locales.items():
        for section, keys in (("typed", ("intention", "answer", "takeaway")),
                              ("seed", ("intention", "answer", "takeaway")),
                              ("questions", ("first", "next", "reflect"))):
            values = item.get(section)
            if not isinstance(values, dict) or any(not isinstance(values.get(key), str) or not values[key] for key in keys):
                raise ValueError(f"Incomplete {locale}.{section} fixture")
        if item["typed"]["intention"].strip().casefold() == item["seed"]["intention"].strip().casefold():
            raise ValueError(f"Seed journal topic duplicates the on-camera topic: {locale}")
        if any(not item["questions"][stage].endswith("?") for stage in ("first", "next", "reflect")):
            raise ValueError(f"Questions must end with ?: {locale}")
        catalog = item.get("catalog")
        if not isinstance(catalog, dict) or not isinstance(catalog.get("translation"), int) or not catalog.get("books"):
            raise ValueError(f"Incomplete {locale}.catalog fixture")
        passages = item.get("passages")
        if not isinstance(passages, list) or len(passages) < 2:
            raise ValueError(f"At least two {locale} passages are required for prefetch and the filmed selection")
        for passage in passages:
            if not CANONICAL_ID.fullmatch(passage.get("canonical_id", "")):
                raise ValueError(f"Invalid {locale} canonical ID")
            if any(not isinstance(passage.get(key), int) for key in
                   ("book_number", "chapter_number", "verse_start", "verse_end")):
                raise ValueError(f"Invalid {locale} passage coordinates")
            if not isinstance(passage.get("text"), str) or not passage["text"]:
                raise ValueError(f"Passage text missing: {locale}")
            if "expected_reference" in passage:
                book = next((book for book in catalog["books"] if book["book_number"] == passage["book_number"]), None)
                reference = f"{book['name']} {passage['chapter_number']}:{passage['verse_start']}" if book else None
                if reference != passage["expected_reference"] or passage["verse_start"] != passage["verse_end"]:
                    raise ValueError(f"Incorrect expected Scripture reference: {locale}")
    version = data.get("version_check")
    if not isinstance(version, dict) or version.get("app") != "lampada" or version.get("update_type") != "none":
        raise ValueError("Invalid version_check fixture")
    return data


def selection(locale: str, item: dict, passage: dict):
    catalog = item["catalog"]
    coordinates = {key: passage[key] for key in ("book_number", "chapter_number", "verse_start", "verse_end")}
    canonical_match = CANONICAL_ID.fullmatch(passage["canonical_id"])
    if not canonical_match:
        raise ValueError("Invalid canonical ID")
    canonical_coordinates = dict(zip(("book_number", "chapter_number", "verse_start", "verse_end"),
                                     (int(part) for part in canonical_match.groups())))
    return {
        "language": locale,
        "canonical": {"canonical_id": passage["canonical_id"], **canonical_coordinates},
        "passage": {
            "translation": catalog["translation"],
            "translation_alias": catalog["translation_alias"],
            **coordinates,
            "title": passage["title"],
            "text": passage["text"],
        },
        "source": "rerank",
        "fallback_reason": None,
        "history_reset": False,
    }


def serve(fixture: dict, pacing: dict, port: int, log_path: Path):
    lock = threading.Lock()
    log_path.parent.mkdir(parents=True, exist_ok=True)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _format, *_args):
            return

        def respond(self, status: int, body: dict | list, kind: str, details: dict | None = None):
            if kind in pacing["mock_delay_seconds"]:
                time.sleep(pacing["mock_delay_seconds"][kind])
            payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            entry = {"at": datetime.now(timezone.utc).isoformat(), "method": self.command,
                     "path": self.path, "status": status, "kind": kind, **(details or {})}
            with lock, log_path.open("a") as out:
                out.write(json.dumps(entry, ensure_ascii=False) + "\n")

        def error(self, status: int, detail: str, details: dict | None = None):
            self.respond(status, {"detail": detail}, "unexpected", details)

        def body_json(self):
            raw_length = self.headers.get("Content-Length")
            if raw_length is None or not raw_length.isdecimal() or int(raw_length) > 65536:
                raise ValueError("Invalid Content-Length")
            body = json.loads(self.rfile.read(int(raw_length)))
            if not isinstance(body, dict):
                raise ValueError("Expected JSON object")
            return body

        def authorized(self):
            if self.headers.get("x-api-key") != EXPECTED_KEY:
                self.error(401, "Unexpected or missing mock API key")
                return False
            return True

        def do_GET(self):
            url = urlsplit(self.path)
            if url.path == "/__health" and not url.query:
                self.respond(200, {"status": "ready"}, "health")
                return
            if not self.authorized():
                return
            if url.path == "/api/version-check":
                query = parse_qs(url.query)
                if query.get("app") != ["lampada"] or len(query.get("app_version", [])) != 1 or set(query) != {"app", "app_version"}:
                    self.error(422, "Unexpected version-check query")
                    return
                self.respond(200, fixture["version_check"], "version")
                return
            if url.path == "/api/languages" and not url.query:
                body = [{"alias": locale, "name_en": item["language_name_en"],
                         "name_national": item["language_name_national"]}
                        for locale, item in fixture["locales"].items()]
                self.respond(200, body, "catalog")
                return
            if url.path == "/api/translations":
                query = parse_qs(url.query)
                if set(query) != {"language", "only_active"} or query.get("only_active") != ["1"]:
                    self.error(422, "Unexpected translations query")
                    return
                locale = query.get("language", [None])[0]
                if locale not in fixture["locales"]:
                    self.error(422, "Unexpected translations language")
                    return
                catalog = fixture["locales"][locale]["catalog"]
                body = [{"code": catalog["translation"], "alias": catalog["translation_alias"],
                         "name": catalog["translation_name"], "description": None, "language": locale,
                         "active": True, "voices": [{"code": catalog["voice"], "alias": catalog["voice_alias"],
                                                     "name": catalog["voice_name"], "description": None,
                                                     "is_music": False, "active": True}]}]
                self.respond(200, body, "catalog", {"locale": locale})
                return
            books_match = re.fullmatch(r"/api/translations/(\d+)/books", url.path)
            if books_match and not url.query:
                code = int(books_match.group(1))
                matches = [(locale, item["catalog"]) for locale, item in fixture["locales"].items()
                           if item["catalog"]["translation"] == code]
                if len(matches) != 1:
                    self.error(422, "Unexpected books translation")
                    return
                locale, catalog = matches[0]
                self.respond(200, catalog["books"], "catalog", {"locale": locale})
                return
            self.error(404, "Unexpected mock GET route")

        def do_POST(self):
            url = urlsplit(self.path)
            if not self.authorized():
                return
            if url.query or url.path not in {"/api/ai/question", "/api/ai/scripture"}:
                self.error(404, "Unexpected mock POST route")
                return
            try:
                body = self.body_json()
            except (ValueError, json.JSONDecodeError) as exc:
                self.error(422, f"Invalid JSON request: {exc}")
                return
            if url.path == "/api/ai/question":
                locale = body.get("default_language")
                stage = body.get("stage")
                if locale not in fixture["locales"] or stage not in {"first", "next", "reflect"}:
                    self.error(422, "Unexpected question language or stage", {"stage": stage, "locale": locale})
                    return
                item = fixture["locales"][locale]
                known_topics = {item["typed"]["intention"], item["seed"]["intention"]}
                if body.get("topic") not in known_topics or not isinstance(body.get("messages"), list):
                    self.error(422, "Unexpected question topic or messages", {"stage": stage, "locale": locale})
                    return
                self.respond(200, {"text": item["questions"][stage], "novel": True}, "question",
                             {"stage": stage, "locale": locale, "prefetch": body.get("prefetch") is True})
                return
            locale = body.get("language")
            if locale not in fixture["locales"]:
                self.error(422, "Unexpected Scripture language", {"locale": locale})
                return
            item = fixture["locales"][locale]
            catalog = item["catalog"]
            known_topics = {item["typed"]["intention"], item["seed"]["intention"]}
            if body.get("translation") != catalog["translation"] or ("topic" in body and body["topic"] not in known_topics):
                self.error(422, "Unexpected Scripture translation or topic", {"locale": locale})
                return
            excluded = body.get("exclude_canonical_ids", [])
            if not isinstance(excluded, list) or any(not isinstance(value, str) for value in excluded):
                self.error(422, "Invalid Scripture exclusions", {"locale": locale})
                return
            available = [passage for passage in item["passages"] if passage["canonical_id"] not in excluded]
            if not available:
                self.error(409, "No fixture passage remains after exclusions", {"locale": locale})
                return
            self.respond(200, selection(locale, item, available[0]), "scripture",
                         {"locale": locale, "canonical_id": available[0]["canonical_id"],
                          "prefetch": body.get("prefetch") is True})

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    print(f"App Store video mock ready on 127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--pacing", type=Path, required=True)
    parser.add_argument("--port", type=int, default=9086)
    parser.add_argument("--log", type=Path)
    parser.add_argument("--validate", action="store_true")
    args = parser.parse_args()
    fixture = load_fixture(args.fixture)
    pacing = json.loads(args.pacing.read_text())
    delays = pacing.get("mock_delay_seconds")
    if not isinstance(delays, dict) or set(delays) != {"question", "scripture", "catalog", "version"} or any(
        not isinstance(value, (int, float)) or value < 0 for value in delays.values()
    ):
        raise ValueError("Invalid mock delay pacing")
    if args.validate:
        print("Fixture valid")
        return
    if args.log is None:
        parser.error("--log is required when serving")
    serve(fixture, pacing, args.port, args.log)


if __name__ == "__main__":
    main()
