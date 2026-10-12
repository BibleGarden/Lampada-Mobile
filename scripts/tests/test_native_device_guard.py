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
                              'else [ "$2" = emulator-5554 ] && [ "$3" = get-state ]; fi\n')
            binary.chmod(0o755)
            return subprocess.run(['bash', str(GUARD), 'android', *args],
                                  text=True, capture_output=True,
                                  env={**os.environ, 'ANDROID_HOME': sdk, 'ADB_LISTING': listing})

    def test_multiple_devices_require_an_explicit_target(self):
        result = self.run_guard('List of devices attached\nemulator-5554\tdevice\nRFCW90KWKBH\tdevice')
        self.assertEqual(result.returncode, 2)
        self.assertIn('pass --device', result.stderr)

    def test_explicit_emulator_is_accepted_and_owner_phone_is_rejected(self):
        listing = 'List of devices attached\nemulator-5554\tdevice\nRFCW90KWKBH\tdevice'
        self.assertEqual(self.run_guard(listing, '--device', 'emulator-5554').stdout.strip(), 'emulator-5554')
        self.assertEqual(self.run_guard(listing, '--device', 'RFCW90KWKBH').returncode, 2)

    def test_single_device_is_resolved(self):
        result = self.run_guard('List of devices attached\nemulator-5554\tdevice')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), 'emulator-5554')


if __name__ == '__main__':
    unittest.main()
