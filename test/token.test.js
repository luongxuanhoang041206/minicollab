import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTokenService } from '../src/lib/token.js';

const secret = 'test-only-token-secret-with-at-least-32-characters';
const fixedNow = () => 1_700_000_000_000;
const service = createTokenService({ secret, ttlSeconds: 60, now: fixedNow });

function signRawPayload(payload) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const input = `${header}.${payloadB64}`;
  const signature = createHmac('sha256', secret)
    .update(input)
    .digest('base64url');
  return `${input}.${signature}`;
}

test('sign tạo token có claims và verify trả claims đã kiểm chứng', () => {
  const token = service.sign({ sub: 'user-123' });

  assert.deepEqual(service.verify(token), {
    ok: true,
    claims: {
      sub: 'user-123',
      iat: 1_700_000_000,
      exp: 1_700_000_060,
    },
  });
});

test('verify từ chối token không phải string, sai số phần hoặc phần rỗng', () => {
  for (const token of [
    null,
    42,
    '',
    'one.two',
    'one.two.three.four',
    '.payload.signature',
    'header..signature',
    'header.payload.',
  ]) {
    assert.deepEqual(service.verify(token), {
      ok: false,
      error: 'malformed',
    });
  }
});

test('verify yêu cầu header đúng tuyệt đối', () => {
  const token = service.sign({ sub: 'user-123' });
  const [header, payload, signature] = token.split('.');
  const alteredHeader = `${header.slice(0, -1)}A`;

  assert.deepEqual(service.verify(`${alteredHeader}.${payload}.${signature}`), {
    ok: false,
    error: 'malformed',
  });
});

test('verify từ chối alg none và token thiếu chữ ký', () => {
  const header = Buffer.from(
    JSON.stringify({ alg: 'none', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: 'user-123', exp: 1_700_000_060 }),
  ).toString('base64url');

  assert.deepEqual(service.verify(`${header}.${payload}.`), {
    ok: false,
    error: 'malformed',
  });
  assert.deepEqual(service.verify(`${header}.${payload}`), {
    ok: false,
    error: 'malformed',
  });
});

test('verify báo bad_signature khi chữ ký sai hoặc sai độ dài', () => {
  const token = service.sign({ sub: 'user-123' });
  const [header, payload, signature] = token.split('.');
  const changedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;

  assert.deepEqual(
    service.verify(`${header}.${payload}.${changedSignature}`),
    { ok: false, error: 'bad_signature' },
  );
  assert.deepEqual(service.verify(`${header}.${payload}.AA`), {
    ok: false,
    error: 'bad_signature',
  });
});

test('thay sub mà giữ nguyên chữ ký sẽ thất bại', () => {
  const token = service.sign({ sub: 'user-123' });
  const [header, payload, signature] = token.split('.');
  const changedPayload = Buffer.from(
    JSON.stringify({
      sub: 'other-user',
      iat: 1_700_000_000,
      exp: 1_700_000_060,
    }),
  ).toString('base64url');

  assert.deepEqual(service.verify(`${header}.${changedPayload}.${signature}`), {
    ok: false,
    error: 'bad_signature',
  });
});

test('token ký bằng secret khác sẽ thất bại', () => {
  const otherService = createTokenService({
    secret: 'different-test-secret-with-at-least-32-characters',
    now: fixedNow,
  });

  assert.deepEqual(service.verify(otherService.sign({ sub: 'user-123' })), {
    ok: false,
    error: 'bad_signature',
  });
});

test('verify kiểm tra chữ ký trước khi parse payload', () => {
  const validToken = service.sign({ sub: 'user-123' });
  const [header, , signature] = validToken.split('.');
  const malformedPayload = Buffer.from('{invalid json').toString('base64url');

  assert.deepEqual(
    service.verify(`${header}.${malformedPayload}.${signature}`),
    { ok: false, error: 'bad_signature' },
  );
});

test('verify chỉ parse payload hợp lệ sau khi chữ ký đúng', () => {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from('{invalid json').toString('base64url');
  const input = `${header}.${payload}`;
  const signature = createHmac('sha256', secret)
    .update(input)
    .digest('base64url');

  assert.deepEqual(service.verify(`${input}.${signature}`), {
    ok: false,
    error: 'malformed',
  });
});

test('verify yêu cầu sub không rỗng và exp là số nguyên', () => {
  for (const payload of [
    { sub: '', exp: 1_700_000_060 },
    { sub: 123, exp: 1_700_000_060 },
    { sub: 'user-123', exp: '1700000060' },
    { sub: 'user-123', exp: 1.5 },
    null,
  ]) {
    assert.deepEqual(service.verify(signRawPayload(payload)), {
      ok: false,
      error: 'malformed',
    });
  }
});

test('verify trả expired khi exp bằng hoặc nhỏ hơn thời gian hiện tại', () => {
  const expiredService = createTokenService({
    secret,
    now: fixedNow,
  });
  for (const exp of [1_700_000_000, 1_699_999_999]) {
    assert.deepEqual(
      expiredService.verify(signRawPayload({ sub: 'user-123', exp })),
      { ok: false, error: 'expired' },
    );
  }
});

test('factory từ chối secret quá ngắn và TTL không hợp lệ', () => {
  assert.throws(() => createTokenService({ secret: 'too short' }), /secret/);
  for (const ttlSeconds of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => createTokenService({ secret, ttlSeconds }),
      /ttlSeconds/,
    );
  }
});