import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routerMiddleware } from '../../src/middleware/router.js';

test('routerMiddleware gán params và trả về promise của handler', async () => {
  const expectedParams = { id: '42' };
  const router = {
    match: () => ({
      type: 'found',
      params: expectedParams,
      handler: async (ctx) => {
        ctx.handled = true;
      },
    }),
  };
  const ctx = {
    req: { method: 'GET' },
    url: new URL('http://localhost/items/42'),
  };

  await routerMiddleware(router)(ctx);
  assert.equal(ctx.params, expectedParams);
  assert.equal(ctx.handled, true);
});

test('routerMiddleware chuyển các loại miss thành HttpError tương ứng', async () => {
  for (const [match, status, code] of [
    [{ type: 'method_not_allowed', allowed: ['GET'] }, 405, 'method_not_allowed'],
    [{ type: 'bad_request' }, 400, 'bad_path'],
    [{ type: 'not_found' }, 404, 'not_found'],
  ]) {
    await assert.rejects(
      routerMiddleware({ match: () => match })({
        req: { method: 'POST' },
        url: new URL('http://localhost/x'),
      }),
      { status, code },
    );
  }
});
