import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

RUNNER = """
import sys
from scripts.child_process import run_forwarding_signals
code = 'import os, sys, time; open(sys.argv[1], "w").write(str(os.getpid())); time.sleep(60)'
run_forwarding_signals([sys.executable, '-c', code, sys.argv[1]])
"""


class ForwardingSignalsTests(unittest.TestCase):
    def run_and_signal(self, signum):
        with tempfile.TemporaryDirectory() as directory:
            pid_file = Path(directory) / 'child.pid'
            runner = subprocess.Popen([sys.executable, '-c', RUNNER, str(pid_file)], cwd=Path(__file__).parents[2])
            deadline = time.monotonic() + 10
            while not (pid_file.exists() and pid_file.read_text()):
                self.assertLess(time.monotonic(), deadline, 'child did not start')
                time.sleep(0.05)
            child = int(pid_file.read_text())
            runner.send_signal(signum)
            self.assertEqual(runner.wait(timeout=10), 128 + signum)
            with self.assertRaises(ProcessLookupError):
                os.kill(child, 0)

    def test_sigterm_stops_the_child_group_and_exits_with_the_signal_code(self):
        self.run_and_signal(signal.SIGTERM)

    def test_sighup_and_sigint_are_forwarded_too(self):
        self.run_and_signal(signal.SIGHUP)
        self.run_and_signal(signal.SIGINT)

    def test_a_signal_before_the_child_starts_still_stops_it(self):
        from unittest import mock
        import scripts.child_process as module
        real_popen = subprocess.Popen
        started = []

        def popen_after_signal(*args, **kwargs):
            os.kill(os.getpid(), signal.SIGTERM)
            started.append(real_popen(*args, **kwargs))
            return started[0]

        with mock.patch.object(module.subprocess, 'Popen', popen_after_signal):
            began = time.monotonic()
            with self.assertRaises(SystemExit) as stopped:
                module.run_forwarding_signals([sys.executable, '-c', 'import time; time.sleep(60)'])
        self.assertEqual(stopped.exception.code, 128 + signal.SIGTERM)
        self.assertLess(time.monotonic() - began, 10)
        self.assertIsNotNone(started[0].poll())

    def test_exit_code_of_a_normal_child_is_returned(self):
        from scripts.child_process import run_forwarding_signals
        self.assertEqual(run_forwarding_signals([sys.executable, '-c', 'raise SystemExit(3)']), 3)


if __name__ == '__main__':
    unittest.main()
