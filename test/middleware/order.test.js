import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../../src/core/logger.js';
import { createRouter } from '../../src/core/router/index.js';
import { accessLog } from '../../src/middleware/access-log.js';
import { bodyParser } from '../../src/middleware/body-parser.js';
import { cors } from '../../src/middleware/cors.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { requestId } from '../../src/middleware/request-id.js';
import { routerMiddleware } from '../../src/middleware/router.js';
import { startTestServer, buildTestApp } from '../helpers/server.js';

function capturedLogger(lines) {
  return createLogger({
    level: 'debug',
    service: 'test',
    write: (line) => lines.push(JSON.parse(line)),
  });
}

function makeEchoRouter() {
  const router = createRouter();
  router.post('/echo', (ctx) => ctx.json(200, ctx.body));
  router.get('/health', (ctx) => ctx.json(200, { ok: true }));
  return router;
}

test('errorHandler đặt sau bodyParser không bắt được lỗi từ bodyParser', async () => {
  const router = makeEchoRouter();
  const server = await startTestServer(
    buildTestApp({
      router,
      pipeline: [
        bodyParser(),
        errorHandler(),
        routerMiddleware(router),
      ],
    }),
  );
  try {
    const response = await fetch(`${server.url}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{broken',
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: { code: 'internal_error' },
    });
  } finally {
    await server.close();
  }
});

test('bodyParser trước CORS bỏ qua OPTIONS và CORS short-circuit vẫn trả 204', async () => {
  const router = makeEchoRouter();
  const server = await startTestServer(
    buildTestApp({
      router,
      pipeline: [
        errorHandler(),
        bodyParser(),
        cors({ origins: ['http://localhost:5173'] }),
        routerMiddleware(router),
      ],
    }),
  );
  try {
    const response = await fetch(`${server.url}/echo`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
      },
    });
    assert.equal(response.status, 204);
  } finally {
    await server.close();
  }
});

test('accessLog trước requestId vẫn ghi requestId sau khi downstream chạy', async () => {
  const lines = [];
  const router = makeEchoRouter();
  const server = await startTestServer(
    buildTestApp({
      router,
      logger: capturedLogger(lines),
      pipeline: [
        errorHandler(),
        accessLog(),
        requestId,
        routerMiddleware(router),
      ],
    }),
  );
  try {
    const response = await fetch(`${server.url}/health`);
    const requestIdValue = response.headers.get('x-request-id');
    assert.ok(requestIdValue);
    await response.arrayBuffer();

    const accessEntry = lines.find((entry) => entry.msg === 'access_log');
    assert.equal(accessEntry.requestId, requestIdValue);
  } finally {
    await server.close();
  }
});

test('accessLog sau bodyParser không thấy request bị 413', async () => {
  const lines = [];
  const router = makeEchoRouter();
  const server = await startTestServer(
    buildTestApp({
      router,
      limits: { bodyBytes: 2 },
      logger: capturedLogger(lines),
      pipeline: [
        errorHandler(),
        bodyParser({ limit: 2 }),
        accessLog(),
        routerMiddleware(router),
      ],
    }),
  );
  try {
    const response = await fetch(`${server.url}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"x":1}',
    });
    assert.equal(response.status, 413);
    assert.equal(lines.some((entry) => entry.msg === 'access_log'), false);
  } finally {
    await server.close();
  }
});
