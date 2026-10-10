#!/usr/bin/env python3
"""Run the SCR-013 and SCR-027 Bible catalog phases on a named iOS test simulator.

Install a Release build with EXPO_PUBLIC_API_URL=http://127.0.0.1:9085, start
scripts/scripture-stub.mjs, and boot the named simulator with Russian as its
primary language first.
"""
import argparse
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
STUB = 'http://127.0.0.1:9085'

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--simulator', choices=['Pray Smoke iPhone 17 Pro', 'Pray SE', 'Pray iPad2'],
                    default='Pray Smoke iPhone 17 Pro')
parser.add_argument('--output', required=True)
arguments = parser.parse_args()
output = Path(arguments.output).resolve()
output.mkdir(parents=True, exist_ok=True)
device = subprocess.check_output(['bash', str(ROOT / 'testing/e2e/sim-udid.sh'), arguments.simulator],
                                 text=True).strip()


def fail(message):
    sys.exit('SCR-013: ' + message)


def primary_language():
    languages = subprocess.check_output(
        ['xcrun', 'simctl', 'spawn', device, 'defaults', 'read', '-g', 'AppleLanguages'], text=True)
    found = re.findall(r'"?([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)"?\s*[,)]', languages)
    if not found:
        fail('cannot read the simulator language list: ' + languages.strip())
    return found[0]


def control(mode):
    request = urllib.request.Request(STUB + '/__control', data=json.dumps({'catalog': mode}).encode(),
                                     headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(request, timeout=5) as response:
        if json.load(response).get('catalogMode') != mode:
            fail('the stub did not switch the catalog to ' + mode)


def read_meta(name):
    container = Path(subprocess.check_output(
        ['xcrun', 'simctl', 'get_app_container', device, 'twinkler', 'data'], text=True).strip())
    databases = list(container.glob('**/lampada.db'))
    if len(databases) != 1:
        fail('expected one lampada.db in the app container, found ' + str(len(databases)))
    with sqlite3.connect(databases[0].as_uri() + '?mode=ro', uri=True) as database:
        values = dict(database.execute(
            "SELECT key, value FROM meta WHERE key IN ('ui_language', 'scripture_preferences')"))
    (output / (name + '-meta.json')).write_text(json.dumps(values, indent=2, ensure_ascii=False) + '\n')
    return values


def expect_english_bible(values, ui_language, phase):
    if 'scripture_preferences' not in values:
        fail(phase + ': no Bible selection was saved')
    selection = json.loads(values['scripture_preferences'])
    if (selection['language'], selection['translationCode'], selection['voiceCode']) != ('en', 16, 151):
        fail(phase + ': expected en/16/151, got ' + repr(selection))
    if ui_language is not None and values.get('ui_language') != ui_language:
        fail(phase + ': expected ui_language=' + ui_language + ', got ' + repr(values.get('ui_language')))


# Фазы опираются на русский как основной язык системы: ошибка до переключения
# интерфейса проверяется по-русски, а восстановление — что выбор идёт за
# английским интерфейсом, а не за системной локалью.
language = primary_language()
if not language.startswith('ru'):
    fail('the simulator primary language must be Russian, got ' + language)

# failure → recovery → saved-offline — одна цепочка над общим состоянием
# приложения; no-default начинается с чистой установки.
phases = [('failure', 'fail'), ('recovery', 'ok'), ('saved-offline', 'fail'), ('no-default', 'unvoiced-ru')]
for phase, mode in phases:
    control(mode)
    name = 'ios-scripture-catalog-' + phase
    command = ['maestro', '--device', device, 'test', '--test-output-dir', str(output / name),
               str(ROOT / 'testing/e2e' / (name + '.yaml'))]
    with (output / (name + '.log')).open('w') as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
    (output / (name + '.exit')).write_text(str(result.returncode) + '\n')
    print(name + ' exit=' + str(result.returncode), flush=True)
    if result.returncode:
        sys.exit(result.returncode)
    values = read_meta(name)
    if phase == 'failure':
        if 'scripture_preferences' in values:
            fail('the catalog failure saved a Bible selection')
        if values.get('ui_language') != 'en':
            fail('expected ui_language=en after the failure phase, got ' + repr(values.get('ui_language')))
    else:
        expect_english_bible(values, {'recovery': 'en', 'saved-offline': 'ru', 'no-default': None}[phase], phase)
    subprocess.run(['xcrun', 'simctl', 'io', device, 'screenshot', str(output / (name + '.png'))],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(phase + ' SQLite checkpoint passed', flush=True)
control('ok')
print('All SCR-013/SCR-027 catalog phases and SQLite checkpoints passed', flush=True)
