import { translate } from './i18n';
import PrayerLiveActivity, {
  type PrayerLiveActivityProps,
} from '../widgets/PrayerLiveActivity';
import type { PrayerSystemTimerState } from './prayerSystemTimer';

let operation: Promise<void> = Promise.resolve();

const enqueue = (work: () => Promise<void>) => {
  operation = operation.then(work, work);
  return operation;
};

const propsFor = (timer: PrayerSystemTimerState): PrayerLiveActivityProps => ({
  startedAtMs: timer.startedAtMs,
  endsAtMs: timer.endsAtMs,
  prayerLabel: translate('system.prayer'),
  endedLabel: translate('system.timeEnded'),
  musicHint: translate('system.musicHint'),
});

const endAll = async () => {
  await Promise.all(
    PrayerLiveActivity.getInstances().map((instance) => instance.end('immediate')),
  );
};

export function startPrayerSystemTimer(timer: PrayerSystemTimerState): Promise<void> {
  return enqueue(async () => {
    await endAll();
    PrayerLiveActivity.start(
      propsFor(timer),
      'lampada://session',
      new Date(timer.endsAtMs),
    );
  });
}

export function updatePrayerSystemTimer(timer: PrayerSystemTimerState): Promise<void> {
  return enqueue(async () => {
    const instances = PrayerLiveActivity.getInstances();
    if (instances.length === 0) {
      PrayerLiveActivity.start(
        propsFor(timer),
        'lampada://session',
        new Date(timer.endsAtMs),
      );
      return;
    }
    await Promise.all(
      instances.map((instance) =>
        instance.update(propsFor(timer), new Date(timer.endsAtMs)),
      ),
    );
  });
}

export function stopPrayerSystemTimer(): Promise<void> {
  return enqueue(endAll);
}
