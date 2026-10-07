import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cors } from '../../src/middleware/cors.js';

function context({ method = 'GET', origin, preflight = false } = {}) {
  const headers = {};
  const res = {
    statusCode: 200,
    ended: false,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    writeHead(status) {
      this.statusCode = status;
    },
    end() {
      this.ended = true;
    },
  };
  const reqHeaders = {};
  if (origin) reqHeaders.origin = origin;
  if (preflight) reqHeaders['access-control-request-method'] = 'POST';
  return {
    ctx: { req: { method, headers: reqHeaders }, res },
    headers,
    res,
  };
}

test('origin được cho phép nhận đúng ACAO và Vary', async () => {
  const { ctx, headers } = context({ origin: 'http://localhost:5173' });
  let continued = false;
  await cors({ origins: ['http://localhost:5173'] })(ctx, async () => {
    continued = true;
  });

  assert.equal(headers['access-control-allow-origin'], 'http://localhost:5173');
  assert.equal(headers.vary, 'Origin');
  assert.equal(continued, true);
});

test('preflight hợp lệ trả 204 và short-circuit', async () => {
  const { ctx, headers, res } = context({
    method: 'OPTIONS',
    origin: 'http://localhost:5173',
    preflight: true,
  });
  let continued = false;
  await cors({ origins: ['http://localhost:5173'] })(ctx, async () => {
    continued = true;
  });

  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.match(headers['access-control-allow-methods'], /POST/);
  assert.match(headers['access-control-allow-headers'], /Content-Type/);
  assert.equal(continued, false);
});

test('origin không được phép không thêm CORS header và tiếp tục pipeline', async () => {
  const { ctx, headers } = context({ origin: 'https://attacker.example' });
  let continued = false;
  await cors({ origins: ['http://localhost:5173'] })(ctx, async () => {
    continued = true;
  });

  assert.deepEqual(headers, {});
  assert.equal(continued, true);
});
