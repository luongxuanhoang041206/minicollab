import { Readable } from 'node:stream';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyParser } from '../../src/middleware/body-parser.js';

function makeContext({ method = 'POST', contentType, contentLength, chunks = [] } = {}) {
  const headers = {};
  if (contentType) headers['content-type'] = contentType;
  if (contentLength !== undefined) headers['content-length'] = String(contentLength);
  const req = Readable.from(chunks);
  req.method = method;
  req.headers = headers;
  const logs = [];
  return {
    ctx: {
      req,
      body: undefined,
      logger: {
        error: (message, fields) => logs.push({ message, fields }),
      },
    },
    logs,
  };
}

test('JSON body được ghép bằng Buffer rồi parse sau khi stream kết thúc', async () => {
  const { ctx } = makeContext({
    contentType: 'application/json; charset=utf-8',
    chunks: [Buffer.from('{"name":'), Buffer.from('"MiniCollab"}')],
  });
  let continued = false;
  await bodyParser() (ctx, async () => {
    continued = true;
  });

  assert.deepEqual(ctx.body, { name: 'MiniCollab' });
  assert.equal(continued, true);
});

test('body rỗng đặt ctx.body thành undefined', async () => {
  const { ctx } = makeContext({
    contentType: 'application/json',
    chunks: [],
  });
  await bodyParser()(ctx, async () => {});
  assert.equal(ctx.body, undefined);
});

test('JSON hỏng báo HttpError badRequest invalid_json', async () => {
  const { ctx } = makeContext({
    contentType: 'application/json',
    chunks: [Buffer.from('{broken')],
  });
  await assert.rejects(bodyParser()(ctx, async () => {}), {
    status: 400,
    code: 'invalid_json',
  });
});

test('Content-Length quá limit bị từ chối trước khi đọc body', async () => {
  const { ctx } = makeContext({
    contentType: 'application/json',
    contentLength: 20,
    chunks: [Buffer.from('{"a":1}')],
  });
  await assert.rejects(bodyParser({ limit: 10 })(ctx, async () => {}), {
    status: 413,
    code: 'payload_too_large',
  });
});

test('body chunked quá limit bị từ chối', async () => {
  const { ctx } = makeContext({
    contentType: 'application/json',
    chunks: [Buffer.from('{"value":"'), Buffer.from('0123456789"}')],
  });
  await assert.rejects(bodyParser({ limit: 10 })(ctx, async () => {}), {
    status: 413,
    code: 'payload_too_large',
  });
});

test('content type không phải JSON không đọc req và vẫn gọi next', async () => {
  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    resume() {
      throw new Error('request body should remain untouched');
    },
  };
  const ctx = { req, logger: { error() {} } };
  let continued = false;
  await bodyParser()(ctx, async () => {
    continued = true;
  });
  assert.equal(continued, true);
  assert.equal(ctx.body, undefined);
});
