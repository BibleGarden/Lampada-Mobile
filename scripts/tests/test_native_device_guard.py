import os
import pathlib
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
GUARD = ROOT / 'scripts' / 'resolve-native-device.sh'


class NativeDeviceGuardTest(unittest.TestCase):
    def run_guard(self, listing, *args):
        with tempfile.TemporaryDirectory() as sdk:
            binary = pathlib.Path(sdk) / 'platform-tools' / 'adb'
            binary.parent.mkdir()
            binary.write_text('#!/bin/sh\n'
                              'if [ "$1" = devices ]; then printf "%s\\n" "$ADB_LISTING"; '
                              'elif [ "$3" = emu ]; then echo Pray_Pixel_API_35; '
                              'else [ "$2" = emulator-5554 ] && [ "$3" = get-state ]; fi\n')
            binary.chmod(0o755)
            return subprocess.run(['bash', str(GUARD), 'android', *args],
                                  text=True, capture_output=True,
                                  env={**os.environ, 'ANDROID_HOME': sdk, 'ADB_LISTING': listing})

    def test_multiple_devices_require_an_explicit_target(self):
        result = self.run_guard('List of devices attached\nemulator-5554\tdevice\nR5CX00PHONE\tdevice')
        self.assertEqual(result.returncode, 2)
        self.assertIn('pass --device', result.stderr)

    def test_explicit_connected_targets_are_accepted(self):
        listing = 'List of devices attached\nemulator-5554\tdevice\nR5CX00PHONE\tdevice'
        self.assertEqual(self.run_guard(listing, '--device', 'emulator-5554').stdout.strip(), 'emulator-5554')
        self.assertEqual(self.run_guard(listing, '--device', 'R5CX00PHONE').stdout.strip(), 'R5CX00PHONE')

    def test_explicit_unknown_target_is_rejected(self):
        listing = 'List of devices attached\nemulator-5554\tdevice'
        result = self.run_guard(listing, '--device', 'R5CX00PHONE')
        self.assertEqual(result.returncode, 2)
        self.assertIn('not a running emulator', result.stderr)

    def test_single_device_is_resolved(self):
        result = self.run_guard('List of devices attached\nemulator-5554\tdevice')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), 'emulator-5554')


if __name__ == '__main__':
    unittest.main()
