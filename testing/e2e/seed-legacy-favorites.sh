#!/bin/bash
# Сеет legacy-избранное в SQLite приложения для ios-scripture-legacy-favorites.
# Legacy-таблица favorites (ref, added_at) заполняется известной ссылкой из
# встроенного каталога (lib/scriptures.ts) и неизвестной; маркер миграции
# scripture_schema_version снимается, чтобы миграция отработала при следующем
# запуске приложения.
#
# Приложение должно быть установлено, но не запущено (скрипт сам его гасит).
set -euo pipefail
UDID=05F697B7-36CD-4050-9D57-FC9316AA093C
xcrun simctl terminate "$UDID" twinkler 2>/dev/null || true
CONTAINER=$(xcrun simctl get_app_container "$UDID" twinkler data)
DB="$CONTAINER/Documents/SQLite/lampada.db"
[ -f "$DB" ] || { echo "БД не найдена: $DB"; exit 1; }

sqlite3 "$DB" <<'SQL'
DELETE FROM favorites;
INSERT INTO favorites (ref, added_at) VALUES
  ('Колоссянам 3:23', '2026-08-01T09:00:00.000Z'),
  ('Неизвестная старая ссылка', '2026-08-02T09:00:00.000Z');
DELETE FROM meta WHERE key = 'scripture_schema_version';
SQL
echo "Сеято: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM favorites') legacy-записей, маркер миграции снят"
