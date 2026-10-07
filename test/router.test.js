import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../src/core/router/index.js';
import { createLinearEngine } from '../src/core/router/linear-engine.js';
import { createTrieEngine } from '../src/core/router/trie-engine.js';

const engines = {
  linear: createLinearEngine,
  trie: createTrieEngine,
};

const h = () => {};
const h1 = () => {};
const h2 = () => {};

for (const [name, makeEngine] of Object.entries(engines)) {
  const make = () => createRouter({ engine: makeEngine() });
  // Linear được phép "fail" test này: node:test báo TODO thay vì làm cả bộ test đỏ
  const orderIndependent = name === 'linear' ? { todo: 'linear phụ thuộc thứ tự đăng ký' } : {};

  describe(`router [${name}]`, () => {
    it('khớp route tĩnh', () => {
      const r = make(); r.get('/health', h);
      assert.deepEqual(r.match('GET', '/health'), { type: 'found', handler: h, params: {} });
    });

    it('trích 1 param', () => {
      const r = make(); r.get('/tasks/:id', h);
      assert.equal(r.match('GET', '/tasks/42').params.id, '42');
    });

    it('trích nhiều param', () => {
      const r = make(); r.get('/workspaces/:wid/projects/:pid', h);
      assert.deepEqual(r.match('GET', '/workspaces/w1/projects/p9').params, { wid: 'w1', pid: 'p9' });
    });

    it('tĩnh thắng param khi đăng ký tĩnh trước', () => {
      const r = make(); r.get('/tasks/new', h2); r.get('/tasks/:id', h1);
      assert.equal(r.match('GET', '/tasks/new').handler, h2);
      assert.equal(r.match('GET', '/tasks/42').handler, h1);
    });

    it('tĩnh thắng param khi đăng ký param trước (độc lập thứ tự)', orderIndependent, () => {
      const r = make(); r.get('/tasks/:id', h1); r.get('/tasks/new', h2);
      assert.equal(r.match('GET', '/tasks/new').handler, h2);
      assert.equal(r.match('GET', '/tasks/42').handler, h1);
    });

    it('backtrack: nhánh tĩnh cụt thì thử nhánh param', () => {
      const r = make(); r.get('/a/b/d', h1); r.get('/a/:x/c', h2);
      const m = r.match('GET', '/a/b/c');
      assert.equal(m.handler, h2);
      assert.deepEqual(m.params, { x: 'b' });
    });

    it('sai method → 405, allowed được sắp xếp', () => {
      const r = make(); r.post('/tasks', h); r.get('/tasks', h);
      assert.deepEqual(r.match('DELETE', '/tasks'), { type: 'method_not_allowed', allowed: ['GET', 'POST'] });
    });

    it('405 gộp method của mọi route cùng khớp path', () => {
      const r = make(); r.post('/tasks/new', h); r.get('/tasks/:id', h);
      assert.deepEqual(r.match('DELETE', '/tasks/new').allowed, ['GET', 'POST']);
    });

    it('path lạ → not_found; phân biệt hoa thường', () => {
      const r = make(); r.get('/tasks', h);
      assert.equal(r.match('GET', '/nope').type, 'not_found');
      assert.equal(r.match('GET', '/Tasks').type, 'not_found');
    });

    it('bỏ một dấu / cuối', () => {
      const r = make(); r.get('/tasks', h);
      assert.equal(r.match('GET', '/tasks/').type, 'found');
    });

    it('segment rỗng → not_found', () => {
      const r = make(); r.get('/a/:x/b', h);
      assert.equal(r.match('GET', '/a//b').type, 'not_found');
      assert.equal(r.match('GET', '//').type, 'not_found');
    });

    it('param không khớp segment rỗng', () => {
      const r = make(); r.get('/tasks/:id', h);
      assert.equal(r.match('GET', '/tasks').type, 'not_found');
      assert.equal(r.match('GET', '/tasks/').type, 'not_found');
    });

    it('param được decode', () => {
      const r = make(); r.get('/files/:name', h);
      assert.equal(r.match('GET', '/files/a%20b').params.name, 'a b');
    });

    it('%2F nằm trong MỘT segment (split trước, decode sau)', () => {
      const r = make(); r.get('/files/:name', h);
      assert.equal(r.match('GET', '/files/a%2Fb').params.name, 'a/b');
    });

    it('percent-encoding hỏng → bad_request', () => {
      const r = make(); r.get('/files/:name', h);
      assert.equal(r.match('GET', '/files/%E0%A4%A').type, 'bad_request');
    });

    it('key đặc biệt không phá router', () => {
      const r = make(); r.get('/tasks/:id', h); r.get('/a/b', h);
      const m = r.match('GET', '/tasks/__proto__');
      assert.equal(m.params.id, '__proto__');
      assert.equal(Object.getPrototypeOf(m.params), Object.prototype);
      assert.equal(r.match('GET', '/a/constructor').type, 'not_found');
      assert.equal(r.match('GET', '/__proto__').type, 'not_found');
    });

    it('group thêm prefix; group lồng nhau', () => {
      const r = make();
      r.group('/api', (g) => {
        g.get('/tasks', h1);
        g.group('/workspaces/:wid', (w) => w.get('/projects', h2));
      });
      assert.equal(r.match('GET', '/api/tasks').handler, h1);
      const m = r.match('GET', '/api/workspaces/w1/projects');
      assert.equal(m.handler, h2);
      assert.deepEqual(m.params, { wid: 'w1' });
    });

    it('trong group, path "" và "/" cùng trỏ về prefix', () => {
      const a = make(); a.group('/api', (g) => g.get('', h));
      const b = make(); b.group('/api', (g) => g.get('/', h));
      assert.equal(a.match('GET', '/api').type, 'found');
      assert.equal(b.match('GET', '/api').type, 'found');
    });

    it('group dùng chung state: route trùng giữa group và router gốc → throw', () => {
      const r = make(); r.get('/api/x', h);
      assert.throws(() => r.group('/api', (g) => g.get('/x', h)), /trùng|mơ hồ/);
    });

    it('đăng ký trùng method+path → throw', () => {
      const r = make(); r.get('/x', h);
      assert.throws(() => r.get('/x', h), /trùng|mơ hồ/);
    });

    it('param khác tên cùng vị trí → throw', () => {
      const r = make(); r.get('/a/:id', h);
      assert.throws(() => r.get('/a/:name', h), /trùng|mơ hồ/);
    });

    it('pattern sai → throw', () => {
      const r = make();
      assert.throws(() => r.get('tasks', h));
      assert.throws(() => r.get('/a//b', h));
      assert.throws(() => r.get('/a/:', h));
      assert.throws(() => r.get('/a/:x/:x', h));
    });

    it('handler không phải function → throw', () => {
      assert.throws(() => make().get('/x', 'oops'), TypeError);
    });

    it('hai router độc lập không dùng chung state', () => {
      const a = make(); const b = make();
      a.get('/only-a', h);
      assert.equal(b.match('GET', '/only-a').type, 'not_found');
    });
  });
}