import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../src/core/pipeline.js';

const tick = () => new Promise((r) => setImmediate(r));

describe('compose', () => {
  it('chạy theo thứ tự củ hành', async () => {
    const trace = [];
    const mk = (name) => async (ctx, next) => { trace.push(`${name}>`); await next(); trace.push(`<${name}`); };
    await compose([mk('A'), mk('B'), mk('C')])({});
    assert.deepEqual(trace, ['A>', 'B>', 'C>', '<C', '<B', '<A']);
  });

  it('tất cả middleware dùng chung một ctx', async () => {
    const ctx = {};
    await compose([async (c, next) => { c.a = 1; await next(); }, async (c) => { c.b = c.a + 1; }])(ctx);
    assert.deepEqual(ctx, { a: 1, b: 2 });
  });

  it('không gọi next() thì phần sau không chạy (short-circuit)', async () => {
    const trace = [];
    await compose([
      async () => { trace.push('A'); },
      async () => { trace.push('B'); },
    ])({});
    assert.deepEqual(trace, ['A']);
  });

  it('next() đợi phần sau hoàn tất, kể cả bất đồng bộ', async () => {
    const trace = [];
    await compose([
      async (c, next) => { await next(); trace.push('A sau'); },
      async () => { await tick(); trace.push('B xong'); },
    ])({});
    assert.deepEqual(trace, ['B xong', 'A sau']);
  });

  it('lỗi ở middleware sâu nổi lên middleware ngoài (try/catch bắt được)', async () => {
    let caught;
    await compose([
      async (c, next) => { try { await next(); } catch (e) { caught = e; } },
      async () => { throw new Error('boom'); },
    ])({});
    assert.equal(caught.message, 'boom');
  });

  it('middleware throw đồng bộ cũng thành Promise bị reject', async () => {
    await assert.rejects(compose([() => { throw new Error('sync'); }])({}), /sync/);
  });

  it('lỗi không được bắt thì compose bị reject', async () => {
    await assert.rejects(compose([async (c, next) => next(), async () => { throw new Error('x'); }])({}), /x/);
  });

  it('middleware bắt lỗi rồi thì middleware ngoài hơn không thấy lỗi', async () => {
    const trace = [];
    await compose([
      async (c, next) => { try { await next(); trace.push('A ok'); } catch { trace.push('A bắt'); } },
      async (c, next) => { try { await next(); } catch (e) { trace.push('B bắt'); } },
      async () => { throw new Error('x'); },
    ])({});
    assert.deepEqual(trace, ['B bắt', 'A ok']);
  });

  it('gọi next() hai lần → reject với lỗi nêu rõ', async () => {
    await assert.rejects(
      compose([async (c, next) => { await next(); await next(); }, async () => {}])({}),
      /next\(\) (was )?called (multiple times|more than once)|nhiều lần/i,
    );
  });

  it('next() hai lần ở middleware KHÁC nhau không gây nhầm lẫn', async () => {
    const trace = [];
    await compose([
      async (c, next) => { trace.push('A'); await next(); },
      async (c, next) => { trace.push('B'); await next(); },
      async () => { trace.push('C'); },
    ])({});
    assert.deepEqual(trace, ['A', 'B', 'C']);
  });

  it('mảng rỗng chạy được', async () => {
    await compose([])({});
  });

  it('phần tử không phải function → TypeError ngay lúc compose', () => {
    assert.throws(() => compose([async () => {}, 'oops']), TypeError);
    assert.throws(() => compose('không phải mảng'), TypeError);
  });

  it('compose có thể dùng lại nhiều lần, mỗi lần độc lập (next() không rò state)', async () => {
    const run = compose([async (c, next) => { await next(); c.n = (c.n ?? 0) + 1; }, async () => {}]);
    const a = {}; const b = {};
    await Promise.all([run(a), run(b)]);
    assert.equal(a.n, 1);
    assert.equal(b.n, 1);
  });

  it('thay đổi mảng gốc sau compose không ảnh hưởng pipeline', async () => {
    const list = [async (c) => { c.hit = true; }];
    const run = compose(list);
    list.length = 0;
    const ctx = {};
    await run(ctx);
    assert.equal(ctx.hit, true);
  });
});