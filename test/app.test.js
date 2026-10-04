import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/core/app.js';
import { createLogger } from '../src/core/logger.js';
import { startTestServer } from './helpers/server.js';

const silent = createLogger({ level: 'error', service: 'test', write: () => { } });
let srv;

before(async () => {
  srv = await startTestServer(createApp({ logger: silent }));
});

after(async () => {
  if (srv) await srv.close();
});

test('GET /health → 200 JSON', async () => {
  const res = await fetch(`${srv.url}/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('route lạ → 404 JSON', async () => {
  const res = await fetch(`${srv.url}/not-exist`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await res.json(), { error: 'Not Found' });
});

test('POST /health → 405 và có header Allow', async () => {
  const res = await fetch(`${srv.url}/health`, { method: 'POST' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET');
  assert.match(res.headers.get('content-type'), /application\/json/);
});

test('POST /echo trả lại đúng body', async () => {
  const payload = 'Hello MiniCollab Echo!';
  const res = await fetch(`${srv.url}/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: payload,
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
  const bodyText = await res.text();
  assert.equal(bodyText, payload);
});

test('/echo body > limit → 413', async () => {
  // Tạo server với limit nhỏ (ví dụ 100 bytes)
  const app = createApp({ logger: silent, limits: { bodyBytes: 100 } });
  const customSrv = await startTestServer(app);

  try {
    const hugeBody = 'x'.repeat(200);
    const res = await fetch(`${customSrv.url}/echo`, {
      method: 'POST',
      body: hugeBody,
    });
    assert.equal(res.status, 413);
  } finally {
    await customSrv.close();
  }
});


test('handler throw → 500 và body không chứa "at " (stack)', async () => {
  const res = await fetch(`${srv.url}/boom`);
  assert.equal(res.status, 500);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const rawText = await res.text();
  assert.equal(rawText.includes('at '), false);
  const data = JSON.parse(rawText);
  assert.deepEqual(data, { error: 'Internal Server Error' });
});
