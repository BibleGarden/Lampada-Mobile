"""Run a contract child process in its own process group and forward termination signals to it."""
import os
import signal
import subprocess

FORWARDED_SIGNALS = (signal.SIGTERM, signal.SIGHUP, signal.SIGINT)


def run_forwarding_signals(argv, **kwargs):
    """Return the child's exit code; after a forwarded signal exit with 128 + signal once the child stops."""
    child = None
    received = []

    def kill_group(signum):
        try:
            os.killpg(child.pid, signum)
        except ProcessLookupError:
            pass

    def forward(signum, _frame):
        received.append(signum)
        if child is not None:
            kill_group(signum)

    # Handlers are installed before launch: a signal between Popen and their
    # installation would leave the child orphaned.
    previous = {signum: signal.signal(signum, forward) for signum in FORWARDED_SIGNALS}
    try:
        child = subprocess.Popen(argv, start_new_session=True, **kwargs)
        if received:
            kill_group(received[0])
        returncode = child.wait()
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)
    if received:
        raise SystemExit(128 + received[0])
    return returncode
