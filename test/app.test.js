import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../src/core/router/index.js';
import { registerRoutes } from '../src/routes.js';
import { buildTestApp, startTestServer } from './helpers/server.js';

// Shared app used by most tests
const limits = { bodyBytes: 1_048_576 };
const config = { env: 'test' };

function makeApp(overrideLimits = limits) {
  const router = createRouter();
  registerRoutes(router, { config, limits: overrideLimits });
  return buildTestApp({ router, config, limits: overrideLimits });
}

let srv;

before(async () => {
  srv = await startTestServer(makeApp());
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
  assert.deepEqual(await res.json(), {
    error: { code: 'not_found', message: 'not_found' },
  });
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
  const app = makeApp({ bodyBytes: 100 });
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
  const res = await fetch(`${srv.url}/_lab/boom`);
  assert.equal(res.status, 500);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const rawText = await res.text();
  assert.equal(rawText.includes('at '), false);
  const data = JSON.parse(rawText);
  assert.deepEqual(data, { error: { code: 'internal_error' } });
});

// ─── Tests mới từ chặng 7.4 ──────────────────────────────────────────────────

test('GET /files/%E0%A4%A → 400 bad_request (percent-encoding hỏng)', async () => {
  // parseRequestPath phát hiện decode lỗi trước khi khớp route → 400
  const res = await fetch(`${srv.url}/files/%E0%A4%A`, { redirect: 'manual' });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    error: { code: 'bad_path', message: 'bad_path' },
  });
});
