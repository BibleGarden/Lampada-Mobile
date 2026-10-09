#!/usr/bin/env python3
"""Run staged native keyboard contracts. Run only on a disposable named emulator."""
import argparse
import json
import re
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime
from keyboard_layout_bounds import has_hardware_keyboard

from keyboard_contract_forms import FORMS


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', default='emulator-5554')
    parser.add_argument('--mode', choices=['docked', 'floating', 'hardware'], required=True)
    parser.add_argument('--forms', nargs='+', choices=list(FORMS), default=list(FORMS))
    parser.add_argument('--output', default=f'/tmp/lampada-keyboard-contract-{datetime.now():%Y%m%d-%H%M%S}')
    args = parser.parse_args()
    if not args.device.startswith('emulator-'):
        parser.error('The matrix clears test app state; physical devices are prohibited. Use the read-only bounds checker there.')
    output = Path(args.output);output.mkdir(parents=True, exist_ok=True)
    def command(name, argv):
        with (output / f'{name}.log').open('w') as log:
            result = subprocess.run(argv, stdout=log, stderr=subprocess.STDOUT)
        (output / f'{name}.exit').write_text(f'{result.returncode}\n')
        if result.returncode:
            raise RuntimeError(f'{name} failed; full log: {output / (name + ".log")}')
    def adb(*argv):
        return subprocess.check_output(['adb', '-s', args.device, *argv], text=True, timeout=30).strip()
    command('environment', ['npm', 'run', 'env:check:local'])
    if adb('shell', 'getprop', 'sys.boot_completed') != '1':
        raise RuntimeError('Emulator has not booted')
    original_hardware_ime = adb('shell', 'settings', 'get', 'secure', 'show_ime_with_hard_keyboard')
    try:
        if args.mode == 'hardware':
            native_window = adb('shell', 'dumpsys', 'window')
            if not has_hardware_keyboard(native_window):
                raise RuntimeError('Hardware mode requires an enabled emulated hardware keyboard (AVD hw.keyboard=yes); no software IMEs are disabled')
            command('hide-software-with-hardware', ['adb', '-s', args.device, 'shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '0'])
        for form in args.forms:
            input_id, lower_actions, deferred = FORMS[form]
            mode = args.mode
            opening = f'android-keyboard-contract-{form}-open'
            command(opening, ['maestro', '--device', args.device, 'test', '-e', f'KEYBOARD_MODE={mode}',
                              '--test-output-dir', str(output / opening), f'testing/android-e2e/{opening}.yaml'])
            if mode == 'hardware':
                native_window = adb('shell', 'dumpsys', 'window')
                # Gboard может оставить пустое окно IME с нижней панелью.
                # Native Back закрывает его, сохраняя фокус редактора.
                if re.search(r'type=ime[^\n]*visible=true', native_window):
                    command(f'{form}-hide-ime-layer', ['adb', '-s', args.device, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'])
                command(f'{form}-hardware-input', ['adb', '-s', args.device, 'shell', 'input', 'text', 'Matrix_hardware'])
            if not adb('shell', 'pidof', 'com.nf404.twinkler'):
                raise RuntimeError('Lampada process stopped; inspect its crash before continuing')
            actions = list(lower_actions)
            absent = deferred if mode != 'hardware' else [f'{form}-keyboard-dismiss']
            if mode == 'hardware':
                actions.extend(deferred)
            else:
                actions.append(f'{form}-keyboard-dismiss')
            argv = ['python3', 'scripts/keyboard_layout_bounds.py', '--device', args.device, '--input-id', input_id,
                    '--mode', mode, '--output', str(output / f'{form}-native-bounds.json')]
            if actions: argv += ['--actions', *actions]
            if absent: argv += ['--absent', *absent]
            if lower_actions: argv += ['--below-input', *lower_actions]
            command(f'{form}-bounds', argv)
            # Скриншоты остаются в каталоге прогона, вне репозитория.
            with (output / f'{form}-open.png').open('wb') as screenshot:
                result = subprocess.run(['adb', '-s', args.device, 'exec-out', 'screencap', '-p'], stdout=screenshot, stderr=subprocess.DEVNULL)
            if result.returncode: raise RuntimeError('Native screenshot failed')
            restoring = f'android-keyboard-contract-{form}-restore'
            command(restoring, ['maestro', '--device', args.device, 'test', '-e', f'KEYBOARD_MODE={mode}',
                                '--test-output-dir', str(output / restoring), f'testing/android-e2e/{restoring}.yaml'])
            if mode == 'hardware' and form in ('setup', 'answer', 'journal'):
                argv = ['python3', 'scripts/keyboard_layout_bounds.py', '--device', args.device, '--input-id', input_id,
                        '--mode', 'hidden', '--unfocused', '--absent', f'{form}-keyboard-dismiss',
                        '--output', str(output / f'{form}-finished-native-bounds.json')]
                if lower_actions or deferred:
                    argv += ['--actions', *lower_actions, *deferred]
                command(f'{form}-finished-bounds', argv)
            print(f'{form}: native {mode} bounds and restoration passed', flush=True)
    finally:
        if args.mode == 'hardware':
            restore = ['delete', 'secure', 'show_ime_with_hard_keyboard'] if original_hardware_ime == 'null' else ['put', 'secure', 'show_ime_with_hard_keyboard', original_hardware_ime]
            command('restore-hardware-ime-policy', ['adb', '-s', args.device, 'shell', 'settings', *restore])
    print('All selected keyboard contracts passed', flush=True)


if __name__ == '__main__':
    main()
