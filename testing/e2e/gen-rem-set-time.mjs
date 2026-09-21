#!/usr/bin/env node
// Генератор шагов установки времён напоминаний в редакторе (app/settings.tsx).
//
// Подписи шагперов включают текущее время («09:00: час вперёд»), поэтому шаги
// нельзя зашить статичным YAML — их считает этот скрипт, отслеживая состояние.
//
// Сценарий: редактор правила 0 открыт, в правиле одно время 09:00. Каждый
// следующий аргумент — следующая строка времени, добавленная кнопкой
// «Добавить время» (новое время = предыдущее установленное + 60 минут).
//
// Usage: node testing/e2e/gen-rem-set-time.mjs [--init HH:MM] HH:MM [HH:MM ...] > /tmp/rem-set-time.yaml
//   --init HH:MM — текущее время первой строки (по умолчанию 09:00 — дефолт
//   чистой установки; передавать, если редактор уже правили в предыдущих флоу).
//   Каждое HH:MM — цель соответствующей строки времени (кратно 5 минутам).

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
    // «Добавить время»: новая строка = последнее установленное + 60 минут.
    lines.push(`- tapOn: { id: "reminder-add-time-0" }`);
    current = (current + 60) % 1440;
  }
  const goal = Number(target.slice(0, 2)) * 60 + Number(target.slice(3));
  const delta = (goal - current + 1440) % 1440;
  // Выбираем кратчайшее направление: путь «только вперёд» может пересечь
  // уже занятое время — экран отклонит сдвиг (guard в shiftReminderTime).
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

// Сабфлоу без команд не парсится Maestro — добавляем безопасный no-op.
if (lines.length === 2) {
  lines.push('- assertVisible:', '    id: "reminders-editor-modal"');
}

console.log(lines.join('\n'));
