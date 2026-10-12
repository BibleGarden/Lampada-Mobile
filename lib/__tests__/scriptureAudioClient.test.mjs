import assert from 'node:assert/strict';
import test from 'node:test';

test('narration requires alignment for the complete passage', async (t) => {
  const previousUrl = process.env.EXPO_PUBLIC_API_URL;
  const previousFetch = globalThis.fetch;
  process.env.EXPO_PUBLIC_API_URL = 'https://scripture.test';
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previousUrl;
  });
  const { fetchScriptureAudioClip } = await import('../scriptureAudioClient.ts');
  const scripture = { selection: { passage: {
    translation: 1, book_number: 23, chapter_number: 40,
    verse_start: 28, verse_end: 31,
  } } };
  let verses = [];
  globalThis.fetch = async (raw) => {
    const path = new URL(raw).pathname;
    const body = path.endsWith('/books')
      ? [{ book_number: 23, alias: 'isa', chapters_count: 66 }]
      : { parts: [{ audio_link: 'https://audio.test/isa.mp3', verses }] };
    return new Response(JSON.stringify(body), { status: 200 });
  };

  verses = [28, 29, 30, 31].map(number => ({ number, begin: 0, end: 0 }));
  await assert.rejects(fetchScriptureAudioClip(scripture, 1), { message: 'audio_unavailable' });

  verses = [
    { number: 28, begin: 1, end: 3 },
    { number: 29, begin: 0, end: 0 },
    { number: 30, begin: 5, end: 7 },
    { number: 31, begin: 7, end: 9 },
  ];
  await assert.rejects(fetchScriptureAudioClip(scripture, 1), { message: 'audio_unavailable' });

  verses = [28, 29, 30, 31].map((number, index) => ({
    number, begin: index * 2, end: index * 2 + 2,
  }));
  const clip = await fetchScriptureAudioClip(scripture, 1);
  assert.equal(clip.startSeconds, 0);
  assert.equal(clip.endSeconds, 8);
  assert.deepEqual(clip.verses.map(verse => verse.number), [28, 29, 30, 31]);
});
