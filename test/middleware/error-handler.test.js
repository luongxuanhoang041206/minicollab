import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badRequest, HttpError } from '../../src/core/errors.js';
import { errorHandler } from '../../src/middleware/error-handler.js';

function makeContext({ headersSent = false } = {}) {
  const logs = [];
  const ctx = {
    res: {
      headersSent,
      headers: {},
      destroyed: false,
      setHeader(name, value) {
        this.headers[name] = value;
      },
      destroy() {
        this.destroyed = true;
      },
    },
    logger: {
      error: (message, fields) => logs.push({ message, fields }),
    },
    json(status, body) {
      this.response = { status, body };
    },
  };
  return { ctx, logs };
}

test('HttpError trả status, headers, code, message expose và details', async () => {
  const { ctx } = makeContext();
  await errorHandler()(ctx, async () => {
    throw new HttpError(409, 'conflict', 'Already exists', {
      details: { id: 7 },
      headers: { 'X-Conflict': 'yes' },
    });
  });

  assert.deepEqual(ctx.response, {
    status: 409,
    body: {
      error: {
        code: 'conflict',
        message: 'Already exists',
        details: { id: 7 },
      },
    },
  });
  assert.equal(ctx.res.headers['X-Conflict'], 'yes');
});

test('HttpError không expose message ẩn', async () => {
  const { ctx } = makeContext();
  await errorHandler()(ctx, async () => {
    throw new HttpError(500, 'internal_error', 'private detail');
  });

  assert.deepEqual(ctx.response, {
    status: 500,
    body: { error: { code: 'internal_error' } },
  });
});

test('lỗi thường log stack nhưng trả body chung chung', async () => {
  const { ctx, logs } = makeContext();
  await errorHandler()(ctx, async () => {
    throw new Error('mật khẩu db là hunter2');
  });

  assert.equal(ctx.response.status, 500);
  assert.equal(JSON.stringify(ctx.response.body).includes('hunter2'), false);
  assert.equal(JSON.stringify(ctx.response.body).includes('at '), false);
  assert.match(logs[0].fields.err, /hunter2/);
  assert.match(logs[0].fields.err, /at /);
});

test('headers đã gửi thì log lỗi và destroy response', async () => {
  const { ctx, logs } = makeContext({ headersSent: true });
  await errorHandler()(ctx, async () => {
    throw badRequest('late_error');
  });

  assert.equal(ctx.res.destroyed, true);
  assert.equal(ctx.response, undefined);
  assert.equal(logs.length, 1);
});
