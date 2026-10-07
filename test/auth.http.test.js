import http from 'node:http';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthHandlers } from '../src/handlers/auth.js';
import { createLogger } from '../src/core/logger.js';
import { registerRoutes } from '../src/routes.js';
import { createRouter } from '../src/core/router/index.js';
import { authenticate } from '../src/middleware/authenticate.js';
import { createPasswordHasher } from '../src/lib/password.js';
import { createTokenService } from '../src/lib/token.js';
import { createMemoryUserStore } from '../src/storage/memory-users.js';
import { buildTestApp, startTestServer } from './helpers/server.js';

const secret = 'test-only-auth-secret-that-is-at-least-32-characters';

function makeToken(payload, signingSecret = secret, header = { alg: 'HS256', typ: 'JWT' }) {
  const headerPart = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = createHmac('sha256', signingSecret)
    .update(signingInput)
    .digest('base64url');
  return `${signingInput}.${signature}`;
}

async function makeAuthServer({
  now = () => Date.now(),
  userLookupStore,
  logger,
} = {}) {
  const users = createMemoryUserStore();
  const hasher = createPasswordHasher({ N: 1_024 });
  const tokens = createTokenService({ secret, ttlSeconds: 60, now });
  const auth = createAuthHandlers({
    users,
    hasher,
    tokens,
    ttlSeconds: 60,
  });
  const router = createRouter();
  const config = { env: 'test', corsOrigins: [] };
  registerRoutes(router, { config, auth });

  const server = await startTestServer(
    buildTestApp({
      router,
      config,
      logger,
      authentication: [
        authenticate({ tokens, users: userLookupStore ?? users }),
      ],
    }),
  );
  return { ...server, users, hasher, tokens, auth };
}

async function register(server, body) {
  return fetch(`${server.url}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function login(server, body, headers = {}) {
  return fetch(`${server.url}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('registration returns only public user fields', async () => {
  const server = await makeAuthServer();
  try {
    const response = await register(server, {
      email: 'A@x.com',
      password: 'correct horse',
    });
    const body = await response.text();

    assert.equal(response.status, 201);
    const parsed = JSON.parse(body);
    assert.equal(typeof parsed.user.id, 'string');
    assert.equal(parsed.user.email, 'a@x.com');
    assert.equal(Object.hasOwn(parsed.user, 'password'), false);
    assert.equal(Object.hasOwn(parsed.user, 'passwordHash'), false);
    assert.equal(body.includes('scrypt$'), false);
  } finally {
    await server.close();
  }
});

test('duplicate registration is case-insensitive and returns 409', async () => {
  const server = await makeAuthServer();
  try {
    assert.equal(
      (await register(server, { email: 'A@x.com', password: 'correct horse' }))
        .status,
      201,
    );
    assert.equal(
      (await register(server, { email: 'a@x.com', password: 'correct horse' }))
        .status,
      409,
    );
  } finally {
    await server.close();
  }
});

test('20 concurrent registrations create exactly one account', async () => {
  const server = await makeAuthServer();
  try {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        register(server, {
          email: 'race@x.com',
          password: 'correct horse',
        }),
      ),
    );

    assert.equal(
      responses.filter((response) => response.status === 201).length,
      1,
    );
    assert.equal(
      responses.filter((response) => response.status === 409).length,
      19,
    );
    assert.ok(await server.users.findByEmail('race@x.com'));
  } finally {
    await server.close();
  }
});

test('registration validates required fields, email and password', async () => {
  const server = await makeAuthServer();
  try {
    for (const [body, expectedFields] of [
      [{}, ['email', 'password']],
      [{ email: 'not-an-email', password: 'correct horse' }, ['email']],
      [{ email: 'a@x.com', password: 'short' }, ['password']],
    ]) {
      const response = await register(server, body);
      const payload = await response.json();
      assert.equal(response.status, 400);
      assert.equal(payload.error.code, 'validation_failed');
      assert.deepEqual(Object.keys(payload.error.details).sort(), expectedFields);
    }
  } finally {
    await server.close();
  }
});

test('registration rejects non-object JSON bodies', async () => {
  const server = await makeAuthServer();
  try {
    for (const body of ['[]', '"x"']) {
      const response = await fetch(`${server.url}/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      const payload = await response.json();
      assert.equal(response.status, 400);
      assert.equal(payload.error.code, 'validation_failed');
      assert.ok(payload.error.details.body);
    }
  } finally {
    await server.close();
  }
});

test('valid login returns bearer token and disables caching', async () => {
  const server = await makeAuthServer();
  try {
    await register(server, { email: 'a@x.com', password: 'correct horse' });
    const response = await login(server, {
      email: 'a@x.com',
      password: 'correct horse',
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(typeof body.token, 'string');
    assert.equal(body.tokenType, 'Bearer');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    await server.close();
  }
});

test('wrong password and unknown email return identical status and body', async () => {
  const server = await makeAuthServer();
  try {
    await register(server, { email: 'a@x.com', password: 'correct horse' });
    const wrongPassword = await login(server, {
      email: 'a@x.com',
      password: 'incorrect horse',
    });
    const unknownEmail = await login(server, {
      email: 'missing@x.com',
      password: 'incorrect horse',
    });

    assert.equal(wrongPassword.status, unknownEmail.status);
    assert.deepEqual(await wrongPassword.json(), await unknownEmail.json());
  } finally {
    await server.close();
  }
});

test('GET /auth/me requires Bearer auth and returns public user', async () => {
  const server = await makeAuthServer();
  try {
    const missing = await fetch(`${server.url}/auth/me`);
    assert.equal(missing.status, 401);
    assert.equal(missing.headers.get('www-authenticate'), 'Bearer');

    await register(server, { email: 'a@x.com', password: 'correct horse' });
    const loginResponse = await login(server, {
      email: 'a@x.com',
      password: 'correct horse',
    });
    const { token } = await loginResponse.json();
    const response = await fetch(`${server.url}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    const user = JSON.parse(body).user;
    assert.equal(user.email, 'a@x.com');
    assert.equal(Object.hasOwn(user, 'passwordHash'), false);
    assert.equal(body.includes('scrypt$'), false);
  } finally {
    await server.close();
  }
});

test('invalid signature is rejected on protected and public routes', async () => {
  const server = await makeAuthServer();
  try {
    const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSJ9.AA';
    for (const path of ['/auth/me', '/health']) {
      const response = await fetch(`${server.url}${path}`, {
        headers: { Authorization: `Bearer ${invalidToken}` },
      });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, 'invalid_token');
    }
    assert.equal((await fetch(`${server.url}/health`)).status, 200);
  } finally {
    await server.close();
  }
});

test('forged subject, alg none and wrong-secret tokens return invalid_token', async () => {
  const server = await makeAuthServer();
  try {
    const user = await server.users.create({
      email: 'a@x.com',
      passwordHash: 'not-used-here',
    });
    const validToken = server.tokens.sign({ sub: user.id });
    const [headerPart, payloadPart, signaturePart] = validToken.split('.');
    const changedPayload = Buffer.from(
      JSON.stringify({ sub: 'another-user', iat: 1, exp: 4_000_000_000 }),
    ).toString('base64url');
    const forgedSubject = `${headerPart}.${changedPayload}.${signaturePart}`;
    const algNoneToken = makeToken(
      { sub: user.id, iat: 1, exp: 4_000_000_000 },
      secret,
      { alg: 'none', typ: 'JWT' },
    );
    const wrongSecretToken = makeToken(
      { sub: user.id, iat: 1, exp: 4_000_000_000 },
      'different-secret-for-this-forgery-test-only',
    );

    for (const token of [forgedSubject, algNoneToken, wrongSecretToken]) {
      const response = await fetch(`${server.url}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, 'invalid_token');
    }
  } finally {
    await server.close();
  }
});

test('truncated and empty Bearer tokens return 401 without crashing server', async () => {
  const server = await makeAuthServer();
  try {
    const token = server.tokens.sign({ sub: 'missing-user' });
    const truncated = token.split('.');
    truncated[2] = truncated[2].slice(0, 5);

    for (const value of [truncated.join('.'), '']) {
      const response = await fetch(`${server.url}/auth/me`, {
        headers: { Authorization: `Bearer ${value}` },
      });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, 'invalid_token');
    }
    assert.equal((await fetch(`${server.url}/health`)).status, 200);
  } finally {
    await server.close();
  }
});

test('expired token maps to 401 token_expired without waiting', async () => {
  let nowMs = 1_700_000_000_000;
  const server = await makeAuthServer({ now: () => nowMs });
  try {
    const user = await server.users.create({
      email: 'a@x.com',
      passwordHash: 'not-used-here',
    });
    const token = server.tokens.sign({ sub: user.id });
    nowMs = 1_700_000_061_000;

    const response = await fetch(`${server.url}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    assert.equal((await response.json()).error.code, 'token_expired');
  } finally {
    await server.close();
  }
});

test('Basic auth and missing users are rejected', async () => {
  const server = await makeAuthServer({
    userLookupStore: { findById: async () => null },
  });
  try {
    const basic = await fetch(`${server.url}/auth/me`, {
      headers: { Authorization: 'Basic abc' },
    });
    assert.equal(basic.status, 401);

    const token = server.tokens.sign({ sub: 'deleted-user' });
    const missingUser = await fetch(`${server.url}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(missingUser.status, 401);
    assert.equal((await missingUser.json()).error.code, 'invalid_token');
  } finally {
    await server.close();
  }
});

test('authenticated access log includes requestId and userId', async () => {
  const entries = [];
  const logger = createLogger({
    level: 'info',
    service: 'test',
    write: (line) => entries.push(JSON.parse(line)),
  });
  const server = await makeAuthServer({ logger });
  try {
    const registered = await register(server, {
      email: 'a@x.com',
      password: 'correct horse',
    });
    const { user } = await registered.json();
    const loggedIn = await login(server, {
      email: 'a@x.com',
      password: 'correct horse',
    });
    const { token } = await loggedIn.json();
    const response = await fetch(`${server.url}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-request-id': 'auth-request-1',
      },
    });
    await response.arrayBuffer();
    await new Promise((resolve) => setImmediate(resolve));

    const accessEntry = entries.find(
      (entry) =>
        entry.msg === 'access_log' &&
        entry.path === '/auth/me' &&
        entry.requestId === 'auth-request-1',
    );
    assert.ok(accessEntry);
    assert.equal(accessEntry.userId, user.id);
  } finally {
    await server.close();
  }
});

test('100 KB Authorization header is rejected as 4xx and server stays responsive', async () => {
  const server = await makeAuthServer();
  try {
    const status = await new Promise((resolve, reject) => {
      const request = http.get(
        `${server.url}/health`,
        { headers: { Authorization: `Bearer ${'a'.repeat(100_000)}` } },
        (response) => {
          response.resume();
          response.once('end', () => resolve(response.statusCode));
        },
      );
      request.setTimeout(2_000, () => {
        request.destroy(new Error('large authorization request timed out'));
      });
      request.once('error', reject);
    });

    assert.ok(status >= 400 && status < 500);
    assert.equal((await fetch(`${server.url}/health`)).status, 200);
  } finally {
    await server.close();
  }
});
