import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { confirmExample } from '../apps/web/src/demo.ts';

test('example can be marked as entered', () => {
  assert.equal(confirmExample('waiting'), 'confirmed');
});
test('confirming the example again keeps the same status', () => {
  assert.equal(confirmExample('confirmed'), 'confirmed');
});
