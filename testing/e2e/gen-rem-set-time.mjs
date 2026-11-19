#!/usr/bin/env node
// Generates reminder time-setting steps for the editor (app/settings.tsx).
//
// Stepper labels include the current time ("09:00: hour forward"), so the
// steps cannot be hardcoded as static YAML — this script computes them while
// tracking state.
//
// Scenario: the rule 0 editor is open, the rule has a single time 09:00. Each
// subsequent argument is the next time row added by the "Add time" button
// (new time = previously set + 60 minutes).
//
// Usage: node testing/e2e/gen-rem-set-time.mjs [--init HH:MM] HH:MM [HH:MM ...] > /tmp/rem-set-time.yaml
//   --init HH:MM — current time of the first row (default 09:00 — the clean
//   install default; pass it if the editor was already changed in earlier flows).
//   Each HH:MM — target for the corresponding time row (a multiple of 5 minutes).

const fmt = (total) => `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

const args = process.argv.slice(2);
let initial = 9 * 60;
if (args[0] === '--init') {
  if (!/^\d{2}:[0-5]\d$/.test(args[1] || '')) {
    console.error('usage: --init expects HH:MM');
    process.exit(1);
  }
  initial = Number(args[1].slice(0, 2)) * 60 + Number(args[1].slice(3));
  args.splice(0, 2);
}
const targets = args;
if (targets.length === 0 || targets.some((t) => !/^\d{2}:[0-5]\d$/.test(t) || Number(t.slice(3)) % 5 !== 0)) {
  console.error('usage: gen-rem-set-time.mjs [--init HH:MM] HH:MM [HH:MM ...] (minutes multiple of 5)');
  process.exit(1);
}

const lines = ['appId: twinkler', '---'];
let current = initial;

targets.forEach((target, index) => {
  if (index > 0) {
    // "Add time": new row = last set time + 60 minutes.
    lines.push(`- tapOn: { id: "reminder-add-time-0" }`);
    current = (current + 60) % 1440;
  }
  const goal = Number(target.slice(0, 2)) * 60 + Number(target.slice(3));
  const delta = (goal - current + 1440) % 1440;
  // Pick the shortest direction: the "forward only" path may cross an
  // already occupied time — the screen rejects the shift (guard in shiftReminderTime).
  const forward = Math.floor(delta / 60) + (delta % 60) / 5;
  const backDelta = (1440 - delta) % 1440;
  const backward = Math.floor(backDelta / 60) + (backDelta % 60) / 5;
  if (forward <= backward) {
    for (let i = 0; i < Math.floor(delta / 60); i += 1) {
      lines.push(`- tapOn: "${fmt(current)}: час вперёд"`);
      current = (current + 60) % 1440;
    }
    for (let i = 0; i < (delta % 60) / 5; i += 1) {
      lines.push(`- tapOn: "${fmt(current)}: пять минут вперёд"`);
      current = (current + 5) % 1440;
    }
  } else {
    for (let i = 0; i < Math.floor(backDelta / 60); i += 1) {
      lines.push(`- tapOn: "${fmt(current)}: час назад"`);
      current = (current + 1380) % 1440;
    }
    for (let i = 0; i < (backDelta % 60) / 5; i += 1) {
      lines.push(`- tapOn: "${fmt(current)}: пять минут назад"`);
      current = (current + 1435) % 1440;
    }
  }
});

// Maestro cannot parse a subflow with no commands — add a safe no-op.
if (lines.length === 2) {
  lines.push('- assertVisible:', '    id: "reminders-editor-modal"');
}

console.log(lines.join('\n'));
