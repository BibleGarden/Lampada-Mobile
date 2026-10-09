#!/usr/bin/env python3
"""Run destructive staged keyboard contracts only on existing named simulators."""
import argparse
import json
import subprocess
from pathlib import Path
from datetime import datetime
from .keyboard_contract_forms import FORMS
from .ios_keyboard_layout_bounds import check


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--simulator', choices=['Pray Smoke iPhone 17 Pro', 'Pray SE', 'Pray iPad2'], default='Pray iPad2')
    parser.add_argument('--mode', choices=['docked', 'floating'], required=True)
    parser.add_argument('--forms', nargs='+', choices=list(FORMS), default=list(FORMS))
    parser.add_argument('--output', default=f'/tmp/lampada-ios-keyboard-contract-{datetime.now():%Y%m%d-%H%M%S}')
    args = parser.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    device = subprocess.check_output(['bash', 'testing/e2e/sim-udid.sh', args.simulator], text=True).strip()
    devices = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', '-j'], text=True))['devices']
    selected = next((d for values in devices.values() for d in values if d['udid'] == device), None)
    if not selected or selected['state'] != 'Booted':
        raise RuntimeError('Boot the existing named simulator and install the PR Release build first')
    def command(name, argv):
        with (output / f'{name}.log').open('w') as log:
            result = subprocess.run(argv, stdout=log, stderr=subprocess.STDOUT)
        (output / f'{name}.exit').write_text(f'{result.returncode}\n')
        if result.returncode:
            raise RuntimeError(f'{name} failed; full log: {output / (name + ".log")}')
    command('environment', ['npm', 'run', 'env:check:local'])
    for form in args.forms:
        for phase in ['open', 'restore']:
            flow = f'ios-keyboard-contract-{form}-{phase}'
            command(flow, ['maestro', '--device', device, 'test', '-e', f'KEYBOARD_MODE={args.mode}',
                           '--test-output-dir', str(output / flow), f'testing/e2e/{flow}.yaml'])
            if phase == 'open':
                command(f'{form}-hierarchy', ['maestro', '--device', device, 'hierarchy'])
                tree = json.loads((output / f'{form}-hierarchy.log').read_text())
                check(tree, form, args.mode, output / f'{form}-native-bounds.json')
                command(f'{form}-screenshot', ['xcrun', 'simctl', 'io', device, 'screenshot', str(output / f'{form}-open.png')])
        print(f'{form}: native UIKit {args.mode} bounds and restoration passed', flush=True)
    print('All selected iOS keyboard contracts passed', flush=True)


if __name__ == '__main__':
    main()
