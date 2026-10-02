import { test } from 'node:test';
import assert from 'node:assert/strict';

test(' môi trường test hoạt động', () => {
    assert.strictEqual(1 + 1, 2);
});