#!/usr/bin/env python3
"""Run controlled Android Release scenarios against the local test stub."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--device', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--stub', default='http://localhost:9085')
parser.add_argument('--start-at', help='Resume from a diagnosed and corrected scenario')
arguments = parser.parse_args()
if not arguments.device.startswith('emulator-'):
    parser.error('Prepared Android tests require an emulator')
# Фазы SCR-013 опираются на сохранённое состояние предыдущей фазы, а recovery —
# ещё и на молитву, открытую в reopen: цепочку можно начать только с её первой фазы.
if arguments.start_at in ('android-scripture-catalog-reopen', 'android-scripture-catalog-recovery',
                          'android-scripture-catalog-saved-offline'):
    parser.error('SCR-013 phases form one chain; use --start-at android-scripture-catalog-failure')
output = Path(arguments.output).resolve()
output.mkdir(parents=True, exist_ok=True)
results = []
started = arguments.start_at is None


def control(payload):
    request = urllib.request.Request(arguments.stub + '/__control',
        data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=20) as response:
        json.load(response)


def run(name, command):
    # Шаги до точки старта пропускаются целиком, включая правки базы и проверки.
    if not started:
        return
    environment = dict(os.environ, ANDROID_TEST_DEVICE=arguments.device,
                       ANDROID_TEST_OUTPUT_DIR=str(output / name))
    with (output / (name + '.log')).open('w') as log:
        result = subprocess.run(command, env=environment, stdout=log, stderr=subprocess.STDOUT)
    (output / (name + '.exit')).write_text(str(result.returncode) + '\n')
    results.append({'name': name, 'command': command, 'exit': result.returncode})
    (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(name + ' exit=' + str(result.returncode), flush=True)
    if result.returncode:
        sys.exit(result.returncode)


def flow(name, prepare=()):
    """Run a flow after its own preparation steps; both are skipped before --start-at."""
    global started
    if not started:
        if name != arguments.start_at:
            return
        started = True
    for step, command in prepare:
        run(step, command)
    run(name, ['npm', 'run', 'test:e2e:android', '--', name])


for kind in ['soft', 'hard']:
    control({'version': {'update_type': kind, 'latest_version': '9.9.9',
        'store_url': 'https://example.com/lampada', 'message': {
            'ru': 'Доступно обновление. Обнови, пожалуйста.' if kind == 'soft'
                  else 'Обнови Лампаду, чтобы продолжить.',
            'en': 'Update available.', 'uk': 'Доступне оновлення.'}}})
    flow('android-update-' + kind)
control({'version': {'update_type': 'none', 'latest_version': '1.0.23', 'message': None}})
control({'transcription': 'ok'})
flow('android-jrn-010-011-transcribe')
control({'transcription': 'fail'})
flow('android-jrn-012a-transcription-error')
control({'transcription': 'ok'})
flow('android-jrn-012b-transcription-retry')
control({'transcription': 'delay'})
for name in ['android-jrn-013a-close-during', 'android-jrn-013b-delete-during',
             'android-stage04-ans-013-save-in-flight']:
    flow(name)
control({'transcription': 'ok'})
run('orphaned-recordings', ['python3', 'scripts/android-db-probe.py', '--device', arguments.device,
    '--mode', 'query', '--sql',
    'SELECT COUNT(*) AS orphans FROM recordings r WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id=r.session_id)'])
if started:
    report = json.loads((output / 'orphaned-recordings.log').read_text())
    if report['rows'] != [{'orphans': 0}]:
        sys.exit('Orphaned recordings remain after transcription cleanup')
control({'questionDelayMs': 15000})
flow('android-stage05-ai-late-stub')
control({'questionDelayMs': 0})
for name in ['android-stage06-scr-001-navigation', 'android-stage06-scr-002a-favorite-relaunch',
             'android-stage06-scr-002b-favorite-relaunch']:
    control({'resetScripture': True})
    flow(name)
flow('android-scripture-legacy-favorites', prepare=[
    ('seed-legacy-' + str(index), ['python3', 'scripts/android-db-probe.py', '--device',
        arguments.device, '--mode', 'execute', '--sql', sql])
    for index, sql in enumerate([
        'DELETE FROM favorites',
        "INSERT INTO favorites(ref,added_at) VALUES ('Колоссянам 3:23','2026-08-01T09:00:00.000Z'),('Неизвестная старая ссылка','2026-08-02T09:00:00.000Z')",
        "DELETE FROM meta WHERE key='scripture_schema_version'",
    ])])
flow('android-stage03-start-sqlite-lock')
control({'contentReports': 'ok'})
flow('android-rpt-001-002')
control({'contentReports': 'fail-once'})
flow('android-rpt-003')
control({'contentReports': 'ok'})


def scripture_meta(name):
    run(name, ['python3', 'scripts/android-db-probe.py', '--device', arguments.device, '--mode', 'query',
        '--sql', "SELECT key, value FROM meta WHERE key IN ('ui_language', 'scripture_preferences')"])
    return {row['key']: row['value'] for row in json.loads((output / (name + '.log')).read_text())['rows']}


def expect_english_bible(values, ui_language, phase):
    selection = json.loads(values.get('scripture_preferences', 'null') or 'null')
    if not selection or (selection['language'], selection['translationCode'], selection['voiceCode']) != ('en', 16, 151):
        sys.exit(phase + ': expected the confirmed English Bible en/16/151, got ' + repr(selection))
    if ui_language is not None and values.get('ui_language') != ui_language:
        sys.exit(phase + ': expected ui_language=' + ui_language + ', got ' + repr(values.get('ui_language')))


# SCR-013. Проба базы — это `am instrument` по пакету приложения, и Android
# останавливает приложение перед её запуском. Поэтому проба завершает фазу, а
# следующая фаза перезапускает приложение с проверенного пробой сохранённого
# состояния. Recovery повторяет запрос в молитве, открытой в reopen, — между
# ними пробы нет.
control({'catalog': 'fail'})
flow('android-scripture-catalog-failure')
if started:
    values = scripture_meta('scripture-catalog-failure-meta')
    if 'scripture_preferences' in values or values.get('ui_language') != 'en':
        sys.exit('Catalog failure must save no Bible selection and keep ui_language=en, got ' + repr(values))
flow('android-scripture-catalog-reopen')
control({'catalog': 'ok'})
flow('android-scripture-catalog-recovery')
if started:
    expect_english_bible(scripture_meta('scripture-catalog-recovery-meta'), 'en', 'Catalog recovery')
control({'catalog': 'fail'})
flow('android-scripture-catalog-saved-offline')
if started:
    expect_english_bible(scripture_meta('scripture-catalog-saved-offline-meta'), 'ru', 'Saved selection offline')
# SCR-027: каталог без озвученного русского перевода, выбор вручную из сессии.
control({'catalog': 'unvoiced-ru'})
flow('android-scripture-catalog-no-default')
if started:
    expect_english_bible(scripture_meta('scripture-catalog-no-default-meta'), None, 'Manual Bible choice')
control({'catalog': 'ok'})
with urllib.request.urlopen(arguments.stub + '/__status', timeout=20) as response:
    status = json.load(response)
(output / 'stub-status.json').write_text(json.dumps(status, ensure_ascii=False, indent=2) + '\n')
if not started:
    sys.exit('Requested starting scenario does not exist')
print('All selected Android controlled scenarios and database checks passed.', flush=True)
