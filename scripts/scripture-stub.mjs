import http from 'node:http';

const port = Number(process.env.SCRIPTURE_STUB_PORT ?? 9085);
const mode = process.env.SCRIPTURE_STUB_MODE ?? 'main';
let requestCount = 0;
let privacySafe = true;

const fixtures = [
  {
    language: 'ru',
    canonical: { canonical_id: 'v3:19.023.001-006', book_number: 19, chapter_number: 23, verse_start: 1, verse_end: 6 },
    passage: {
      translation: 1,
      translation_alias: 'syn',
      book_number: 19,
      chapter_number: 22,
      verse_start: 1,
      verse_end: 6,
      title: null,
      // Намеренно короче прежнего порога 160 символов, но длиннее трёх строк.
      text: 'Господь — Пастырь мой.\n\nОн покоит меня.\n\nОн ведёт меня.\n\nИ я пребуду с Ним.',
    },
    source: 'safe_pool', fallback_reason: 'empty_topic', history_reset: false,
  },
  {
    language: 'ru',
    canonical: { canonical_id: 'v3:45.001.005-008', book_number: 45, chapter_number: 1, verse_start: 5, verse_end: 8 },
    passage: {
      translation: 1,
      translation_alias: 'syn',
      book_number: 45,
      chapter_number: 1,
      verse_start: 5,
      verse_end: 8,
      title: 'Просить с верою',
      text: 'Если же у кого из вас недостаёт мудрости, да просит у Бога.\n\nПросите с верою, нимало не сомневаясь.\n\nСомневающийся подобен морской волне, ветром поднимаемой и развеваемой.\n\nДа не думает такой человек получить что-нибудь от Господа.\n\nЧеловек с двоящимися мыслями не твёрд во всех путях своих.\n\nБлажен человек, который переносит испытание.\n\nПолучив одобрение, он получит венец жизни.\n\nВсякое даяние доброе нисходит свыше.\n\nОтец светов не изменяется и не затмевается.\n\nБудьте же исполнителями слова, а не слышателями только.',
    },
    source: 'retrieval_fallback', fallback_reason: 'deadline', history_reset: false,
  },
];

const json = (response, status, body, headers = {}) => {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'GET' && request.url === '/__status') {
    json(response, 200, { requestCount, privacySafe });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/languages') {
    json(response, 200, [
      { alias: 'ru', name_en: 'Russian', name_national: 'Русский' },
      { alias: 'en', name_en: 'English', name_national: 'English' },
    ]);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/translations') {
    const language = url.searchParams.get('language');
    json(response, 200, language === 'en' ? [
      {
        code: 16, alias: 'bsb', name: 'BSB', description: 'Berean Standard Bible',
        language: 'en', active: true,
        voices: [{
          code: 151, alias: 'bob', name: 'Bob Souer', description: 'Narrator',
          is_music: false, active: true,
        }],
      },
    ] : [
      {
        code: 1, alias: 'syn', name: 'SYNO', description: 'Синодальный перевод',
        language: 'ru', active: true,
        voices: [{
          code: 1, alias: 'alexander', name: 'Alexander Bondarenko', description: 'Диктор',
          is_music: false, active: true,
        }],
      },
    ]);
    return;
  }
  if (request.method === 'GET' && request.url === '/api/translations/1/books') {
    json(response, 200, [
      { book_number: 19, name: 'Псалом', alias: 'psa', chapters_count: 150 },
      { book_number: 45, name: 'Послание Иакова', alias: 'jas', chapters_count: 5 },
    ]);
    return;
  }
  if (request.method !== 'POST' || request.url !== '/api/scripture/v1/select') {
    json(response, 404, { detail: 'Not Found' });
    return;
  }

  let raw = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => { raw += chunk; });
  request.on('end', () => {
    requestCount++;
    let body;
    try { body = JSON.parse(raw); } catch { json(response, 422, { detail: 'request body is not valid JSON' }); return; }
    if (mode === 'privacy' && Array.isArray(body.user_replies) && body.user_replies.length) {
      privacySafe = false;
      json(response, 422, { detail: 'privacy assertion failed' });
      return;
    }
    if (mode === 'fallback' && requestCount === 1) {
      json(response, 503, { detail: 'temporarily unavailable' });
      return;
    }
    if (mode === 'fallback' && requestCount === 2) {
      json(response, 429, { detail: 'Scripture selection request limit exceeded' }, { 'retry-after': '1' });
      return;
    }
    const sendSuccess = () => json(response, 200, fixtures[(requestCount - 1) % fixtures.length]);
    if (mode === 'privacy' && requestCount === 1) setTimeout(sendSuccess, 1000);
    else sendSuccess();
  });
});

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Scripture stub listening on ${port} (${mode})\n`);
});
