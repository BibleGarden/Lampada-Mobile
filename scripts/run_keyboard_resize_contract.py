"""Check retained keyboard/editor geometry during an actual Android window resize."""
import argparse
import re
import subprocess
from pathlib import Path
from .child_process import run_forwarding_signals


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', default='emulator-5554')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if not args.device.startswith('emulator-'):
        parser.error('The resize fixture clears app data; physical devices are prohibited')
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    def command(name, argv):
        with (output / f'{name}.log').open('w') as log:
            returncode = run_forwarding_signals(argv, stdout=log, stderr=subprocess.STDOUT)
        (output / f'{name}.exit').write_text(f'{returncode}\n')
        if returncode:
            raise RuntimeError(f'{name} failed; full log: {output / (name + ".log")}')
    size = subprocess.check_output(['adb', '-s', args.device, 'shell', 'wm', 'size'], text=True)
    (output / 'original-display-size.log').write_text(size)
    (output / 'original-display-size.exit').write_text('0\n')
    physical = re.search(r'Physical size: (\d+)x(\d+)', size)
    override = re.search(r'Override size: (\d+)x(\d+)', size)
    current = override or physical
    if not current:
        raise RuntimeError('No native emulator display size')
    width, height = map(int, current.groups())
    changed = f'{round(width * 1.125)}x{height}'
    command('open', ['maestro', '--device', args.device, 'test', '-e', 'KEYBOARD_MODE=docked',
                     '--test-output-dir', str(output / 'open'), 'testing/android-e2e/android-keyboard-contract-answer-open.yaml'])
    try:
        command('resize', ['adb', '-s', args.device, 'shell', 'wm', 'size', changed])
        # Снимок экрана до проверки границ: провал проверки оставляет улику.
        with (output / 'resized.png').open('wb') as screenshot:
            result = subprocess.run(['adb', '-s', args.device, 'exec-out', 'screencap', '-p'], stdout=screenshot)
        if result.returncode:
            raise RuntimeError('Native resize screenshot failed')
        command('bounds', ['python3', '-m', 'scripts.keyboard_layout_bounds', '--device', args.device,
                           '--input-id', 'answer-input', '--mode', 'docked', '--focused',
                           '--actions', 'answer-save-button', 'answer-cancel-button', 'answer-record-button',
                           '--below-input', 'answer-save-button', 'answer-cancel-button', 'answer-record-button',
                           '--output', str(output / 'resized-native-bounds.json')])
    finally:
        original = 'x'.join(override.groups()) if override else 'reset'
        command('restore-window', ['adb', '-s', args.device, 'shell', 'wm', 'size', original])
    command('save-reopen', ['maestro', '--device', args.device, 'test', '-e', 'KEYBOARD_MODE=docked',
                            '--test-output-dir', str(output / 'save-reopen'), 'testing/android-e2e/android-keyboard-contract-answer-restore.yaml'])
    print('Native resize bounds, focus, and saved text passed; original display size restored')


if __name__ == '__main__':
    main()
