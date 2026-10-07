import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPasswordHasher } from '../src/lib/password.js';

const hasher = createPasswordHasher({ N: 1024 });   // nhẹ cho test

describe('password hasher', () => {
  it('hash rồi verify đúng mật khẩu → true', async () => {
    const h = await hasher.hash('correct horse');
    assert.equal(await hasher.verify('correct horse', h), true);
  });

  it('sai mật khẩu → false', async () => {
    const hash = await hasher.hash('correct horse');
    assert.equal(await hasher.verify('wrong password', hash), false);
  });
  it('cùng mật khẩu băm hai lần cho hai chuỗi khác nhau (salt)', async () => {
    const first = await hasher.hash('correct horse');
    const second = await hasher.hash('correct horse');
    assert.notEqual(first, second);
    assert.equal(await hasher.verify('correct horse', first), true);
    assert.equal(await hasher.verify('correct horse', second), true);
  });
  it('chuỗi hash bắt đầu bằng "scrypt$" và không chứa mật khẩu gốc', async () => {
    const password = 'correct horse';
    const hash = await hasher.hash(password);
    assert.match(hash, /^scrypt\$1024\$8\$1\$/);
    assert.equal(hash.includes(password), false);
  });
  it('verify chuỗi hỏng → false, không throw', async () => {
    for (const bad of [
      '',
      'abc',
      'scrypt$x$y',
      'bcrypt$1$2$3$4$5',
      'scrypt$1024$8$1$@@$@@',
      'scrypt$1073741824$8$1$YWJj$YWJj',
    ])
      assert.equal(await hasher.verify('x', bad), false);
  });
  it('hash cũ (N khác) vẫn verify được bởi hasher có N khác', async () => {
    const oldHasher = createPasswordHasher({ N: 1024 });
    const currentHasher = createPasswordHasher({ N: 2048 });
    const oldHash = await oldHasher.hash('correct horse');
    assert.equal(await currentHasher.verify('correct horse', oldHash), true);
  });
  it('mật khẩu Unicode (tiếng Việt, emoji) hoạt động', async () => {
    const password = 'Mật khẩu 🔐 tiếng Việt';
    const hash = await hasher.hash(password);
    assert.equal(await hasher.verify(password, hash), true);
    assert.equal(await hasher.verify('Mat khau 🔐 tiếng Việt', hash), false);
  });
  it('chế độ sync của lab vẫn tạo và verify được hash', async () => {
    const syncHasher = createPasswordHasher({ N: 1024, mode: 'sync' });
    const hash = await syncHasher.hash('correct horse');
    assert.equal(await syncHasher.verify('correct horse', hash), true);
  });
});