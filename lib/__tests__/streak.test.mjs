import assert from 'node:assert/strict';
import test from 'node:test';

import { getWeekIndicators } from '../streak.ts';

test('неделя не теряет реальные дни из-за будущих prayed_days', async () => {
  const prayedDays = [
    '2026-08-16',
    '2026-08-18',
    '2026-08-22',
    '2026-08-23',
    '2026-08-24',
    '2026-08-25',
    '2026-08-26',
    '2026-08-27',
    '2026-08-28',
    '2026-08-29',
    '2026-08-30',
  ];
  let requestedRange;
  const week = await getWeekIndicators(async (firstDay, lastDay) => {
    requestedRange = [firstDay, lastDay];
    return prayedDays.filter((day) => day >= firstDay && day <= lastDay);
  }, new Date(2026, 7, 22));

  assert.deepEqual(requestedRange, ['2026-08-16', '2026-08-22']);
  assert.deepEqual(week, [true, false, true, false, false, false, true]);
});
