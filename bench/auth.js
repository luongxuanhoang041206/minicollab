import { once } from 'node:events';
import autocannon from 'autocannon';
import { createAuthHandlers } from '../src/handlers/auth.js';
import { createApp } from '../src/core/app.js';
import { createLogger } from '../src/core/logger.js';
import { createRouter } from '../src/core/router/index.js';
import { accessLog } from '../src/middleware/access-log.js';
import { authenticate, requireAuth } from '../src/middleware/authenticate.js';
import { cors } from '../src/middleware/cors.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { requestId } from '../src/middleware/request-id.js';
import { routerMiddleware } from '../src/middleware/router.js';
import { createPasswordHasher } from '../src/lib/password.js';
import { createTokenService } from '../src/lib/token.js';
import { createMemoryUserStore } from '../src/storage/memory-users.js';

const hashMode = process.env.AUTH_HASH_MODE ?? 'async';
const threadpoolSize = process.env.UV_THREADPOOL_SIZE ?? 'Node default';
const durationMs = Number(process.env.AUTH_BENCH_DURATION_MS ?? 3_000);
const secret = 'bench-only-secret-that-is-at-least-32-characters-long';

if (hashMode === 'sync' && process.env.NODE_ENV === 'production') {
  throw new Error('AUTH_HASH_MODE=sync is not allowed in production');
}

const hasher = createPasswordHasher({ N: 16_384, mode: hashMode });
const password = 'bench-password';
const passwordHash = await hasher.hash(password);

async function measure(label, operation, concurrency) {
  const start = performance.now();
  let count = 0;
  while (performance.now() - start < durationMs) {
    await Promise.all(
      Array.from({ length: concurrency }, () => operation()),
    );
    count += concurrency;
  }
  const elapsedSeconds = (performance.now() - start) / 1000;
  console.log(
    `${label} (${concurrency} concurrent): ${(count / elapsedSeconds).toFixed(1)} ops/s`,
  );
}

console.log(
  `scrypt N=16384 mode=${hashMode} UV_THREADPOOL_SIZE=${threadpoolSize} window=${durationMs}ms`,
);
for (const concurrency of [1, 4]) {
  await measure('hash', () => hasher.hash(password), concurrency);
  await measure('verify', () => hasher.verify(password, passwordHash), concurrency);
}

if (process.argv.includes('--http')) {
  const users = createMemoryUserStore();
  const user = await users.create({ email: 'bench@example.com', passwordHash });
  const tokens = createTokenService({ secret, ttlSeconds: 3600 });
  const auth = createAuthHandlers({
    users,
    hasher,
    tokens,
    ttlSeconds: 3600,
  });
  const router = createRouter();
  router.get('/health', (ctx) => ctx.json(200, { status: 'ok' }));
  router.get('/auth/me', requireAuth(auth.me));
  const verificationToken = tokens.sign({ sub: user.id });
  const verificationIterations = 100_000;
  const verificationStart = process.hrtime.bigint();
  for (let i = 0; i < verificationIterations; i += 1) {
    if (!tokens.verify(verificationToken).ok) {
      throw new Error('benchmark token verification unexpectedly failed');
    }
  }
  const verificationNs =
    Number(process.hrtime.bigint() - verificationStart) /
    verificationIterations;
  console.log(
    `token.verify (HMAC + claims validation): ${verificationNs.toFixed(0)} ns/op`,
  );

  const logger = createLogger({
    level: 'error',
    service: 'auth-bench',
    write: () => {},
  });
  const server = createApp({
    logger,
    middleware: [
      errorHandler(),
      requestId,
      accessLog(),
      authenticate({ tokens, users }),
      cors(),
      routerMiddleware(router),
    ],
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const token = tokens.sign({ sub: user.id });

  try {
    for (const [label, path, headers] of [
      ['health', '/health', {}],
      ['auth/me', '/auth/me', { Authorization: `Bearer ${token}` }],
    ]) {
      const result = await new Promise((resolve, reject) => {
        autocannon(
          {
            url: `http://127.0.0.1:${port}${path}`,
            connections: 100,
            duration: 10,
            headers,
          },
          (error, stats) => (error ? reject(error) : resolve(stats)),
        );
      });
      console.log(
        `${label}: ${Math.round(result.requests.average)} req/s, p99 ${result.latency.p99} ms, ${result.errors} errors`,
      );
    }
  } finally {
    server.closeAllConnections();
    const closed = once(server, 'close');
    server.close();
    await closed;
  }
}
