import http from 'node:http';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../../src/core/errors.js';
import { createRouter } from '../../src/core/router/index.js';
import { buildTestApp, startTestServer } from '../helpers/server.js';

function makeApp({ limit = 1_048_576, extraMiddleware = [], logger } = {}) {
  const router = createRouter();
  router.get('/health', (ctx) => ctx.json(200, { ok: true }));
  router.post('/echo', (ctx) => ctx.json(200, ctx.body));
  return buildTestApp({
    router,
    config: { corsOrigins: ['http://localhost:5173'] },
    limits: { bodyBytes: limit },
    logger,
    additionalMiddleware: extraMiddleware,
  });
}

function sendChunked(url, chunks) {
  const target = new URL('/echo', url);
  return new Promise((resolve, reject) => {
    const req = http.request(
      target,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Transfer-Encoding': 'chunked',
        },
      },
      (res) => {
        const responseChunks = [];
        res.on('data', (chunk) => responseChunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            body: Buffer.concat(responseChunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

test('HTTP pipeline chạy vào middleware theo thứ tự và thoát theo thứ tự ngược', async () => {
  const trace = [];
  const traceMiddleware = async (ctx, next) => {
    trace.push('before');
    await next();
    trace.push('after');
  };
  const server = await startTestServer(
    makeApp({ extraMiddleware: [traceMiddleware] }),
  );
  try {
    const response = await fetch(`${server.url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(trace, ['before', 'after']);
  } finally {
    await server.close();
  }
});

test('request id hợp lệ được trả lại nguyên vẹn', async () => {
  const server = await startTestServer(makeApp());
  try {
    const response = await fetch(`${server.url}/health`, {
      headers: { 'x-request-id': 'client_id-42' },
    });
    assert.equal(response.headers.get('x-request-id'), 'client_id-42');
  } finally {
    await server.close();
  }
});

test('JSON lỗi trả 400 invalid_json', async () => {
  const server = await startTestServer(makeApp());
  try {
    const response = await fetch(`${server.url}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: { code: 'invalid_json', message: 'invalid_json' },
    });
  } finally {
    await server.close();
  }
});

test('Content-Length vượt limit trả 413', async () => {
  const server = await startTestServer(makeApp({ limit: 8 }));
  try {
    const response = await fetch(`${server.url}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"value":"long"}',
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      error: { code: 'payload_too_large', message: 'Body vượt quá 8 byte' },
    });
  } finally {
    await server.close();
  }
});

test('chunked JSON vượt limit trả 413', async () => {
  const server = await startTestServer(makeApp({ limit: 8 }));
  try {
    const response = await sendChunked(server.url, [
      '{"val',
      'ue":"long"}',
    ]);
    assert.equal(response.status, 413);
    assert.match(response.body, /payload_too_large/);
  } finally {
    await server.close();
  }
});

test('preflight hợp lệ trả 204 và không gọi router', async () => {
  let routeCalled = false;
  const router = createRouter();
  router.get('/health', () => {
    routeCalled = true;
  });
  const server = await startTestServer(
    buildTestApp({ router, config: { corsOrigins: ['http://localhost:5173'] } }),
  );
  try {
    const response = await fetch(`${server.url}/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.match(response.headers.get('access-control-allow-methods'), /GET/);
    assert.equal(routeCalled, false);
  } finally {
    await server.close();
  }
});

test('handler throw không lộ thông điệp hoặc stack trace', async () => {
  const router = createRouter();
  router.get('/secret', () => {
    throw new Error('mật khẩu db là hunter2');
  });
  const server = await startTestServer(buildTestApp({ router }));
  try {
    const response = await fetch(`${server.url}/secret`);
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.equal(body.includes('hunter2'), false);
    assert.equal(body.includes('at '), false);
  } finally {
    await server.close();
  }
});

test('HttpError được chuyển thành status và code tương ứng', async () => {
  const router = createRouter();
  router.get('/conflict', () => {
    throw new HttpError(409, 'conflict', 'Conflict');
  });
  const server = await startTestServer(buildTestApp({ router }));
  try {
    const response = await fetch(`${server.url}/conflict`);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: { code: 'conflict', message: 'Conflict' },
    });
  } finally {
    await server.close();
  }
});

test('middleware không next và không trả lời nhận 500 no_response', async () => {
  const server = await startTestServer(
    makeApp({
      extraMiddleware: [async () => {}],
    }),
  );
  try {
    const response = await fetch(`${server.url}/health`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: { code: 'no_response' },
    });
  } finally {
    await server.close();
  }
});

test('client hủy response giữa chừng tạo access log aborted', async () => {
  let resolveAborted;
  const abortedLog = new Promise((resolve) => {
    resolveAborted = resolve;
  });
  const logger = {
    child(fields = {}) {
      return {
        info: (message, extra) => record('info', message, fields, extra),
        warn: (message, extra) => record('warn', message, fields, extra),
        error: (message, extra) => record('error', message, fields, extra),
        debug() {},
      };
    },
    info() {},
    warn() {},
    error() {},
    debug() {},
  };
  function record(level, message, fields, extra) {
    if (message === 'aborted') {
      resolveAborted({ level, ...fields, ...extra });
    }
  }

  const router = createRouter();
  router.get('/stream', async (ctx) => {
    ctx.res.writeHead(200);
    ctx.res.write('partial response');
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (!ctx.res.destroyed) ctx.res.end();
  });
  const server = await startTestServer(buildTestApp({ router, logger }));

  try {
    await new Promise((resolve, reject) => {
      const req = http.get(`${server.url}/stream`, (res) => {
        res.once('data', () => {
          res.destroy();
          resolve();
        });
      });
      req.once('error', reject);
    });
    const log = await Promise.race([
      abortedLog,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('aborted access log not written')), 1000),
      ),
    ]);
    assert.equal(log.level, 'warn');
    assert.equal(log.path, '/stream');
  } finally {
    await server.close();
  }
});
