import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemoryUserStore,
  DuplicateEmailError,
} from '../src/storage/memory-users.js';

describe('memory user store', () => {
  it('creates and retrieves users through the async interface', async () => {
    const store = createMemoryUserStore();
    const user = await store.create({
      email: 'User@Example.com',
      passwordHash: 'scrypt$hash',
    });

    assert.deepEqual(Object.keys(user).sort(), [
      'createdAt',
      'email',
      'id',
      'passwordHash',
    ]);
    assert.match(user.id, /^[0-9a-f-]{36}$/);
    assert.equal(user.email, 'user@example.com');
    assert.equal(user.passwordHash, 'scrypt$hash');
    assert.ok(user.createdAt instanceof Date);
    assert.deepEqual(await store.findById(user.id), user);
    assert.deepEqual(await store.findByEmail(' user@EXAMPLE.com '), user);
  });

  it('returns null for users that do not exist', async () => {
    const store = createMemoryUserStore();
    assert.equal(await store.findById('missing'), null);
    assert.equal(await store.findByEmail('missing@example.com'), null);
  });

  it('treats trimmed, case-insensitive email addresses as duplicates', async () => {
    const store = createMemoryUserStore();
    await store.create({
      email: ' User@Example.com ',
      passwordHash: 'hash-one',
    });

    await assert.rejects(
      store.create({
        email: 'user@example.com',
        passwordHash: 'hash-two',
      }),
      (error) => {
        assert.ok(error instanceof DuplicateEmailError);
        assert.equal(error.name, 'DuplicateEmailError');
        assert.equal(error.message, 'Email đã tồn tại');
        assert.equal(error.email, 'user@example.com');
        return true;
      },
    );
  });

  it('keeps duplicate check and insertion atomic across concurrent calls', async () => {
    const store = createMemoryUserStore();
    const results = await Promise.allSettled([
      store.create({ email: 'same@example.com', passwordHash: 'first' }),
      store.create({ email: ' SAME@example.com ', passwordHash: 'second' }),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.ok(rejected.reason instanceof DuplicateEmailError);
  });

  it('does not expose mutable stored records to callers', async () => {
    const store = createMemoryUserStore();
    const user = await store.create({
      email: 'user@example.com',
      passwordHash: 'hash',
    });
    user.email = 'changed@example.com';
    user.createdAt.setFullYear(2000);

    const stored = await store.findById(user.id);
    assert.equal(stored.email, 'user@example.com');
    assert.notEqual(stored.createdAt.getFullYear(), 2000);
  });
});
