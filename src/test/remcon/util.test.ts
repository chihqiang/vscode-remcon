import * as assert from 'assert';
import { genId } from '../../remcon/util';

suite('Util', () => {
  test('genId returns a non-empty string', () => {
    const id = genId();
    assert.ok(typeof id === 'string' && id.length > 0);
  });

  test('genId returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => genId()));
    assert.strictEqual(ids.size, 100);
  });
});
