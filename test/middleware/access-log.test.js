import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessLog } from '../../src/middleware/access-log.js';

function makeContext(statusCode = 200) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  const entries = [];
  const logger = Object.fromEntries(
    ['info', 'warn', 'error'].map((level) => [
      level,
      (message, fields) => entries.push({ level, message, fields }),
    ]),
  );
  return {
    ctx: {
      req: { method: 'GET' },
      res,
      url: new URL('http://localhost/health?verbose=1'),
      requestId: 'request-123',
      logger,
    },
    entries,
    res,
  };
}

test('access log ghi sau finish với mức log theo status', async () => {
  const { ctx, entries, res } = makeContext(404);
  await accessLog()(ctx, async () => {
    assert.equal(entries.length, 0);
    res.emit('finish');
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, 'warn');
  assert.equal(entries[0].message, 'access_log');
  assert.deepEqual(
    Object.keys(entries[0].fields).sort(),
    ['method', 'ms', 'path', 'requestId', 'status'],
  );
  assert.equal(entries[0].fields.path, '/health');
  assert.equal(entries[0].fields.requestId, 'request-123');
  assert.ok(entries[0].fields.ms >= 0);
});

test('close trước finish ghi riêng aborted, không ghi access_log', async () => {
  const { ctx, entries, res } = makeContext();
  await accessLog()(ctx, async () => {
    res.emit('close');
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, 'warn');
  assert.equal(entries[0].message, 'aborted');
});

test('finish rồi close chỉ ghi access_log một lần', async () => {
  const { ctx, entries, res } = makeContext(503);
  await accessLog()(ctx, async () => {
    res.emit('finish');
    res.emit('close');
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, 'error');
});
