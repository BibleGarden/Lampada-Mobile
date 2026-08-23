import assert from 'node:assert/strict';
import test from 'node:test';

import { favoriteIndexesFromRefs } from '../favorites.ts';

test('восстанавливает избранное по ссылкам и игнорирует отсутствующие в каталоге', () => {
  const catalog = [{ ref: 'Ин. 3:16' }, { ref: 'Пс. 22:1' }, { ref: 'Рим. 8:28' }];

  assert.deepEqual(
    favoriteIndexesFromRefs(['Рим. 8:28', 'Неизвестная ссылка', 'Ин. 3:16'], catalog),
    [0, 2],
  );
});
