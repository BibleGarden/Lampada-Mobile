import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

// Лимиты Google Play Console считаются в символах.
const limits = { title: 30, shortDescription: 80, fullDescription: 4000 };
const directory = new URL('../../store/play/', import.meta.url);
const listings = Object.fromEntries(readdirSync(directory).filter((name) => name.endsWith('.json'))
  .map((name) => [name.slice(0, -'.json'.length), JSON.parse(readFileSync(new URL(name, directory), 'utf8'))]));

test('Play listing covers every interface language', () => {
  assert.deepEqual(Object.keys(listings).sort(), ['en-US', 'ru-RU', 'uk']);
});

for (const [locale, listing] of Object.entries(listings)) {
  test(`${locale} Play listing fits Google Play limits without Apple terms`, () => {
    assert.deepEqual(Object.keys(listing).sort(), Object.keys(limits).sort());
    for (const [field, maximum] of Object.entries(limits)) {
      const text = listing[field];
      assert.equal(typeof text, 'string', `${locale}.${field}`);
      assert.equal(text, text.trim(), `${locale}.${field} has surrounding whitespace`);
      assert.ok(text.length > 0, `${locale}.${field} is empty`);
      const length = [...text].length;
      assert.ok(length <= maximum, `${locale}.${field}: ${length}/${maximum} characters`);
      assert.doesNotMatch(text, /Face ID|Touch ID|App Store|iPhone|iPad|iOS/, `${locale}.${field}`);
    }
  });
}
