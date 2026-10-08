#!/usr/bin/env python3
"""Inspect or seed the test Release database through signed instrumentation."""
import argparse
import json
import shlex
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--device', required=True)
parser.add_argument('--mode', choices=['query', 'execute'], required=True)
parser.add_argument('--sql', required=True)
arguments = parser.parse_args()
if not arguments.device.startswith('emulator-'):
    parser.error('The database probe requires an emulator device identifier')

command = ' '.join(shlex.quote(value) for value in [
    'am', 'instrument', '-w', '-e', 'mode', arguments.mode, '-e', 'sql', arguments.sql,
    'garden.lampada.testprobe/garden.lampada.testprobe.DatabaseProbe',
])
result = subprocess.run(['adb', '-s', arguments.device, 'shell', command],
                        capture_output=True, text=True)
if result.returncode:
    sys.stderr.write(result.stdout + result.stderr)
    sys.exit(result.returncode)
lines = result.stdout.splitlines()
reports = [line.removeprefix('INSTRUMENTATION_RESULT: report=') for line in lines
           if line.startswith('INSTRUMENTATION_RESULT: report=')]
if len(reports) != 1 or 'INSTRUMENTATION_CODE: -1' not in lines:
    sys.stderr.write(result.stdout + result.stderr)
    sys.exit('Database instrumentation did not confirm success')
report = json.loads(reports[0])
if report.get('ok') is not True:
    sys.exit('Database instrumentation returned an invalid result')
print(json.dumps(report, ensure_ascii=False, indent=2))
