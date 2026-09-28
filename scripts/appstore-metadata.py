#!/usr/bin/env python3
"""Keep the editable App Store page in sync with store/metadata/*.json."""
from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "store" / "metadata"
API = "https://api.appstoreconnect.apple.com"
INITIAL_LOCALES = ("en-US", "ru", "uk")
EDITABLE_STATES = frozenset({
    "PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED",
    "METADATA_REJECTED", "INVALID_BINARY",
})
INFO_FIELDS = ("name", "subtitle", "privacyPolicyUrl", "privacyChoicesUrl")
VERSION_FIELDS = (
    "description", "keywords", "promotionalText", "whatsNew", "supportUrl", "marketingUrl",
)
LIMITS = {
    "name": 30,
    "subtitle": 30,
    "promotionalText": 170,
    "description": 4000,
    "keywords": 100,
    "whatsNew": 4000,
}
CONTENT_RIGHTS_DECLARATIONS = frozenset({
    "DOES_NOT_USE_THIRD_PARTY_CONTENT", "USES_THIRD_PARTY_CONTENT",
})


def encoded(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def signature_to_raw(der: bytes) -> bytes:
    """Convert OpenSSL's ASN.1 ECDSA signature to the JWT's fixed-width r||s."""
    def length(index: int) -> tuple[int, int]:
        first = der[index]
        if first < 128:
            return first, index + 1
        count = first & 127
        if count == 0 or count > 2:
            raise ValueError("Invalid DER signature length")
        return int.from_bytes(der[index + 1:index + 1 + count], "big"), index + 1 + count

    if not der or der[0] != 0x30:
        raise ValueError("OpenSSL did not return a DER sequence")
    sequence_length, index = length(1)
    if index + sequence_length != len(der):
        raise ValueError("Invalid DER sequence length")
    parts = []
    for _ in range(2):
        if der[index] != 0x02:
            raise ValueError("Invalid DER integer")
        size, index = length(index + 1)
        integer = int.from_bytes(der[index:index + size], "big")
        if integer >= 1 << 256:
            raise ValueError("ECDSA integer exceeds P-256 width")
        parts.append(integer.to_bytes(32, "big"))
        index += size
    if index != len(der):
        raise ValueError("Trailing DER signature data")
    return b"".join(parts)


def token() -> str:
    key_id = os.environ.get("ASC_KEY_ID")
    issuer = os.environ.get("ASC_ISSUER_ID")
    missing = [name for name, value in (("ASC_KEY_ID", key_id), ("ASC_ISSUER_ID", issuer)) if not value]
    if missing:
        raise ValueError("Missing required environment variable(s): " + ", ".join(missing))
    key_path = os.environ.get("ASC_PRIVATE_KEY_PATH")
    if key_path == "":
        raise ValueError("ASC_PRIVATE_KEY_PATH is set but empty")
    path = Path(key_path if key_path is not None else
                f"~/.appstoreconnect/private_keys/AuthKey_{key_id}.p8").expanduser()
    if not path.is_file():
        raise ValueError(f"ASC private key file is missing: {path}")
    now = int(time.time())
    header = {"alg": "ES256", "kid": key_id, "typ": "JWT"}
    claims = {"iss": issuer, "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"}
    signing_input = ".".join(encoded(json.dumps(part, separators=(",", ":")).encode())
                             for part in (header, claims)).encode("ascii")
    result = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(path)],
                            input=signing_input, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError("OpenSSL could not sign the ASC request; check the private key path")
    return signing_input.decode("ascii") + "." + encoded(signature_to_raw(result.stdout))


class Client:
    def __init__(self, allow_writes: bool = False) -> None:
        self.authorization = "Bearer " + token()
        self.allow_writes = allow_writes

    def request(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        if method not in {"GET", "PATCH"}:
            raise ValueError(f"Unsupported HTTP method: {method}")
        if method != "GET" and not self.allow_writes:
            raise ValueError("ASC writes are disabled for this command")
        if not path.startswith("/v1/") and not path.startswith(API + "/v1/"):
            raise ValueError("ASC request must target the v1 API")
        url = path if path.startswith(API) else API + path
        payload = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        request = urllib.request.Request(
            url, data=payload, method=method,
            headers={"Authorization": self.authorization, "Accept": "application/json",
                     "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                warning = response.headers.get("Warning")
                if warning:
                    print(f"ASC warning: {warning}", file=sys.stderr)
                content = response.read()
                return json.loads(content) if content else {}
        except urllib.error.HTTPError as error:
            try:
                errors = json.loads(error.read()).get("errors", [])
                details = "; ".join(f"{item.get('code')}: {item.get('title')}: {item.get('detail')}"
                                    for item in errors)
            except (ValueError, UnicodeError):
                details = "invalid or empty error response"
            raise RuntimeError(f"ASC {method} {urllib.parse.urlsplit(url).path} returned HTTP "
                               f"{error.code}: {details}") from None

    def list(self, path: str) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        next_path: str | None = path
        while next_path:
            result = self.request("GET", next_path)
            data = result.get("data") if isinstance(result, dict) else None
            if not isinstance(data, list):
                raise ValueError(f"ASC list response {urllib.parse.urlsplit(next_path).path} "
                                 "must contain a data array")
            items.extend(data)
            next_path = result.get("links", {}).get("next")
        return items

    def related(self, resource: str, identity: str, relationship: str) -> str | None:
        data = self.request("GET", f"/v1/{resource}/{identity}/relationships/{relationship}").get("data")
        if data is None:
            return None
        if isinstance(data, list):
            raise ValueError(f"Expected one {relationship} relationship, found a list")
        return data["id"]


def app_id() -> str:
    eas = json.loads((ROOT / "eas.json").read_text())
    identity = eas["submit"]["production"]["ios"]["ascAppId"]
    if not str(identity).isdigit():
        raise ValueError("eas.json submit.production.ios.ascAppId must be numeric")
    return str(identity)


def unique(items: list[dict[str, Any]], label: str) -> dict[str, Any]:
    if len(items) != 1:
        raise ValueError(f"Expected exactly one {label}; ASC returned {len(items)}")
    return items[0]


def validate_content_rights(value: Any) -> str:
    if not isinstance(value, str) or value not in CONTENT_RIGHTS_DECLARATIONS:
        raise ValueError(f"Invalid contentRightsDeclaration: {value!r}; expected an Apple enum value")
    return value


def by_locale(items: list[dict[str, Any]], label: str) -> dict[str, dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for item in items:
        locale = item["attributes"]["locale"]
        if locale in found:
            raise ValueError(f"Duplicate {label} locale: {locale}")
        found[locale] = item
    return found


def current(client: Client) -> dict[str, Any]:
    apple_id = app_id()
    app = client.request("GET", f"/v1/apps/{apple_id}")["data"]
    if app["id"] != apple_id:
        raise ValueError("ASC returned an unexpected app resource ID")
    validate_content_rights(app["attributes"].get("contentRightsDeclaration"))
    infos = client.list(f"/v1/apps/{apple_id}/appInfos?limit=200")
    info = unique(infos, "app info")
    versions = client.list(f"/v1/apps/{apple_id}/appStoreVersions?" +
                           urllib.parse.urlencode({"filter[platform]": "IOS", "limit": 200}))
    editable = [item for item in versions if item.get("attributes", {}).get("appStoreState") in EDITABLE_STATES]
    version = unique(editable, "editable iOS App Store version")
    info_id, version_id = info["id"], version["id"]
    info_locales = by_locale(client.list(f"/v1/appInfos/{info_id}/appInfoLocalizations?limit=200"),
                             "app info")
    version_locales = by_locale(client.list(
        f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations?limit=200"), "version")
    return {
        "app": app, "info": info, "version": version,
        "infoLocales": info_locales, "versionLocales": version_locales,
        "primaryCategory": client.related("appInfos", info_id, "primaryCategory"),
        "secondaryCategory": client.related("appInfos", info_id, "secondaryCategory"),
    }


def source_locales(initial: bool = False) -> list[str]:
    files = sorted(SOURCE.glob("*.json"))
    locales = [path.stem for path in files if path.stem != "app"]
    if not locales:
        if initial:
            return list(INITIAL_LOCALES)
        raise ValueError("No locale JSON files in store/metadata; run pull first")
    if any(not locale or "/" in locale for locale in locales):
        raise ValueError("Invalid locale filename in store/metadata")
    return locales


def selected_attributes(item: dict[str, Any] | None, fields: tuple[str, ...]) -> dict[str, Any]:
    attributes = item.get("attributes", {}) if item else {}
    return {field: attributes.get(field) for field in fields}


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def pull(state: dict[str, Any]) -> None:
    locales = source_locales(initial=True)
    extra = sorted((state["infoLocales"].keys() | state["versionLocales"].keys()) - set(locales))
    print(f"Editable iOS version: {state['version']['attributes'].get('versionString')} "
          f"({state['version']['attributes'].get('appStoreState')})")
    print("Extra ASC locales: " + (", ".join(extra) if extra else "none"))
    for locale in locales:
        write_json(SOURCE / f"{locale}.json", {
            "appInfo": selected_attributes(state["infoLocales"].get(locale), INFO_FIELDS),
            "appStoreVersion": selected_attributes(state["versionLocales"].get(locale), VERSION_FIELDS),
        })
        print(f"Wrote store/metadata/{locale}.json")
    write_json(SOURCE / "app.json", {
        "primaryCategory": state["primaryCategory"],
        "secondaryCategory": state["secondaryCategory"],
        "copyright": state["version"]["attributes"].get("copyright"),
        "contentRightsDeclaration": state["app"]["attributes"]["contentRightsDeclaration"],
    })
    print("Wrote store/metadata/app.json")


def read_sources() -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    locales: dict[str, dict[str, Any]] = {}
    for locale in source_locales():
        value = json.loads((SOURCE / f"{locale}.json").read_text())
        if set(value) != {"appInfo", "appStoreVersion"}:
            raise ValueError(f"{locale}.json must have appInfo and appStoreVersion objects")
        for section, fields in (("appInfo", INFO_FIELDS), ("appStoreVersion", VERSION_FIELDS)):
            if not isinstance(value[section], dict) or set(value[section]) != set(fields):
                raise ValueError(f"{locale}.json {section} must contain exactly: {', '.join(fields)}")
            if any(item is not None and not isinstance(item, str) for item in value[section].values()):
                raise ValueError(f"{locale}.json {section} values must be strings or null")
        locales[locale] = value
    shared = json.loads((SOURCE / "app.json").read_text())
    if set(shared) != {"primaryCategory", "secondaryCategory", "copyright", "contentRightsDeclaration"}:
        raise ValueError("app.json must contain primaryCategory, secondaryCategory, copyright, "
                         "contentRightsDeclaration")
    if any(value is not None and not isinstance(value, str) for value in shared.values()):
        raise ValueError("app.json values must be strings or null")
    if not shared["primaryCategory"]:
        raise ValueError("app.json primaryCategory must be a non-empty iOS category ID")
    if shared["secondaryCategory"] == "":
        raise ValueError("app.json secondaryCategory must be an iOS category ID or null")
    validate_content_rights(shared["contentRightsDeclaration"])
    return locales, shared


def validate(locales: dict[str, dict[str, Any]]) -> None:
    violations = []
    for locale, sections in locales.items():
        for section in sections.values():
            for field, value in section.items():
                if value is None:
                    continue
                if field in LIMITS:
                    maximum = LIMITS[field]
                    if len(value) > maximum:
                        violations.append(f"{locale}.{field}: {len(value)}/{maximum} characters")
                if field == "keywords" and value and any(not part.strip() for part in value.split(",")):
                    violations.append(f"{locale}.keywords: empty comma-separated keyword")
    if violations:
        raise ValueError("Apple metadata limits violated:\n" + "\n".join(violations))


def validate_categories(client: Client, shared: dict[str, Any]) -> None:
    categories = client.list("/v1/appCategories?limit=200")
    ios_ids = set()
    for category in categories:
        if not isinstance(category, dict) or not isinstance(category.get("id"), str):
            raise ValueError("ASC app category is missing an ID")
        attributes = category.get("attributes")
        platforms = attributes.get("platforms") if isinstance(attributes, dict) else None
        if not isinstance(platforms, list):
            raise ValueError("ASC app category is missing a platforms array")
        if "IOS" in platforms:
            ios_ids.add(category["id"])
    for field in ("primaryCategory", "secondaryCategory"):
        identity = shared[field]
        if identity is not None and identity not in ios_ids:
            raise ValueError(f"app.json {field} is not a valid iOS App Store category ID: {identity}")


def preview(value: Any) -> str:
    if value is None:
        return "null"
    if len(value) > 72:
        value = value[:69] + "..."
    return json.dumps(value, ensure_ascii=False)


def size_label(field: str, value: Any) -> str:
    if field not in LIMITS:
        return ""
    count = 0 if value is None else len(value)
    return f" ({count}/{LIMITS[field]} characters)"


def changes(state: dict[str, Any], locales: dict[str, dict[str, Any]],
            shared: dict[str, Any]) -> list[tuple[str, str, Any, Any]]:
    result = []
    extra = sorted((state["infoLocales"].keys() | state["versionLocales"].keys()) - locales.keys())
    print("Extra ASC locales: " + (", ".join(extra) if extra else "none"))
    for locale, source in locales.items():
        for lookup, label in (("infoLocales", "app information"),
                              ("versionLocales", "App Store version")):
            if locale not in state[lookup]:
                raise ValueError(f"{locale} is missing from ASC {label}; add the language in ASC first")
        for section, remote, fields in (
            ("appInfo", state["infoLocales"][locale], INFO_FIELDS),
            ("appStoreVersion", state["versionLocales"][locale], VERSION_FIELDS),
        ):
            actual = selected_attributes(remote, fields)
            for field in fields:
                expected = source[section][field]
                if expected != actual[field]:
                    result.append((locale, f"{section}.{field}", actual[field], expected))
    for field in ("primaryCategory", "secondaryCategory"):
        if shared[field] != state[field]:
            result.append(("app", field, state[field], shared[field]))
    copyright_now = state["version"]["attributes"].get("copyright")
    if shared["copyright"] != copyright_now:
        result.append(("app", "copyright", copyright_now, shared["copyright"]))
    rights_now = state["app"]["attributes"]["contentRightsDeclaration"]
    if shared["contentRightsDeclaration"] != rights_now:
        result.append(("app", "contentRightsDeclaration", rights_now,
                       shared["contentRightsDeclaration"]))
    return result


def show_diff(result: list[tuple[str, str, Any, Any]]) -> None:
    if not result:
        print("No differences.")
        return
    for locale, field_path, old, new in result:
        field = field_path.rsplit(".", 1)[-1]
        print(f"{locale}.{field_path}: ASC {preview(old)}{size_label(field, old)} "
              f"-> file {preview(new)}{size_label(field, new)}")
    print(f"{len(result)} differing field(s).")


def patch(client: Client, resource: str, item: dict[str, Any], attributes: dict[str, Any]) -> None:
    client.request("PATCH", f"/v1/{resource}/{item['id']}", {
        "data": {"type": resource, "id": item["id"], "attributes": attributes},
    })


def sync_localizations(client: Client, state: dict[str, Any],
                       locales: dict[str, dict[str, Any]], section: str,
                       fields: tuple[str, ...], lookup: str, resource: str) -> int:
    writes = 0
    for locale, source in locales.items():
        item = state[lookup][locale]
        actual = selected_attributes(item, fields)
        attributes = {field: value for field, value in source[section].items() if value != actual[field]}
        if not attributes:
            continue
        patch(client, resource, item, attributes)
        print(f"Updated {locale} {section}: {', '.join(field for field in fields if field in attributes)}")
        writes += 1
    return writes


def push(client: Client, state: dict[str, Any], locales: dict[str, dict[str, Any]],
         shared: dict[str, Any]) -> None:
    writes = sync_localizations(client, state, locales, "appInfo", INFO_FIELDS, "infoLocales",
                                "appInfoLocalizations")
    writes += sync_localizations(client, state, locales, "appStoreVersion", VERSION_FIELDS,
                                 "versionLocales", "appStoreVersionLocalizations")
    relationships = {}
    for field in ("primaryCategory", "secondaryCategory"):
        if shared[field] != state[field]:
            relationships[field] = {"data": {"type": "appCategories", "id": shared[field]}
                                    if shared[field] is not None else None}
    if relationships:
        info = state["info"]
        client.request("PATCH", f"/v1/appInfos/{info['id']}", {
            "data": {"type": "appInfos", "id": info["id"], "relationships": relationships},
        })
        print("Updated app categories")
        writes += 1
    if shared["copyright"] != state["version"]["attributes"].get("copyright"):
        patch(client, "appStoreVersions", state["version"], {"copyright": shared["copyright"]})
        print("Updated copyright")
        writes += 1
    if shared["contentRightsDeclaration"] != state["app"]["attributes"]["contentRightsDeclaration"]:
        patch(client, "apps", state["app"], {
            "contentRightsDeclaration": shared["contentRightsDeclaration"],
        })
        print("Updated content rights declaration")
        writes += 1
    print(f"Completed {writes} ASC write request(s).")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("pull", help="Read ASC and replace the metadata source files")
    commands.add_parser("diff", help="Compare source files with ASC without writing")
    push_parser = commands.add_parser("push", help="Write only changed fields to ASC")
    push_parser.add_argument("--yes", action="store_true", help="Explicitly authorize ASC writes")
    args = parser.parse_args()
    if args.command == "push" and not args.yes:
        raise ValueError("push requires --yes; no interactive confirmation is available")
    locales: dict[str, dict[str, Any]] = {}
    shared: dict[str, Any] = {}
    if args.command != "pull":
        locales, shared = read_sources()
    client = Client(allow_writes=args.command == "push" and args.yes)
    state = current(client)
    if args.command == "pull":
        pull(state)
    else:
        result = changes(state, locales, shared)
        show_diff(result)
        if args.command == "push":
            validate(locales)
            validate_categories(client, shared)
            if result:
                push(client, state, locales, shared)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyError, ValueError, RuntimeError, OSError, urllib.error.URLError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
