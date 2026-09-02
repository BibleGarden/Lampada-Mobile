import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRecordingOperation,
  recoverRecordingAfterTerminalError,
  recorderStatusRequiresRecovery,
  startPreparedRecording,
} from '../recordingOperation.ts';
import { createAudioModeCoordinator } from '../audioModeCoordinator.ts';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

test('a second start is dropped while the first start is pending', () => {
  const phases = [];
  const operation = createRecordingOperation((phase) => phases.push(phase));
  const first = operation.beginStart();

  assert.ok(first);
  assert.equal(operation.beginStart(), null);
  assert.equal(first.commit(), true);
  assert.equal(operation.getPhase(), 'recording');
  assert.deepEqual(phases, ['starting', 'recording']);
});

test('cancelling a pending start prevents it from publishing a recording', () => {
  const operation = createRecordingOperation();
  const first = operation.beginStart();
  assert.ok(first);

  operation.cancelStart();

  assert.equal(first.isCurrent(), false);
  assert.equal(first.commit(), false);
  assert.equal(operation.beginStart(), null);
  first.finish();
  assert.equal(operation.getPhase(), 'idle');
  assert.ok(operation.beginStart());
});

test('failed native cleanup keeps cancelled start visible as a recording', () => {
  const operation = createRecordingOperation();
  const start = operation.beginStart();
  assert.ok(start);
  operation.cancelStart();

  assert.equal(start.recoverAsRecording(), true);
  assert.equal(operation.getPhase(), 'recording');
  assert.equal(start.finish(), undefined);
  assert.equal(operation.getPhase(), 'recording');
});

test('concurrent stop callers share one native stop and one result', async () => {
  const operation = createRecordingOperation();
  const start = operation.beginStart();
  assert.ok(start);
  assert.equal(start.commit(), true);

  const nativeStop = deferred();
  let calls = 0;
  const stop = () => operation.runStop(async () => {
    calls += 1;
    return await nativeStop.promise;
  });

  const dismissed = stop();
  const donePressed = stop();

  assert.equal(dismissed, donePressed);
  assert.equal(operation.getPendingStop(), dismissed);
  assert.equal(calls, 1);
  assert.equal(operation.getPhase(), 'stopping');
  nativeStop.resolve({ uri: 'file:///recording.m4a' });
  assert.deepEqual(await dismissed, { uri: 'file:///recording.m4a' });
  assert.deepEqual(await donePressed, { uri: 'file:///recording.m4a' });
  assert.equal(operation.getPhase(), 'idle');
  assert.equal(operation.getPendingStop(), null);
});

test('a failed stop keeps the recording visible and allows a stop retry', async () => {
  const operation = createRecordingOperation();
  const firstStart = operation.beginStart();
  assert.ok(firstStart);
  assert.equal(firstStart.commit(), true);

  await assert.rejects(operation.runStop(async () => {
    throw new Error('native stop failed');
  }), /native stop failed/);
  assert.equal(operation.getPhase(), 'recording');
  assert.equal(operation.beginStart(), null);

  assert.equal(await operation.runStop(async () => 'stopped'), 'stopped');
  assert.equal(operation.getPhase(), 'idle');
  assert.ok(operation.beginStart());
});

test('a processing error after confirmed native stop leaves the operation idle', async () => {
  const operation = createRecordingOperation();
  const start = operation.beginStart();
  assert.ok(start);
  assert.equal(start.commit(), true);

  await assert.rejects(
    operation.runStop(async (confirmNativeStop) => {
      confirmNativeStop();
      throw new Error('recording file metadata failed');
    }),
    /metadata failed/,
  );

  assert.equal(operation.getPhase(), 'idle');
  assert.equal(operation.getPendingStop(), null);
  assert.ok(operation.beginStart());
});

test('media-services reset makes recording idle and releases its audio-mode lease', async () => {
  const operation = createRecordingOperation();
  const start = operation.beginStart();
  assert.ok(start);
  assert.equal(start.commit(), true);

  const coordinator = createAudioModeCoordinator();
  const lease = coordinator.acquireRecording(async () => undefined, {
    allowsRecording: true,
    playsInSilentMode: true,
  });
  await lease.ready;

  assert.equal(recoverRecordingAfterTerminalError(operation, lease), true);
  assert.equal(operation.getPhase(), 'idle');
  assert.equal(lease.isActive(), false);
  assert.equal(coordinator.hasRecordingLease(), false);
  assert.ok(operation.beginStart());
});

test('a failed native start is attempted once without in-place re-prepare', () => {
  let recordCalls = 0;
  const recorder = {
    isRecording: false,
    record() {
      recordCalls += 1;
    },
  };

  assert.throws(() => startPreparedRecording(recorder), /did not enter recording state/);
  assert.equal(recordCalls, 1);
});

test('a terminal recorder error releases the lease and allows a fresh start', async () => {
  const operation = createRecordingOperation();
  const start = operation.beginStart();
  assert.ok(start);
  assert.equal(start.commit(), true);
  const coordinator = createAudioModeCoordinator();
  const lease = coordinator.acquireRecording(async () => undefined, {
    allowsRecording: true,
    playsInSilentMode: true,
  });
  await lease.ready;

  recoverRecordingAfterTerminalError(operation, lease);

  assert.equal(operation.getPhase(), 'idle');
  assert.equal(coordinator.hasRecordingLease(), false);
  assert.ok(operation.beginStart());
});

test('unexpected native finish is terminal only before an expected stop', () => {
  const finished = { isFinished: true, hasError: false };
  assert.equal(recorderStatusRequiresRecovery('starting', finished), false);
  assert.equal(recorderStatusRequiresRecovery('recording', finished), true);
  assert.equal(recorderStatusRequiresRecovery('stopping', finished), false);
  assert.equal(recorderStatusRequiresRecovery('idle', finished), false);
});

test('native recorder error or reset is terminal for every active phase', () => {
  for (const phase of ['starting', 'recording', 'stopping']) {
    assert.equal(
      recorderStatusRequiresRecovery(phase, { isFinished: true, hasError: true }),
      true,
    );
    assert.equal(
      recorderStatusRequiresRecovery(phase, {
        isFinished: true,
        hasError: false,
        mediaServicesDidReset: true,
      }),
      true,
    );
  }
});

test('late failed stop cannot resurrect recording after media-services reset', async () => {
  const operation = createRecordingOperation();
  const start = operation.beginStart();
  assert.ok(start);
  assert.equal(start.commit(), true);
  const nativeStop = deferred();

  const stopping = operation.runStop(async () => nativeStop.promise);
  assert.equal(operation.getPhase(), 'stopping');
  operation.interrupt();
  assert.equal(operation.beginStart(), null);
  nativeStop.reject(new Error('native stop failed after reset'));

  await assert.rejects(stopping, /failed after reset/);
  assert.equal(operation.getPhase(), 'idle');
  assert.ok(operation.beginStart());
});
