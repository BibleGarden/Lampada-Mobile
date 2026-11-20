#!/bin/bash
# Seeds legacy favorites into the app's SQLite for ios-scripture-legacy-favorites.
# The legacy favorites table (ref, added_at) is filled with a known reference
# from the built-in catalog (lib/scriptures.ts) and an unknown one; the
# migration marker scripture_schema_version is removed so that the migration
# runs on the next app launch.
#
# The app must be installed but not running (the script terminates it itself).
set -euo pipefail
UDID="${UDID:-$("$(dirname "$0")/sim-udid.sh" "Pray Smoke iPhone 17 Pro")}"
xcrun simctl terminate "$UDID" twinkler 2>/dev/null || true
CONTAINER=$(xcrun simctl get_app_container "$UDID" twinkler data)
DB="$CONTAINER/Documents/SQLite/lampada.db"
[ -f "$DB" ] || { echo "DB not found: $DB"; exit 1; }

sqlite3 "$DB" <<'SQL'
DELETE FROM favorites;
INSERT INTO favorites (ref, added_at) VALUES
  ('Колоссянам 3:23', '2026-08-01T09:00:00.000Z'),
  ('Неизвестная старая ссылка', '2026-08-02T09:00:00.000Z');
DELETE FROM meta WHERE key = 'scripture_schema_version';
SQL
echo "Seeded: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM favorites') legacy records, migration marker removed"
