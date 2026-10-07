import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestId } from '../../src/middleware/request-id.js';

function makeCtx(header) {
  const fields = [];
  const responseHeaders = {};
  const rootLogger = {
    child(childFields) {
      fields.push(childFields);
      return this;
    },
  };
  return {
    ctx: {
      req: { headers: { 'x-request-id': header } },
      res: {
        setHeader(name, value) {
          responseHeaders[name.toLowerCase()] = value;
        },
      },
      logger: rootLogger,
    },
    fields,
    responseHeaders,
  };
}

test('requestId nhận lại id hợp lệ', async () => {
  const { ctx, fields, responseHeaders } = makeCtx('client_request-7');
  await requestId(ctx, async () => {});
  assert.equal(ctx.requestId, 'client_request-7');
  assert.deepEqual(fields, [{ requestId: 'client_request-7' }]);
  assert.equal(responseHeaders['x-request-id'], 'client_request-7');
});

test('requestId bỏ qua giá trị có ký tự xuống dòng và tự sinh id', async () => {
  const { ctx, fields, responseHeaders } = makeCtx('bad\r\nforged: yes');
  await requestId(ctx, async () => {});
  assert.match(ctx.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(fields[0].requestId, ctx.requestId);
  assert.equal(responseHeaders['x-request-id'], ctx.requestId);
});
