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
arguments = parser.parse_args()
if not arguments.device.startswith('emulator-'):
    parser.error('Prepared Android tests require an emulator')
output = Path(arguments.output).resolve()
output.mkdir(parents=True, exist_ok=True)
results = []


def control(payload):
    request = urllib.request.Request(arguments.stub + '/__control',
        data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=20) as response:
        json.load(response)


def run(name, command):
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


def flow(name):
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
for index, sql in enumerate([
    'DELETE FROM favorites',
    "INSERT INTO favorites(ref,added_at) VALUES ('Колоссянам 3:23','2026-08-01T09:00:00.000Z'),('Неизвестная старая ссылка','2026-08-02T09:00:00.000Z')",
    "DELETE FROM meta WHERE key='scripture_schema_version'",
]):
    run('seed-legacy-' + str(index), ['python3', 'scripts/android-db-probe.py', '--device',
        arguments.device, '--mode', 'execute', '--sql', sql])
flow('android-scripture-legacy-favorites')
flow('android-stage03-start-sqlite-lock')
control({'contentReports': 'ok'})
flow('android-rpt-001-002')
control({'contentReports': 'fail-once'})
flow('android-rpt-003')
control({'contentReports': 'ok'})
with urllib.request.urlopen(arguments.stub + '/__status', timeout=20) as response:
    status = json.load(response)
(output / 'stub-status.json').write_text(json.dumps(status, ensure_ascii=False, indent=2) + '\n')
print('All 16 Android controlled scenarios and database checks passed.', flush=True)
